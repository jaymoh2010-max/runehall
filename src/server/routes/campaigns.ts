import type { FastifyInstance } from "fastify";
import {
  campaignCharacterCount,
  campaignCharacters,
  campaignMemberCount,
  campaignMembers,
  canEditCharacter,
  getCampaign,
  getCharacter,
  getMembership,
  getUser,
} from "../access";
import {
  db,
  createDefaultScene,
  type CampaignDashboardRow,
  type CampaignNpcRow,
  type CampaignRow,
  type CharacterRow,
  type EncounterRow,
  type JournalRow,
  type LootParcelRow,
  type MessageRow,
  type SceneRow,
  type TokenRow,
} from "../db";
import {
  serializeCampaignDashboard,
  serializeCampaignNpc,
  serializeCampaignSummary,
  serializeCharacter,
  serializeEncounter,
  serializeInitiative,
  serializeJournal,
  serializeLootParcel,
  serializeMember,
  serializeMessage,
  serializeScene,
  serializeToken,
  touchCampaign,
} from "../serialize";
import {
  isCampaignRuleset,
  isXpMode,
  normalizeCampaignRuleset,
  normalizeXpMode,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../../shared/content";
import { characterSummary, computeCharacter, normalizeCharacterDraft } from "../../shared/rules";
import { applyLongRest, type LongRestResult } from "../../shared/rest";
import { consumeLevelXp } from "../../shared/xp";
import {
  isJournalKind,
  normalizeJournalAttachments,
  normalizeJournalKind,
} from "../../shared/journal";
import { contextForDraft } from "../compendium";
import { campaignSessionsFor } from "../sessionData";
import { importCampaign } from "../campaignImport";
import { logAudit } from "../audit";
import { inviteCode, newId, now, parseJson, safeInt, safeString, sanitizeUserText } from "../util";

function campaignCounts(row: CampaignRow) {
  return {
    memberCount: campaignMemberCount(row.id),
    characterCount: campaignCharacterCount(row.id),
  };
}

function roleFor(row: CampaignRow, userId: string): "gm" | "player" | null {
  if (row.gm_id === userId) return "gm";
  return getMembership(row.id, userId)?.role ?? null;
}

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const rows = db
      .prepare(
        `SELECT c.*, u.display_name AS gm_name FROM campaigns c
         JOIN campaign_members m ON m.campaign_id = c.id
         JOIN users u ON u.id = c.gm_id
         WHERE m.user_id = ?
         ORDER BY COALESCE(c.last_played_at, c.updated_at) DESC`
      )
      .all(request.user.id) as (CampaignRow & { gm_name: string })[];
    return reply.send({
      campaigns: rows.map((row) => {
        const role = roleFor(row, request.user!.id) ?? "player";
        return {
          ...serializeCampaignSummary(row, role, campaignCounts(row), row.gm_name),
        };
      }),
    });
  });

  app.post("/api/campaigns", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 80);
    if (name.length < 2) return reply.code(400).send({ error: "Give your campaign a name." });
    const description = sanitizeUserText(body.description, 2000);
    if (body.ruleset !== undefined && !isCampaignRuleset(body.ruleset)) {
      return reply.code(400).send({ error: "Choose a valid campaign ruleset." });
    }
    const ruleset = isCampaignRuleset(body.ruleset) ? body.ruleset : "core";
    if (body.xpMode !== undefined && !isXpMode(body.xpMode)) {
      return reply.code(400).send({ error: "Choose milestone or XP budget advancement." });
    }
    const xpMode = normalizeXpMode(body.xpMode);
    let code = inviteCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const exists = db.prepare("SELECT id FROM campaigns WHERE invite_code = ?").get(code);
      if (!exists) break;
      code = inviteCode();
    }
    const id = newId("camp");
    const ts = now();
    db.prepare(
      "INSERT INTO campaigns (id, name, description, gm_id, invite_code, ruleset, xp_mode, created_at, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, description, request.user.id, code, ruleset, xpMode, ts, ts, ts);
    db.prepare(
      "INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'gm', ?)"
    ).run(id, request.user.id, ts);
    createDefaultScene(id, request.user.id);
    const row = getCampaign(id)!;
    logAudit({
      action: "campaign.create",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${name} (${ruleset}/${xpMode})`,
      request,
    });
    return reply.code(201).send({
      campaign: serializeCampaignSummary(row, "gm", campaignCounts(row), request.user.displayName),
    });
  });

  app.post("/api/campaigns/import", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    try {
      const result = importCampaign(request.user.id, request.body);
      const row = getCampaign(result.campaignId);
      if (!row)
        return reply.code(500).send({ error: "The imported campaign could not be opened." });
      logAudit({
        action: "campaign.import",
        actor: request.user,
        targetType: "campaign",
        targetId: result.campaignId,
        detail: `${row.name} (${result.stats.characters} characters, ${result.stats.sessions} sessions)`,
        request,
      });
      return reply.code(201).send({
        campaign: serializeCampaignSummary(
          row,
          "gm",
          campaignCounts(row),
          request.user.displayName
        ),
        stats: result.stats,
      });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "That campaign could not be imported.",
      });
    }
  });

  app.post("/api/campaigns/join", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const code = safeString(body.code, "", 80).trim().toUpperCase();
    if (!code) return reply.code(400).send({ error: "Enter an invite code." });

    // Allow the join form to receive a pasted invite link as well as a bare code.
    const normalizedCode = code.includes("/JOIN/")
      ? code.split("/JOIN/").pop()!.split(/[/?#]/)[0]
      : code;
    const row = db
      .prepare("SELECT * FROM campaigns WHERE UPPER(invite_code) = ?")
      .get(normalizedCode) as CampaignRow | undefined;
    if (!row) return reply.code(404).send({ error: "No campaign has that invite code." });

    const characterId = typeof body.characterId === "string" ? body.characterId : null;
    let character = characterId ? getCharacter(characterId) : null;
    if (characterId) {
      if (!character || character.user_id !== request.user.id) {
        return reply.code(403).send({ error: "You can only bring a character you own." });
      }
      if (character.campaign_id && character.campaign_id !== row.id) {
        return reply
          .code(409)
          .send({ error: "That character already belongs to another campaign." });
      }
    }

    const existing = getMembership(row.id, request.user.id);
    if (!existing) {
      db.prepare(
        "INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)"
      ).run(row.id, request.user.id, now());
    }

    let serializedCharacter = null as ReturnType<typeof serializeCharacter> | null;
    if (character && character.campaign_id !== row.id) {
      let data = character.data;
      try {
        const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
        const ruleset = normalizeCampaignRuleset(row.ruleset);
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
        data = JSON.stringify(draft);
      } catch {
        // Keep the existing draft if it is malformed; the builder will normalize it.
      }
      db.prepare(
        "UPDATE characters SET campaign_id = ?, data = ?, updated_at = ? WHERE id = ?"
      ).run(row.id, data, now(), character.id);
      character = getCharacter(character.id);
      serializedCharacter = character
        ? serializeCharacter(character, request.user.displayName, { canEdit: true, canView: true })
        : null;
      app.broadcastCampaign(row.id, "character:created", {
        character: serializedCharacter,
      });
    }

    touchCampaign(row.id);

    if (!existing) {
      logAudit({
        action: "campaign.join",
        actor: request.user,
        targetType: "campaign",
        targetId: row.id,
        detail: row.name,
        request,
      });
    }

    return reply.send({
      campaign: serializeCampaignSummary(
        getCampaign(row.id)!,
        existing?.role ?? "player",
        campaignCounts(row)
      ),
      character: serializedCharacter,
    });
  });

  app.get("/api/campaigns/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    const role = roleFor(row, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    const gm = getUser(row.gm_id);
    const members = campaignMembers(id).map((member) =>
      serializeMember(member, member.role, member.joined_at)
    );
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: canEditCharacter(character, request.user!.id),
        canView: true,
      })
    );
    return reply.send({
      campaign: serializeCampaignSummary(row, role, campaignCounts(row), gm?.display_name ?? ""),
      members,
      characters,
    });
  });

  app.get("/api/campaigns/:id/export", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can export the campaign." });
    }

    const members = campaignMembers(id).map((member) =>
      serializeMember(member, member.role, member.joined_at)
    );
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, { canEdit: true, canView: true })
    );
    const scenes = (
      db
        .prepare(
          "SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as SceneRow[]
    ).map(serializeScene);
    const tokens = (
      db
        .prepare(
          `SELECT t.* FROM tokens t JOIN scenes s ON s.id = t.scene_id
           WHERE s.campaign_id = ? ORDER BY t.sort_order ASC, t.created_at ASC`
        )
        .all(id) as TokenRow[]
    ).map((token) => serializeToken(token));
    const messages = (
      db
        .prepare("SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at ASC")
        .all(id) as MessageRow[]
    ).map(serializeMessage);
    const journal = (
      db
        .prepare(
          `SELECT j.*, u.display_name AS author_name FROM journal_entries j
           LEFT JOIN users u ON u.id = j.created_by
           WHERE j.campaign_id = ? ORDER BY j.created_at ASC`
        )
        .all(id) as (JournalRow & { author_name: string | null })[]
    ).map(serializeJournal);
    const encounters = (
      db
        .prepare(
          "SELECT * FROM encounters WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as EncounterRow[]
    ).map(serializeEncounter);
    const loot = (
      db
        .prepare(
          "SELECT * FROM loot_parcels WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as LootParcelRow[]
    ).map(serializeLootParcel);
    const dashboardRow = db
      .prepare("SELECT * FROM campaign_dashboard WHERE campaign_id = ?")
      .get(id) as CampaignDashboardRow | undefined;
    const dashboard = dashboardRow ? serializeCampaignDashboard(dashboardRow, "gm") : null;
    const npcs = (
      db
        .prepare(
          "SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignNpcRow[]
    ).map(serializeCampaignNpc);
    const sessions = campaignSessionsFor(id, "gm", request.user.id);
    const state = db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(id) as
      | { active_scene_id: string | null; initiative: string; round: number; turn_index: number }
      | undefined;
    const assets = new Set<string>();
    for (const scene of scenes) if (scene.imageUrl) assets.add(scene.imageUrl);
    for (const token of tokens) if (token.imageUrl) assets.add(token.imageUrl);
    for (const character of characters)
      if (character.summary?.portraitUrl) assets.add(character.summary.portraitUrl);

    const payload = {
      format: "runehall-campaign",
      version: 1,
      exportedAt: new Date().toISOString(),
      campaign: serializeCampaignSummary(
        row,
        "gm",
        campaignCounts(row),
        getUser(row.gm_id)?.display_name ?? ""
      ),
      members,
      characters,
      scenes,
      tokens,
      encounters,
      loot,
      dashboard,
      npcs,
      sessions,
      messages,
      journal,
      state: {
        activeSceneId: state?.active_scene_id ?? null,
        initiative: serializeInitiative(parseJson(state?.initiative, [])),
        round: state?.round ?? 1,
        turnIndex: state?.turn_index ?? 0,
      },
      assets: [...assets],
      note: "Image files are referenced by URL. Use `npm run backup` to archive the database and data/uploads together.",
    };
    const safeName = row.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "campaign";
    return reply
      .header("Content-Disposition", `attachment; filename="${safeName}.runehall.json"`)
      .send(payload);
  });

  app.patch("/api/campaigns/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can change campaign settings." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, row.name, 80);
    const description =
      body.description === undefined ? row.description : sanitizeUserText(body.description, 2000);
    if (body.ruleset !== undefined && !isCampaignRuleset(body.ruleset)) {
      return reply.code(400).send({ error: "Choose a valid campaign ruleset." });
    }
    if (body.xpMode !== undefined && !isXpMode(body.xpMode)) {
      return reply.code(400).send({ error: "Choose milestone or XP budget advancement." });
    }
    const ruleset =
      body.ruleset === undefined ? normalizeCampaignRuleset(row.ruleset) : body.ruleset;
    const xpMode = body.xpMode === undefined ? normalizeXpMode(row.xp_mode) : body.xpMode;
    db.prepare(
      "UPDATE campaigns SET name = ?, description = ?, ruleset = ?, xp_mode = ?, updated_at = ? WHERE id = ?"
    ).run(name, description, ruleset, xpMode, now(), id);
    if (ruleset !== normalizeCampaignRuleset(row.ruleset)) {
      const contentMode = rulesetContentMode(ruleset);
      const legacyAllowed = rulesetIncludesLegacy(ruleset);
      const characterRows = db
        .prepare("SELECT id, data FROM characters WHERE campaign_id = ?")
        .all(id) as { id: string; data: string }[];
      for (const character of characterRows) {
        try {
          const draft = JSON.parse(character.data) as Record<string, unknown>;
          draft.contentMode = contentMode;
          draft.includeLegacy = legacyAllowed;
          db.prepare(
            "UPDATE characters SET data = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
          ).run(JSON.stringify(draft), now(), character.id);
        } catch {
          // Keep an unreadable draft untouched; its owner can repair it in the builder.
        }
      }
    }
    const updated = getCampaign(id)!;
    return reply.send({
      campaign: serializeCampaignSummary(updated, "gm", campaignCounts(updated)),
    });
  });

  app.delete("/api/campaigns/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can delete the campaign." });
    }
    db.prepare("DELETE FROM campaigns WHERE id = ?").run(id);
    logAudit({
      action: "campaign.delete",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: row.name,
      request,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/leave", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (row.gm_id === request.user.id) {
      return reply
        .code(400)
        .send({ error: "The GM can't leave the campaign. Transfer or delete it instead." });
    }
    db.prepare("DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?").run(
      id,
      request.user.id
    );
    return reply.send({ ok: true });
  });

  app.delete("/api/campaigns/:id/members/:userId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, userId } = request.params as { id: string; userId: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can remove members." });
    }
    if (userId === row.gm_id) return reply.code(400).send({ error: "The GM can't be removed." });
    db.prepare("DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?").run(
      id,
      userId
    );
    logAudit({
      action: "campaign.member_remove",
      actor: request.user,
      targetType: "campaign_member",
      targetId: userId,
      detail: `${row.name} / ${userId}`,
      request,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/regenerate-code", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can change the invite code." });
    }
    let code = inviteCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!db.prepare("SELECT id FROM campaigns WHERE invite_code = ?").get(code)) break;
      code = inviteCode();
    }
    db.prepare("UPDATE campaigns SET invite_code = ?, updated_at = ? WHERE id = ?").run(
      code,
      now(),
      id
    );
    return reply.send({ inviteCode: code });
  });

  app.post("/api/campaigns/:id/level-up", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can advance characters." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const characterId = typeof body.characterId === "string" ? body.characterId : null;
    const characterRows = characterId
      ? (db
          .prepare("SELECT * FROM characters WHERE campaign_id = ? AND id = ?")
          .all(id, characterId) as CharacterRow[])
      : (db.prepare("SELECT * FROM characters WHERE campaign_id = ?").all(id) as CharacterRow[]);
    if (!characterRows.length) {
      return reply.code(characterId ? 404 : 400).send({
        error: characterId
          ? "That character is not in this campaign."
          : "There are no characters in this campaign yet.",
      });
    }

    let leveled = 0;
    let atMaxLevel = 0;
    let skipped = 0;
    for (const character of characterRows) {
      let draft;
      try {
        draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      } catch {
        skipped += 1;
        continue;
      }
      if (draft.level >= 20) {
        atMaxLevel += 1;
        continue;
      }
      const before = characterSummary(draft, contextForDraft(draft));
      const wasFull = draft.play.hp === null || draft.play.hp >= before.hp;
      draft.level += 1;
      draft.play.xp = consumeLevelXp(draft.play.xp);
      const after = characterSummary(draft, contextForDraft(draft));
      draft.play.hp = wasFull ? null : Math.min(draft.play.hp ?? after.hp, after.hp);
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);

      const linkedTokens = db
        .prepare("SELECT * FROM tokens WHERE character_id = ?")
        .all(character.id) as TokenRow[];
      for (const token of linkedTokens) {
        const tokenWasFull =
          token.hp_current === null || token.hp_max === null || token.hp_current >= token.hp_max;
        const nextHp = tokenWasFull
          ? summary.hp
          : Math.min(token.hp_current ?? summary.hp, summary.hp);
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
        ).run(draft.name, summary.hp, nextHp, summary.ac, now(), token.id);
        const updatedToken = db
          .prepare("SELECT * FROM tokens WHERE id = ?")
          .get(token.id) as TokenRow;
        app.broadcastCampaign(id, "token:updated", serializeToken(updatedToken));
      }

      app.broadcastCampaign(id, "character:updated", {
        characterId: character.id,
        summary,
        name: draft.name,
      });
      leveled += 1;
    }

    touchCampaign(id);
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    logAudit({
      action: "campaign.level_up",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: characterId
        ? `${characterRows[0]?.name ?? "Character"}: ${leveled ? "advanced" : atMaxLevel ? "at max level" : "skipped"}`
        : `${leveled} advanced, ${atMaxLevel} at max, ${skipped} skipped`,
      request,
    });
    return reply.send({ leveled, atMaxLevel, skipped, characters });
  });

  app.post("/api/campaigns/:id/award-xp", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can award XP." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const amount = safeInt(body.amount, 0, 1, 100_000);
    if (amount < 1) return reply.code(400).send({ error: "Award at least 1 XP." });
    const characterIds = Array.isArray(body.characterIds)
      ? [
          ...new Set(
            body.characterIds.filter((value): value is string => typeof value === "string")
          ),
        ]
      : [];
    if (!characterIds.length) {
      return reply.code(400).send({ error: "Choose at least one character." });
    }
    const reason = sanitizeUserText(body.reason, 200);
    const rows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    const selected = rows.filter((character) => characterIds.includes(character.id));
    if (!selected.length) {
      return reply.code(400).send({ error: "Those characters are not in this campaign." });
    }

    let recipients = 0;
    let skipped = 0;
    for (const character of selected) {
      let draft;
      try {
        draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      } catch {
        skipped += 1;
        continue;
      }
      draft.play.xp = Math.max(0, Math.round(draft.play.xp + amount));
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
      app.broadcastCampaign(id, "character:updated", {
        characterId: character.id,
        summary,
        name: draft.name,
      });
      recipients += 1;
    }

    touchCampaign(id);
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    logAudit({
      action: "campaign.award_xp",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${amount} XP to ${recipients} characters${reason ? `: ${reason}` : ""}`,
      request,
    });
    return reply.send({ amount, recipients, skipped, characters });
  });

  app.post("/api/campaigns/:id/long-rest", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can rest the party." });
    }
    const characterRows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    if (!characterRows.length) {
      return reply.code(400).send({ error: "There are no characters in this campaign yet." });
    }

    let rested = 0;
    let skipped = 0;
    let healed = 0;
    let conditionsRemoved = 0;
    let conditionsReduced = 0;
    let slotsRestored = 0;
    let focusRestored = 0;
    for (const character of characterRows) {
      let result: LongRestResult;
      try {
        const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
        result = applyLongRest(draft, computeCharacter(draft, contextForDraft(draft)));
      } catch {
        skipped += 1;
        continue;
      }
      const summary = characterSummary(result.draft, contextForDraft(result.draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(result.draft), JSON.stringify(summary), now(), character.id);

      const linkedTokens = db
        .prepare("SELECT * FROM tokens WHERE character_id = ?")
        .all(character.id) as TokenRow[];
      for (const token of linkedTokens) {
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
        ).run(
          result.draft.name,
          summary.hp,
          result.draft.play.hp === null
            ? summary.hp
            : Math.max(0, Math.min(summary.hp, result.draft.play.hp)),
          summary.ac,
          now(),
          token.id
        );
        const updatedToken = db
          .prepare("SELECT * FROM tokens WHERE id = ?")
          .get(token.id) as TokenRow;
        app.broadcastCampaign(id, "token:updated", serializeToken(updatedToken));
      }

      app.broadcastCampaign(id, "character:updated", {
        characterId: character.id,
        summary,
        name: result.draft.name,
      });
      rested += 1;
      healed += result.summary.healed;
      conditionsRemoved += result.summary.removedConditions.length;
      conditionsReduced += result.summary.reducedConditions.length;
      slotsRestored += result.summary.slotsRestored;
      focusRestored += Math.max(0, result.summary.focusAfter - result.summary.focusBefore);
    }

    touchCampaign(id);
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    logAudit({
      action: "campaign.long_rest",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${rested} rested, ${healed} HP healed, ${conditionsRemoved} conditions removed, ${conditionsReduced} reduced`,
      request,
    });
    return reply.send({
      rested,
      skipped,
      healed,
      conditionsRemoved,
      conditionsReduced,
      slotsRestored,
      focusRestored,
      characters,
    });
  });

  // ---- Journal ------------------------------------------------------------
  app.get("/api/campaigns/:id/journal", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const role = getMembership(id, request.user.id)?.role;
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    const rows = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by
         WHERE j.campaign_id = ? ${role === "player" ? "AND j.visible = 1" : ""}
         ORDER BY j.updated_at DESC`
      )
      .all(id) as (import("../db").JournalRow & { author_name: string | null })[];
    return reply.send({ entries: rows.map(serializeJournal) });
  });

  app.post("/api/campaigns/:id/journal", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm")
      return reply.code(403).send({ error: "Only the GM can write journal entries." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.kind !== undefined && !isJournalKind(body.kind)) {
      return reply.code(400).send({ error: "Choose a journal entry or a handout." });
    }
    const title = safeString(body.title, "Untitled entry", 140);
    const content = sanitizeUserText(body.content, 100_000);
    const visible = body.visible !== false;
    const kind = isJournalKind(body.kind) ? body.kind : "note";
    const attachments = normalizeJournalAttachments(body.attachments);
    const entryId = newId("journal");
    const ts = now();
    db.prepare(
      `INSERT INTO journal_entries
        (id, campaign_id, title, content, visible, kind, attachments, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entryId,
      id,
      title,
      content,
      visible ? 1 : 0,
      kind,
      JSON.stringify(attachments),
      request.user.id,
      ts,
      ts
    );
    const row = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`
      )
      .get(entryId) as import("../db").JournalRow & { author_name: string | null };
    return reply.code(201).send({ entry: serializeJournal(row) });
  });

  app.put("/api/campaigns/:id/journal/:entryId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, entryId } = request.params as { id: string; entryId: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm")
      return reply.code(403).send({ error: "Only the GM can edit journal entries." });
    const existing = db
      .prepare("SELECT * FROM journal_entries WHERE id = ? AND campaign_id = ?")
      .get(entryId, id) as import("../db").JournalRow | undefined;
    if (!existing) return reply.code(404).send({ error: "Journal entry not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.kind !== undefined && !isJournalKind(body.kind)) {
      return reply.code(400).send({ error: "Choose a journal entry or a handout." });
    }
    const title = safeString(body.title, existing.title, 140);
    const content =
      body.content === undefined ? existing.content : sanitizeUserText(body.content, 100_000);
    const visible = body.visible === undefined ? Boolean(existing.visible) : body.visible !== false;
    const kind =
      body.kind === undefined
        ? normalizeJournalKind(existing.kind)
        : normalizeJournalKind(body.kind);
    const attachments =
      body.attachments === undefined
        ? normalizeJournalAttachments(parseJson(existing.attachments, []))
        : normalizeJournalAttachments(body.attachments);
    db.prepare(
      "UPDATE journal_entries SET title = ?, content = ?, visible = ?, kind = ?, attachments = ?, updated_at = ? WHERE id = ?"
    ).run(title, content, visible ? 1 : 0, kind, JSON.stringify(attachments), now(), entryId);
    const row = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`
      )
      .get(entryId) as import("../db").JournalRow & { author_name: string | null };
    return reply.send({ entry: serializeJournal(row) });
  });

  app.post("/api/campaigns/:id/journal/:entryId/duplicate", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, entryId } = request.params as { id: string; entryId: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm") {
      return reply.code(403).send({ error: "Only the GM can duplicate journal entries." });
    }
    const existing = db
      .prepare("SELECT * FROM journal_entries WHERE id = ? AND campaign_id = ?")
      .get(entryId, id) as JournalRow | undefined;
    if (!existing) return reply.code(404).send({ error: "Journal entry not found." });
    const duplicateId = newId("journal");
    const ts = now();
    db.prepare(
      `INSERT INTO journal_entries
        (id, campaign_id, title, content, visible, kind, attachments, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      duplicateId,
      id,
      `${existing.title} (copy)`.slice(0, 140),
      existing.content,
      existing.visible,
      normalizeJournalKind(existing.kind),
      existing.attachments,
      request.user.id,
      ts,
      ts
    );
    const row = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`
      )
      .get(duplicateId) as JournalRow & { author_name: string | null };
    touchCampaign(id);
    return reply.code(201).send({ entry: serializeJournal(row) });
  });

  app.delete("/api/campaigns/:id/journal/:entryId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, entryId } = request.params as { id: string; entryId: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm")
      return reply.code(403).send({ error: "Only the GM can delete journal entries." });
    db.prepare("DELETE FROM journal_entries WHERE id = ? AND campaign_id = ?").run(entryId, id);
    return reply.send({ ok: true });
  });
}
