import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import {
  db,
  type CampaignFactionRow,
  type CampaignNpcRow,
  type SceneRow,
  type TokenRow,
} from "../db";
import {
  serializeCampaignFaction,
  serializeCampaignNpc,
  serializeToken,
  touchCampaign,
} from "../serialize";
import { tokenEventsFor } from "../tokenEvents";
import { normalizeNpcAttitude, normalizeReputation } from "../../shared/people";
import { clamp, newId, now, safeInt, safeString, sanitizeUserText } from "../util";

function gmCampaign(
  request: { user: { id: string } | null },
  campaignId: string
): { row: ReturnType<typeof getCampaign>; error?: string; code?: number } {
  if (!request.user) return { row: null, error: "Sign in to continue.", code: 401 };
  const row = getCampaign(campaignId);
  if (!row) return { row: null, error: "Campaign not found.", code: 404 };
  if (getCampaignRole(campaignId, request.user.id) !== "gm") {
    return { row: null, error: "Only the GM can manage NPCs.", code: 403 };
  }
  return { row };
}

function getNpc(campaignId: string, npcId: string): CampaignNpcRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_npcs WHERE id = ? AND campaign_id = ?")
      .get(npcId, campaignId) as CampaignNpcRow | undefined) ?? null
  );
}

function getFaction(campaignId: string, factionId: string): CampaignFactionRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_factions WHERE id = ? AND campaign_id = ?")
      .get(factionId, campaignId) as CampaignFactionRow | undefined) ?? null
  );
}

function factionIdFor(campaignId: string, value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const id = safeString(value, "", 120);
  return id && getFaction(campaignId, id) ? id : null;
}

function imageUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const url = value.trim();
  return /^\/uploads\/[A-Za-z0-9._-]+$/.test(url) ? url : null;
}

function nextSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_npcs WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

function nextFactionSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_factions WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

function sceneBelongs(sceneId: string, campaignId: string): SceneRow | null {
  return (
    (db
      .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
      .get(sceneId, campaignId) as SceneRow | undefined) ?? null
  );
}

function activeScene(campaignId: string): SceneRow | null {
  const state = db
    .prepare("SELECT active_scene_id FROM campaign_state WHERE campaign_id = ?")
    .get(campaignId) as { active_scene_id: string | null } | undefined;
  const requested = state?.active_scene_id ? sceneBelongs(state.active_scene_id, campaignId) : null;
  return (
    requested ??
    (db
      .prepare(
        "SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1"
      )
      .get(campaignId) as SceneRow | undefined) ??
    null
  );
}

export async function registerNpcRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/people", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const factions = (
      db
        .prepare(
          "SELECT * FROM campaign_factions WHERE campaign_id = ? AND visible = 1 ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignFactionRow[]
    ).map((row) => serializeCampaignFaction(row, false));
    const npcs = (
      db
        .prepare(
          "SELECT * FROM campaign_npcs WHERE campaign_id = ? AND visible = 1 ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignNpcRow[]
    ).map((row) => serializeCampaignNpc(row, false));
    return reply.send({ factions, npcs });
  });

  app.get("/api/campaigns/:id/factions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const rows = db
      .prepare(
        "SELECT * FROM campaign_factions WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
      )
      .all(id) as CampaignFactionRow[];
    return reply.send({ factions: rows.map((row) => serializeCampaignFaction(row)) });
  });

  app.post("/api/campaigns/:id/factions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 120);
    if (!name) return reply.code(400).send({ error: "Give the faction a name." });
    const factionId = newId("faction");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_factions
         (id, campaign_id, name, description, goals, assets, attitude, reputation, visible,
          gm_notes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      factionId,
      id,
      name,
      sanitizeUserText(body.description, 4_000),
      sanitizeUserText(body.goals, 4_000),
      sanitizeUserText(body.assets, 4_000),
      normalizeNpcAttitude(body.attitude),
      normalizeReputation(body.reputation),
      body.visible === true ? 1 : 0,
      sanitizeUserText(body.gmNotes, 8_000),
      nextFactionSortOrder(id),
      ts,
      ts
    );
    touchCampaign(id);
    return reply.code(201).send({ faction: serializeCampaignFaction(getFaction(id, factionId)!) });
  });

  app.patch("/api/campaigns/:id/factions/:factionId", async (request, reply) => {
    const { id, factionId } = request.params as { id: string; factionId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getFaction(id, factionId);
    if (!existing) return reply.code(404).send({ error: "Faction not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name =
      body.name === undefined ? existing.name : safeString(body.name, existing.name, 120);
    if (!name) return reply.code(400).send({ error: "Give the faction a name." });
    db.prepare(
      `UPDATE campaign_factions
       SET name = ?, description = ?, goals = ?, assets = ?, attitude = ?, reputation = ?,
           visible = ?, gm_notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 4_000),
      body.goals === undefined ? existing.goals : sanitizeUserText(body.goals, 4_000),
      body.assets === undefined ? existing.assets : sanitizeUserText(body.assets, 4_000),
      body.attitude === undefined ? existing.attitude : normalizeNpcAttitude(body.attitude),
      body.reputation === undefined ? existing.reputation : normalizeReputation(body.reputation),
      body.visible === undefined ? existing.visible : body.visible === true ? 1 : 0,
      body.gmNotes === undefined ? existing.gm_notes : sanitizeUserText(body.gmNotes, 8_000),
      now(),
      factionId
    );
    touchCampaign(id);
    return reply.send({ faction: serializeCampaignFaction(getFaction(id, factionId)!) });
  });

  app.delete("/api/campaigns/:id/factions/:factionId", async (request, reply) => {
    const { id, factionId } = request.params as { id: string; factionId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    if (!getFaction(id, factionId)) return reply.code(404).send({ error: "Faction not found." });
    db.prepare("UPDATE campaign_npcs SET faction_id = NULL WHERE faction_id = ?").run(factionId);
    db.prepare("DELETE FROM campaign_factions WHERE id = ?").run(factionId);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.get("/api/campaigns/:id/npcs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const rows = db
      .prepare(
        "SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
      )
      .all(id) as CampaignNpcRow[];
    return reply.send({ npcs: rows.map((row) => serializeCampaignNpc(row)) });
  });

  app.post("/api/campaigns/:id/npcs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 120);
    if (!name) return reply.code(400).send({ error: "Give the NPC a name." });
    const npcId = newId("npc");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_npcs
        (id, campaign_id, name, level, hp, ac, perception, size, color, image_url, description,
         faction_id, role, location, attitude, public_description, secrets, visible, sort_order,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      npcId,
      id,
      name,
      clamp(safeInt(body.level, 1, -1, 30), -1, 30),
      body.hp === undefined || body.hp === null ? null : safeInt(body.hp, 0, 0, 1_000_000),
      body.ac === undefined || body.ac === null ? null : safeInt(body.ac, 0, -100, 1000),
      body.perception === undefined || body.perception === null
        ? null
        : safeInt(body.perception, 0, -100, 1000),
      clamp(safeInt(body.size, 1, 1, 6), 1, 6),
      safeString(body.color, "#b06767", 30),
      imageUrl(body.imageUrl) ?? null,
      sanitizeUserText(body.description, 20_000),
      factionIdFor(id, body.factionId, null),
      safeString(body.role, "", 120),
      safeString(body.location, "", 120),
      normalizeNpcAttitude(body.attitude),
      sanitizeUserText(body.publicDescription, 4_000),
      sanitizeUserText(body.secrets, 8_000),
      body.visible === true ? 1 : 0,
      nextSortOrder(id),
      ts,
      ts
    );
    touchCampaign(id);
    return reply.code(201).send({ npc: serializeCampaignNpc(getNpc(id, npcId)!) });
  });

  app.patch("/api/campaigns/:id/npcs/:npcId", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getNpc(id, npcId);
    if (!existing) return reply.code(404).send({ error: "NPC not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name =
      body.name === undefined ? existing.name : safeString(body.name, existing.name, 120);
    if (!name) return reply.code(400).send({ error: "Give the NPC a name." });
    const nextImage = imageUrl(body.imageUrl);
    db.prepare(
      `UPDATE campaign_npcs
       SET name = ?, level = ?, hp = ?, ac = ?, perception = ?, size = ?, color = ?,
           image_url = ?, description = ?, faction_id = ?, role = ?, location = ?, attitude = ?,
           public_description = ?, secrets = ?, visible = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      body.level === undefined
        ? existing.level
        : clamp(safeInt(body.level, existing.level, -1, 30), -1, 30),
      body.hp === undefined
        ? existing.hp
        : body.hp === null
          ? null
          : safeInt(body.hp, 0, 0, 1_000_000),
      body.ac === undefined
        ? existing.ac
        : body.ac === null
          ? null
          : safeInt(body.ac, 0, -100, 1000),
      body.perception === undefined
        ? existing.perception
        : body.perception === null
          ? null
          : safeInt(body.perception, 0, -100, 1000),
      body.size === undefined
        ? existing.size
        : clamp(safeInt(body.size, existing.size, 1, 6), 1, 6),
      body.color === undefined ? existing.color : safeString(body.color, existing.color, 30),
      nextImage === undefined ? existing.image_url : nextImage,
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 20_000),
      factionIdFor(id, body.factionId, existing.faction_id),
      body.role === undefined ? existing.role : safeString(body.role, existing.role, 120),
      body.location === undefined
        ? existing.location
        : safeString(body.location, existing.location, 120),
      body.attitude === undefined ? existing.attitude : normalizeNpcAttitude(body.attitude),
      body.publicDescription === undefined
        ? existing.public_description
        : sanitizeUserText(body.publicDescription, 4_000),
      body.secrets === undefined ? existing.secrets : sanitizeUserText(body.secrets, 8_000),
      body.visible === undefined ? existing.visible : body.visible === true ? 1 : 0,
      now(),
      npcId
    );
    touchCampaign(id);
    return reply.send({ npc: serializeCampaignNpc(getNpc(id, npcId)!) });
  });

  app.delete("/api/campaigns/:id/npcs/:npcId", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    if (!getNpc(id, npcId)) return reply.code(404).send({ error: "NPC not found." });
    db.prepare("DELETE FROM campaign_npcs WHERE id = ?").run(npcId);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/npcs/:npcId/token", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const npc = getNpc(id, npcId);
    if (!npc) return reply.code(404).send({ error: "NPC not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const requestedScene =
      typeof body.sceneId === "string" && body.sceneId ? sceneBelongs(body.sceneId, id) : null;
    const scene = requestedScene ?? activeScene(id);
    if (!scene)
      return reply.code(400).send({ error: "Create a scene before placing an NPC token." });

    const tokenId = newId("tok");
    const ts = now();
    db.prepare(
      `INSERT INTO tokens
        (id, scene_id, name, image_url, character_id, owner_id, x, y, size, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, hidden, locked, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', 0, 0, ?, ?, ?)`
    ).run(
      tokenId,
      scene.id,
      npc.name,
      npc.image_url,
      Math.round(scene.width / 2),
      Math.round(scene.height / 2),
      npc.size,
      npc.color,
      npc.hp,
      npc.hp,
      npc.ac,
      npc.perception,
      Date.now(),
      ts,
      ts
    );
    const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow;
    tokenEventsFor(app, id).created(serializeToken(token));
    touchCampaign(id);
    return reply.code(201).send({ token: serializeToken(token), sceneId: scene.id });
  });
}
