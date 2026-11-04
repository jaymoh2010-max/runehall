import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole, getCharacter } from "../access";
import { monsters } from "../compendium";
import {
  db,
  type CampaignRow,
  type CharacterRow,
  type EncounterCombatantRow,
  type EncounterRow,
  type SceneRow,
  type TokenRow,
} from "../db";
import {
  serializeEncounter,
  serializeEncounterCombatant,
  serializeToken,
  touchCampaign,
} from "../serialize";
import type { InitiativeEntry } from "../../shared/types";
import { rollFormula } from "../../shared/dice";
import { sortInitiativeEntries } from "../../shared/initiative";
import { clamp, newId, now, safeInt, safeString, sanitizeUserText } from "../util";

function gmRequires(
  request: { user: { id: string } | null },
  campaignId: string,
): { row: CampaignRow | null; error?: string; code?: number } {
  if (!request.user) return { row: null, error: "Sign in to continue.", code: 401 };
  const row = getCampaign(campaignId);
  if (!row) return { row: null, error: "Campaign not found.", code: 404 };
  if (getCampaignRole(campaignId, request.user.id) !== "gm") {
    return { row: null, error: "Only the GM can prepare encounters.", code: 403 };
  }
  return { row };
}

function getEncounter(campaignId: string, encounterId: string): EncounterRow | null {
  return (
    (db
      .prepare("SELECT * FROM encounters WHERE id = ? AND campaign_id = ?")
      .get(encounterId, campaignId) as EncounterRow | undefined) ?? null
  );
}

function getCombatant(encounterId: string, combatantId: string): EncounterCombatantRow | null {
  return (
    (db
      .prepare("SELECT * FROM encounter_combatants WHERE id = ? AND encounter_id = ?")
      .get(combatantId, encounterId) as EncounterCombatantRow | undefined) ?? null
  );
}

function sceneBelongs(sceneId: string, campaignId: string): SceneRow | null {
  return (
    (db
      .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
      .get(sceneId, campaignId) as SceneRow | undefined) ?? null
  );
}

function ensureState(campaignId: string) {
  const existing = db
    .prepare("SELECT * FROM campaign_state WHERE campaign_id = ?")
    .get(campaignId) as
    | {
        campaign_id: string;
        active_scene_id: string | null;
        initiative: string;
        round: number;
        turn_index: number;
      }
    | undefined;
  if (existing) return existing;
  const firstScene = db
    .prepare("SELECT id FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC LIMIT 1")
    .get(campaignId) as { id: string } | undefined;
  db.prepare(
    "INSERT INTO campaign_state (campaign_id, active_scene_id, initiative, round, turn_index, updated_at) VALUES (?, ?, '[]', 1, 0, ?)",
  ).run(campaignId, firstScene?.id ?? null, now());
  return db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(campaignId) as {
    campaign_id: string;
    active_scene_id: string | null;
    initiative: string;
    round: number;
    turn_index: number;
  };
}

function tokenInitiativeBonus(token: TokenRow): number {
  if (token.initiative_bonus !== null) return token.initiative_bonus;
  if (!token.character_id) return 0;
  const character = getCharacter(token.character_id);
  if (!character?.summary) return 0;
  try {
    const summary = JSON.parse(character.summary) as { perception?: number };
    return typeof summary.perception === "number" ? summary.perception : 0;
  } catch {
    return 0;
  }
}

function initiativeEntryForToken(token: TokenRow): InitiativeEntry {
  return {
    id: newId("init"),
    tokenId: token.id,
    name: token.name,
    initiative: (rollFormula("1d20", {}).d20 ?? 10) + tokenInitiativeBonus(token),
    color: token.color,
    ownerId: token.owner_id,
    sceneId: token.scene_id,
    perception: tokenInitiativeBonus(token),
  };
}

function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return sortInitiativeEntries(entries);
}

function nextSortOrder(table: "encounters" | "encounter_combatants", column: string, id: string): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM ${table} WHERE ${column} = ?`)
    .get(id) as { next: number };
  return row.next;
}

export async function registerEncounterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/encounters", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const rows = db
      .prepare("SELECT * FROM encounters WHERE campaign_id = ? ORDER BY sort_order ASC, updated_at DESC")
      .all(id) as EncounterRow[];
    return reply.send({ encounters: rows.map(serializeEncounter) });
  });

  app.post("/api/campaigns/:id/encounters", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "New encounter", 100);
    const description = sanitizeUserText(body.description, 4000);
    const sceneId =
      typeof body.sceneId === "string" && body.sceneId && sceneBelongs(body.sceneId, id)
        ? body.sceneId
        : null;
    const encounterId = newId("enc");
    const ts = now();
    db.prepare(
      `INSERT INTO encounters (id, campaign_id, name, description, scene_id, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      encounterId,
      id,
      name,
      description,
      sceneId,
      nextSortOrder("encounters", "campaign_id", id),
      ts,
      ts,
    );
    touchCampaign(id);
    return reply.code(201).send({ encounter: serializeEncounter(getEncounter(id, encounterId)!) });
  });

  app.patch("/api/campaigns/:id/encounters/:encounterId", async (request, reply) => {
    const { id, encounterId } = request.params as { id: string; encounterId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getEncounter(id, encounterId);
    if (!existing) return reply.code(404).send({ error: "Encounter not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = body.name === undefined ? existing.name : safeString(body.name, existing.name, 100);
    const description =
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 4000);
    let sceneId = existing.scene_id;
    if (body.sceneId !== undefined) {
      sceneId =
        typeof body.sceneId === "string" && body.sceneId && sceneBelongs(body.sceneId, id)
          ? body.sceneId
          : null;
    }
    db.prepare(
      "UPDATE encounters SET name = ?, description = ?, scene_id = ?, updated_at = ? WHERE id = ?",
    ).run(name, description, sceneId, now(), encounterId);
    touchCampaign(id);
    return reply.send({ encounter: serializeEncounter(getEncounter(id, encounterId)!) });
  });

  app.delete("/api/campaigns/:id/encounters/:encounterId", async (request, reply) => {
    const { id, encounterId } = request.params as { id: string; encounterId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    if (!getEncounter(id, encounterId)) return reply.code(404).send({ error: "Encounter not found." });
    db.prepare("DELETE FROM encounters WHERE id = ?").run(encounterId);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/encounters/:encounterId/combatants", async (request, reply) => {
    const { id, encounterId } = request.params as { id: string; encounterId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const encounter = getEncounter(id, encounterId);
    if (!encounter) return reply.code(404).send({ error: "Encounter not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const count = clamp(safeInt(body.count, 1, 1, 50), 1, 50);
    let monsterId: string | null = null;
    let name = safeString(body.name, "Combatant", 100);
    let level = clamp(safeInt(body.level, 1, -1, 30), -1, 30);
    let hp: number | null = null;
    let ac: number | null = null;
    let perception: number | null = null;

    if (typeof body.monsterId === "string" && body.monsterId) {
      const monster = monsters.find((entry) => entry.id === body.monsterId);
      if (!monster) return reply.code(404).send({ error: "Monster not found in the bestiary." });
      monsterId = monster.id;
      name = safeString(body.name, monster.name, 100);
      level = monster.level;
      hp = monster.hp;
      ac = monster.ac;
      perception = monster.perception;
    } else {
      if (!safeString(body.name, "", 100)) {
        return reply.code(400).send({ error: "Give the combatant a name." });
      }
      if (body.hp !== undefined && body.hp !== null) hp = safeInt(body.hp, 0, 0, 1_000_000);
      if (body.ac !== undefined && body.ac !== null) ac = safeInt(body.ac, 0, -100, 1000);
      if (body.perception !== undefined && body.perception !== null) {
        perception = safeInt(body.perception, 0, -100, 1000);
      }
    }

    const combatantId = newId("encm");
    const ts = now();
    db.prepare(
      `INSERT INTO encounter_combatants
        (id, encounter_id, monster_id, name, level, count, hp, ac, perception, notes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      combatantId,
      encounterId,
      monsterId,
      name,
      level,
      count,
      hp,
      ac,
      perception,
      sanitizeUserText(body.notes, 2000),
      nextSortOrder("encounter_combatants", "encounter_id", encounterId),
      ts,
      ts,
    );
    db.prepare("UPDATE encounters SET updated_at = ? WHERE id = ?").run(ts, encounterId);
    touchCampaign(id);
    return reply.code(201).send({
      combatant: serializeEncounterCombatant(getCombatant(encounterId, combatantId)!),
    });
  });

  app.patch(
    "/api/campaigns/:id/encounters/:encounterId/combatants/:combatantId",
    async (request, reply) => {
      const { id, encounterId, combatantId } = request.params as {
        id: string;
        encounterId: string;
        combatantId: string;
      };
      const access = gmRequires(request, id);
      if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
      const existing = getCombatant(encounterId, combatantId);
      if (!existing) return reply.code(404).send({ error: "Combatant not found." });
      const body = (request.body ?? {}) as Record<string, unknown>;
      const count =
        body.count === undefined ? existing.count : clamp(safeInt(body.count, existing.count, 1, 50), 1, 50);
      const name =
        body.name === undefined ? existing.name : safeString(body.name, existing.name, 100);
      const level =
        body.level === undefined
          ? existing.level
          : clamp(safeInt(body.level, existing.level, -1, 30), -1, 30);
      const hp =
        body.hp === undefined ? existing.hp : body.hp === null ? null : safeInt(body.hp, 0, 0, 1_000_000);
      const ac =
        body.ac === undefined ? existing.ac : body.ac === null ? null : safeInt(body.ac, 0, -100, 1000);
      const perception =
        body.perception === undefined
          ? existing.perception
          : body.perception === null
            ? null
            : safeInt(body.perception, 0, -100, 1000);
      const notes =
        body.notes === undefined ? existing.notes : sanitizeUserText(body.notes, 2000);
      db.prepare(
        `UPDATE encounter_combatants
         SET name = ?, level = ?, count = ?, hp = ?, ac = ?, perception = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      ).run(name, level, count, hp, ac, perception, notes, now(), combatantId);
      db.prepare("UPDATE encounters SET updated_at = ? WHERE id = ?").run(now(), encounterId);
      touchCampaign(id);
      return reply.send({
        combatant: serializeEncounterCombatant(getCombatant(encounterId, combatantId)!),
      });
    },
  );

  app.delete(
    "/api/campaigns/:id/encounters/:encounterId/combatants/:combatantId",
    async (request, reply) => {
      const { id, encounterId, combatantId } = request.params as {
        id: string;
        encounterId: string;
        combatantId: string;
      };
      const access = gmRequires(request, id);
      if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
      if (!getCombatant(encounterId, combatantId)) {
        return reply.code(404).send({ error: "Combatant not found." });
      }
      db.prepare("DELETE FROM encounter_combatants WHERE id = ?").run(combatantId);
      db.prepare("UPDATE encounters SET updated_at = ? WHERE id = ?").run(now(), encounterId);
      touchCampaign(id);
      return reply.send({ ok: true });
    },
  );

  app.post("/api/campaigns/:id/encounters/:encounterId/launch", async (request, reply) => {
    const { id, encounterId } = request.params as { id: string; encounterId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const encounter = getEncounter(id, encounterId);
    if (!encounter) return reply.code(404).send({ error: "Encounter not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const state = ensureState(id);
    const requestedScene =
      typeof body.sceneId === "string" && body.sceneId ? body.sceneId : encounter.scene_id;
    const scene =
      (requestedScene ? sceneBelongs(requestedScene, id) : null) ??
      (state.active_scene_id ? sceneBelongs(state.active_scene_id, id) : null) ??
      (db
        .prepare("SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1")
        .get(id) as SceneRow | undefined) ??
      null;
    if (!scene) return reply.code(400).send({ error: "Create a scene before launching an encounter." });

    const combatants = db
      .prepare(
        "SELECT * FROM encounter_combatants WHERE encounter_id = ? ORDER BY sort_order ASC, created_at ASC",
      )
      .all(encounterId) as EncounterCombatantRow[];
    if (!combatants.length) {
      return reply.code(400).send({ error: "Add at least one combatant before launching." });
    }

    const copies = combatants.reduce((total, combatant) => total + Math.max(1, combatant.count), 0);
    if (copies > 200) {
      return reply
        .code(400)
        .send({ error: "That encounter has too many creatures to launch at once (maximum 200)." });
    }
    const columns = Math.max(1, Math.ceil(Math.sqrt(copies)));
    const rows = Math.max(1, Math.ceil(copies / columns));
    const spacing = Math.max(scene.grid_size, 50);
    const startX = scene.width / 2 - ((columns - 1) * spacing) / 2;
    const startY = scene.height / 2 - ((rows - 1) * spacing) / 2;

    const nameTotals = new Map<string, number>();
    for (const combatant of combatants) {
      nameTotals.set(
        combatant.name,
        (nameTotals.get(combatant.name) ?? 0) + Math.max(1, Math.min(50, combatant.count)),
      );
    }
    const nameProgress = new Map<string, number>();
    const createdTokens: TokenRow[] = [];
    let index = 0;
    for (const combatant of combatants) {
      const count = Math.max(1, Math.min(50, combatant.count));
      const groupId = newId("grp");
      for (let copy = 0; copy < count; copy += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = clamp(startX + column * spacing, spacing / 2, Math.max(spacing / 2, scene.width - spacing / 2));
        const y = clamp(startY + row * spacing, spacing / 2, Math.max(spacing / 2, scene.height - spacing / 2));
        const tokenId = newId("tok");
        const ts = now();
        const baseName = combatant.name.slice(0, 70);
        let name = baseName;
        if ((nameTotals.get(combatant.name) ?? count) > 1) {
          const next = (nameProgress.get(baseName) ?? 0) + 1;
          nameProgress.set(baseName, next);
          name = `${baseName} ${next}`.slice(0, 80);
        }
        db.prepare(
          `INSERT INTO tokens
            (id, scene_id, name, image_url, character_id, owner_id, x, y, size, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, hidden, locked, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, 0, ?, ?, ?)`,
        ).run(
          tokenId,
          scene.id,
          name,
          x,
          y,
          clamp(combatant.monster_id ? monsterSize(combatant.monster_id) : 1, 1, 6),
          "#a34a4a",
          combatant.hp,
          combatant.hp,
          combatant.ac,
          combatant.perception,
          groupId,
          combatant.name,
          Date.now(),
          ts,
          ts,
        );
        createdTokens.push(db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow);
        index += 1;
      }
    }

    const sceneTokens = db
      .prepare("SELECT * FROM tokens WHERE scene_id = ? AND hidden = 0")
      .all(scene.id) as TokenRow[];
    const entries = sortInitiative(sceneTokens.map(initiativeEntryForToken));
    db.prepare(
      "UPDATE campaign_state SET active_scene_id = ?, initiative = ?, round = 1, turn_index = 0, updated_at = ? WHERE campaign_id = ?",
    ).run(scene.id, JSON.stringify(entries), now(), id);

    for (const token of createdTokens) {
      app.broadcastCampaign(id, "token:created", serializeToken(token));
    }
    app.broadcastCampaign(id, "scene:activated", { sceneId: scene.id });
    app.broadcastCampaign(id, "initiative:updated", { entries, round: 1, turnIndex: 0 });
    touchCampaign(id);

    return reply.send({
      sceneId: scene.id,
      tokens: createdTokens.map((token) => serializeToken(token)),
      initiative: entries,
      combatants: copies,
    });
  });
}

function monsterSize(monsterId: string): number {
  return monsters.find((monster) => monster.id === monsterId)?.sizeCells ?? 1;
}
