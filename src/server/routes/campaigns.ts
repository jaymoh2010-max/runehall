import type { FastifyInstance } from "fastify";
import type { CharacterDraft, CharacterSummary } from "../../shared/types";
import fs from "node:fs";
import path from "node:path";
import {
  campaignCharacterCount,
  campaignCharacters,
  campaignJoinRequests,
  campaignMemberCount,
  campaignMembers,
  canEditCharacter,
  getCampaign,
  getCharacter,
  getJoinRequest,
  getMembership,
  getUser,
} from "../access";
import {
  db,
  createDefaultScene,
  transaction,
  type AudioTrackRow,
  type CampaignFactionRow,
  type CampaignKnowledgeRow,
  type CampaignChapterRow,
  type CampaignNpcRow,
  type CampaignRow,
  type CampaignSessionZeroRow,
  type CharacterRow,
  type EncounterRow,
  type JournalRow,
  type MessageRow,
  type SceneRow,
  type TokenRow,
  type XpAwardRow,
} from "../db";
import {
  serializeAudioTrack,
  serializeCampaignFaction,
  serializeCampaignKnowledge,
  serializeCampaignChapter,
  serializeCampaignNpc,
  serializeCampaignSummary,
  serializeCampaignSessionZero,
  serializeCharacter,
  serializeEncounter,
  serializeInitiative,
  serializeJoinRequest,
  serializeJournal,
  serializeMember,
  serializeMessage,
  serializeScene,
  serializeToken,
  serializeXpAward,
  touchCampaign,
} from "../serialize";
import { tokenEventsFor } from "../tokenEvents";
import { broadcastCampaignSummary } from "../campaignEvents";
import {
  isCampaignRuleset,
  isXpMode,
  normalizeCampaignRuleset,
  normalizeXpMode,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../../shared/content";
import { characterSummary, computeCharacter, normalizeCharacterDraft } from "../../shared/rules";
import { levelUpCurrentHp } from "../../shared/levelup";
import {
  isJournalKind,
  normalizeJournalAttachments,
  normalizeJournalKind,
  normalizeQuestStatus,
  normalizeQuestXp,
} from "../../shared/journal";
import {
  consumeLevelXp,
  isAdvancementSpeed,
  normalizeAdvancementSpeed,
  type AdvancementSpeed,
} from "../../shared/xp";
import { compendiumManifest, contextForDraft } from "../compendium";
import { contextForCampaign } from "../campaignContext";
import { importCampaign } from "../campaignImport";
import { logAudit } from "../audit";
import {
  inviteCode,
  newId,
  now,
  parseJson,
  safeString,
  sanitizeUserText,
  uploadsDir,
} from "../util";

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

function unassignCampaignCharacters(
  app: FastifyInstance,
  campaignId: string,
  userId: string
): void {
  const rows = db
    .prepare("SELECT id FROM characters WHERE campaign_id = ? AND user_id = ?")
    .all(campaignId, userId) as { id: string }[];
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const linkedTokens = db
    .prepare(
      `SELECT t.* FROM tokens t JOIN scenes s ON s.id = t.scene_id
       WHERE t.character_id IN (${placeholders}) AND s.campaign_id = ?`
    )
    .all(...ids, campaignId) as TokenRow[];
  db.prepare(
    `UPDATE tokens SET character_id = NULL, owner_id = NULL, updated_at = ?
     WHERE character_id IN (${placeholders})`
  ).run(now(), ...ids);
  db.prepare(
    `UPDATE characters SET campaign_id = NULL, updated_at = ?, revision = revision + 1
     WHERE id IN (${placeholders})`
  ).run(now(), ...ids);
  for (const row of rows) {
    app.broadcastCampaign(campaignId, "character:removed", { characterId: row.id });
  }
  for (const token of linkedTokens) {
    const refreshed = db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as
      TokenRow | undefined;
    if (refreshed) {
      tokenEventsFor(app, campaignId).updated(serializeToken(refreshed), Boolean(refreshed.hidden));
    }
  }
}

function ejectUserSockets(
  app: FastifyInstance,
  campaignId: string,
  userId: string,
  disconnect = false
): void {
  for (const socket of app.io.sockets.sockets.values()) {
    if ((socket.data as { user?: { id?: string } }).user?.id !== userId) continue;
    socket.leave(`campaign:${campaignId}`);
    socket.leave(`gm:${campaignId}`);
    if (disconnect) socket.disconnect(true);
  }
}

/** Keep a connected member's role rooms in step after a GM transfer. */
function syncUserCampaignRooms(
  app: FastifyInstance,
  campaignId: string,
  userId: string,
  role: "gm" | "player"
): void {
  for (const socket of app.io.sockets.sockets.values()) {
    const data = socket.data as { user?: { id?: string }; campaigns?: Set<string> };
    if (data.user?.id !== userId) continue;
    socket.join(`campaign:${campaignId}`);
    if (role === "gm") socket.join(`gm:${campaignId}`);
    else socket.leave(`gm:${campaignId}`);
    data.campaigns?.add(campaignId);
  }
}

function broadcastJournalCreated(
  app: FastifyInstance,
  campaignId: string,
  entry: ReturnType<typeof serializeJournal>
): void {
  app.broadcastCampaign(campaignId, "journal:created", entry, entry.visible ? "all" : "gm");
}

function broadcastJournalUpdated(
  app: FastifyInstance,
  campaignId: string,
  entry: ReturnType<typeof serializeJournal>,
  wasVisible: boolean
): void {
  if (entry.visible) {
    app.broadcastCampaign(campaignId, "journal:updated", entry);
    return;
  }
  app.broadcastCampaign(campaignId, "journal:updated", entry, "gm");
  if (wasVisible) {
    app.broadcastCampaign(campaignId, "journal:deleted", { entryId: entry.id }, "players");
  }
}

function broadcastJournalDeleted(
  app: FastifyInstance,
  campaignId: string,
  entryId: string,
  wasVisible: boolean
): void {
  app.broadcastCampaign(campaignId, "journal:deleted", { entryId }, wasVisible ? "all" : "gm");
}

function joinRequestValidation(character: CharacterRow | null) {
  if (!character) return [];
  try {
    const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    return computeCharacter(draft, contextForDraft(draft)).validation;
  } catch {
    return [];
  }
}

function joinRequestViews(campaignId: string) {
  return campaignJoinRequests(campaignId).map((request) => {
    const character = request.character_id ? getCharacter(request.character_id) : null;
    return serializeJoinRequest(request, joinRequestValidation(character));
  });
}

/** Advance one campaign character and keep linked tokens in sync. */
function advanceCharacterLevel(
  app: FastifyInstance,
  campaign: CampaignRow,
  character: CharacterRow
) {
  let draft;
  try {
    draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
  } catch {
    return null;
  }
  if (draft.level >= 20) return null;
  const context = contextForDraft(
    draft,
    Boolean(campaign.free_archetype),
    Boolean(campaign.automatic_bonus_progression)
  );
  const before = characterSummary(draft, context);
  draft.level += 1;
  if (normalizeXpMode(campaign.xp_mode) === "xp") {
    draft.play.xp = consumeLevelXp(
      draft.play.xp,
      normalizeAdvancementSpeed(campaign.advancement_speed)
    );
  }
  const after = characterSummary(
    draft,
    contextForDraft(
      draft,
      Boolean(campaign.free_archetype),
      Boolean(campaign.automatic_bonus_progression)
    )
  );
  // A wounded character gains the new maximum's HP increase, not just a
  // higher cap that leaves them further below full.
  draft.play.hp = levelUpCurrentHp(draft.play.hp, before.hp, after.hp);
  const summary = characterSummary(
    draft,
    contextForDraft(
      draft,
      Boolean(campaign.free_archetype),
      Boolean(campaign.automatic_bonus_progression)
    )
  );
  db.prepare(
    "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
  ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);

  const linkedTokens = db
    .prepare(
      `SELECT t.* FROM tokens t JOIN scenes s ON s.id = t.scene_id
       WHERE t.character_id = ? AND s.campaign_id = ?`
    )
    .all(character.id, campaign.id) as TokenRow[];
  for (const token of linkedTokens) {
    const nextHp = Math.min(draft.play.hp ?? summary.hp, summary.hp);
    db.prepare(
      "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
    ).run(draft.name, summary.hp, nextHp, summary.ac, now(), token.id);
    const updatedToken = db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as TokenRow;
    tokenEventsFor(app, campaign.id).updated(serializeToken(updatedToken), Boolean(token.hidden));
  }

  app.broadcastCampaign(campaign.id, "character:updated", {
    characterId: character.id,
    summary,
    name: draft.name,
    data: draft,
    revision: Number(
      (
        db.prepare("SELECT revision FROM characters WHERE id = ?").get(character.id) as
          { revision: number } | undefined
      )?.revision ?? 0
    ),
  });
  return summary;
}

function refreshVariantSummaries(app: FastifyInstance, campaign: CampaignRow): void {
  const rows = db
    .prepare("SELECT * FROM characters WHERE campaign_id = ?")
    .all(campaign.id) as CharacterRow[];
  for (const character of rows) {
    let draft;
    try {
      draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    } catch {
      continue;
    }
    const summary = characterSummary(
      draft,
      contextForDraft(
        draft,
        Boolean(campaign.free_archetype),
        Boolean(campaign.automatic_bonus_progression)
      )
    );
    db.prepare(
      "UPDATE characters SET summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(JSON.stringify(summary), now(), character.id);
    const linkedTokens = db
      .prepare(
        `SELECT t.* FROM tokens t JOIN scenes s ON s.id = t.scene_id
         WHERE t.character_id = ? AND s.campaign_id = ?`
      )
      .all(character.id, campaign.id) as TokenRow[];
    for (const token of linkedTokens) {
      const nextHp = Math.min(draft.play.hp ?? summary.hp, summary.hp);
      db.prepare(
        "UPDATE tokens SET hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
      ).run(summary.hp, nextHp, summary.ac, now(), token.id);
      const updatedToken = db
        .prepare("SELECT * FROM tokens WHERE id = ?")
        .get(token.id) as TokenRow;
      tokenEventsFor(app, campaign.id).updated(serializeToken(updatedToken), Boolean(token.hidden));
    }
    app.broadcastCampaign(campaign.id, "character:updated", {
      characterId: character.id,
      summary,
      name: draft.name,
      data: draft,
      revision: Number(
        (
          db.prepare("SELECT revision FROM characters WHERE id = ?").get(character.id) as
            { revision: number } | undefined
        )?.revision ?? 0
      ),
    });
  }
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
    if (body.advancementSpeed !== undefined && !isAdvancementSpeed(body.advancementSpeed)) {
      return reply.code(400).send({ error: "Choose fast, medium, or slow advancement." });
    }
    const advancementSpeed: AdvancementSpeed = normalizeAdvancementSpeed(body.advancementSpeed);
    let code = inviteCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const exists = db.prepare("SELECT id FROM campaigns WHERE invite_code = ?").get(code);
      if (!exists) break;
      code = inviteCode();
    }
    const id = newId("camp");
    const ts = now();
    db.prepare(
      "INSERT INTO campaigns (id, name, description, gm_id, invite_code, ruleset, xp_mode, advancement_speed, created_at, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      name,
      description,
      request.user.id,
      code,
      ruleset,
      xpMode,
      advancementSpeed,
      ts,
      ts,
      ts
    );
    db.prepare(
      "UPDATE campaigns SET free_archetype = ?, automatic_bonus_progression = ? WHERE id = ?"
    ).run(body.freeArchetype === true ? 1 : 0, body.automaticBonusProgression === true ? 1 : 0, id);
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
      detail: `${name} (${ruleset}/${xpMode}/${advancementSpeed})`,
      request,
    });
    return reply.code(201).send({
      campaign: serializeCampaignSummary(row, "gm", campaignCounts(row), request.user.displayName),
    });
  });

  app.post("/api/campaigns/import", { bodyLimit: 256 * 1024 * 1024 }, async (request, reply) => {
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
        detail: `${row.name} (${result.stats.characters} characters)`,
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
      if (serializedCharacter) {
        app.broadcastCampaign(row.id, "character:created", {
          character: { ...serializedCharacter, permissions: undefined },
        });
      }
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

  app.get("/api/campaigns/:id/join-requests", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(campaign, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can review join requests." });
    }
    return reply.send({ requests: joinRequestViews(id) });
  });

  app.post("/api/campaigns/:id/join-requests/:requestId/approve", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, requestId } = request.params as { id: string; requestId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(campaign, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can approve join requests." });
    }
    const joinRequest = getJoinRequest(requestId);
    if (!joinRequest || joinRequest.campaign_id !== id) {
      return reply.code(404).send({ error: "Join request not found." });
    }
    if (joinRequest.status !== "pending") {
      return reply.code(409).send({ error: "That join request has already been resolved." });
    }
    const character = joinRequest.character_id ? getCharacter(joinRequest.character_id) : null;
    if (!character || character.user_id !== joinRequest.user_id) {
      return reply.code(409).send({
        error: "That character is no longer available. Decline the request instead.",
      });
    }
    if (character.campaign_id && character.campaign_id !== id) {
      return reply.code(409).send({ error: "That character already belongs to another campaign." });
    }

    const ts = now();
    if (!getMembership(id, joinRequest.user_id)) {
      db.prepare(
        "INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)"
      ).run(id, joinRequest.user_id, ts);
    }

    let data = character.data;
    let summary = parseJson(character.summary, null) as ReturnType<typeof characterSummary> | null;
    try {
      const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      const ruleset = normalizeCampaignRuleset(campaign.ruleset);
      draft.contentMode = rulesetContentMode(ruleset);
      draft.includeLegacy = rulesetIncludesLegacy(ruleset);
      data = JSON.stringify(draft);
      summary = characterSummary(draft, contextForCampaign(id, draft));
    } catch {
      // Keep the imported draft and summary if normalization fails.
    }
    db.prepare(
      "UPDATE characters SET campaign_id = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(id, data, summary === null ? null : JSON.stringify(summary), ts, character.id);
    db.prepare(
      "UPDATE campaign_join_requests SET status = 'approved', resolved_at = ?, resolved_by = ? WHERE id = ?"
    ).run(ts, request.user.id, joinRequest.id);

    touchCampaign(id);
    const updated = getCharacter(character.id);
    const player = getUser(joinRequest.user_id);
    const serialized = updated
      ? serializeCharacter(updated, player?.display_name ?? "", {
          canEdit: true,
          canView: true,
          canAdvance: false,
        })
      : null;
    if (serialized) {
      app.broadcastCampaign(id, "character:created", {
        character: { ...serialized, permissions: undefined },
      });
    }
    app.broadcastCampaign(
      id,
      "join-request:updated",
      { requestId: joinRequest.id, status: "approved" },
      "gm"
    );
    broadcastCampaignSummary(app, campaign);
    logAudit({
      action: "campaign.join_request.approve",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${character.name} (${player?.display_name ?? "player"})`,
      request,
    });
    return reply.send({
      requestId: joinRequest.id,
      status: "approved",
      character: serialized,
    });
  });

  app.post("/api/campaigns/:id/join-requests/:requestId/decline", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, requestId } = request.params as { id: string; requestId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(campaign, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can decline join requests." });
    }
    const joinRequest = getJoinRequest(requestId);
    if (!joinRequest || joinRequest.campaign_id !== id) {
      return reply.code(404).send({ error: "Join request not found." });
    }
    if (joinRequest.status !== "pending") {
      return reply.code(409).send({ error: "That join request has already been resolved." });
    }
    const character = joinRequest.character_id ? getCharacter(joinRequest.character_id) : null;
    db.prepare(
      "UPDATE campaign_join_requests SET status = 'declined', resolved_at = ?, resolved_by = ? WHERE id = ?"
    ).run(now(), request.user.id, joinRequest.id);
    app.broadcastCampaign(
      id,
      "join-request:updated",
      { requestId: joinRequest.id, status: "declined" },
      "gm"
    );
    broadcastCampaignSummary(app, campaign);
    logAudit({
      action: "campaign.join_request.decline",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: character?.name ?? "Character",
      request,
    });
    return reply.send({ requestId: joinRequest.id, status: "declined" });
  });

  app.delete("/api/campaigns/:id/join-requests/mine", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    const existing = getMembership(id, request.user.id);
    if (existing) {
      return reply.code(409).send({ error: "You are already a member of this campaign." });
    }
    const deleted = db
      .prepare(
        "DELETE FROM campaign_join_requests WHERE campaign_id = ? AND user_id = ? AND status = 'pending'"
      )
      .run(id, request.user.id);
    if (!deleted.changes) {
      return reply.code(404).send({ error: "You do not have a pending request." });
    }
    app.broadcastCampaign(
      id,
      "join-request:updated",
      { requestId: null, status: "withdrawn" },
      "gm"
    );
    return reply.send({ ok: true });
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
      joinRequests: role === "gm" ? joinRequestViews(id) : [],
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
    const sessionZeroRow = db
      .prepare("SELECT * FROM campaign_session_zero WHERE campaign_id = ?")
      .get(id) as CampaignSessionZeroRow | undefined;
    const sessionZero = serializeCampaignSessionZero(sessionZeroRow ?? null, id, true);
    const npcs = (
      db
        .prepare(
          "SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignNpcRow[]
    ).map((row) => serializeCampaignNpc(row));
    const factions = (
      db
        .prepare(
          "SELECT * FROM campaign_factions WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignFactionRow[]
    ).map((row) => serializeCampaignFaction(row));
    const knowledge = (
      db
        .prepare(
          "SELECT * FROM campaign_knowledge WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as CampaignKnowledgeRow[]
    ).map(serializeCampaignKnowledge);
    const chapters = (
      db
        .prepare(
          "SELECT * FROM campaign_chapters WHERE campaign_id = ? ORDER BY sort_order ASC, level_start ASC, created_at ASC"
        )
        .all(id) as CampaignChapterRow[]
    ).map((chapter) => serializeCampaignChapter(chapter));
    const audioTracks = (
      db
        .prepare(
          "SELECT * FROM campaign_audio_tracks WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as AudioTrackRow[]
    ).map(serializeAudioTrack);
    const state = db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(id) as
      | { active_scene_id: string | null; initiative: string; round: number; turn_index: number }
      | undefined;
    const assets = new Set<string>();
    for (const scene of scenes) if (scene.imageUrl) assets.add(scene.imageUrl);
    for (const token of tokens) if (token.imageUrl) assets.add(token.imageUrl);
    for (const character of characters)
      if (character.summary?.portraitUrl) assets.add(character.summary.portraitUrl);
    for (const track of audioTracks) assets.add(track.url);

    const payload: Record<string, unknown> = {
      format: "runehall-campaign",
      version: 1,
      exportedAt: new Date().toISOString(),
      compendium: {
        generatedAt: compendiumManifest.generatedAt ?? null,
        sourceCommit: compendiumManifest.sourceCommit ?? null,
      },
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
      sessionZero,
      npcs,
      factions,
      knowledge,
      chapters,
      messages,
      journal,
      audioTracks,
      xpAwards: (
        db
          .prepare("SELECT * FROM xp_awards WHERE campaign_id = ? ORDER BY created_at ASC")
          .all(id) as XpAwardRow[]
      ).map(serializeXpAward),
      state: {
        activeSceneId: state?.active_scene_id ?? null,
        initiative: serializeInitiative(parseJson(state?.initiative, [])),
        round: state?.round ?? 1,
        turnIndex: state?.turn_index ?? 0,
      },
      assets: [...assets],
      note: "Image and audio files are referenced by URL. Use `npm run backup` to archive the database and data/uploads together. Private player notes are never included in campaign exports.",
    };
    const selfContained =
      (request.query as { selfContained?: string } | undefined)?.selfContained === "1";
    if (selfContained) {
      const allowedExtensions = new Set([
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".avif",
        ".mp3",
        ".ogg",
        ".wav",
        ".m4a",
        ".webm",
      ]);
      const embeddedAssets: Record<string, string> = {};
      const referencedUploads = new Set<string>();
      for (const match of JSON.stringify(payload).matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) {
        referencedUploads.add(match[1]);
      }
      const ownedAssets = new Set(
        (
          db
            .prepare(
              `SELECT filename FROM uploaded_assets
               WHERE campaign_id = ? OR (campaign_id IS NULL AND uploaded_by = ?)`
            )
            .all(id, request.user!.id) as { filename: string }[]
        ).map((row) => row.filename)
      );
      let totalBytes = 0;
      for (const filename of referencedUploads) {
        if (!ownedAssets.has(filename)) continue;
        if (!allowedExtensions.has(path.extname(filename).toLowerCase())) continue;
        const filePath = path.join(uploadsDir(), filename);
        if (!fs.existsSync(filePath)) continue;
        const data = fs.readFileSync(filePath);
        totalBytes += data.length;
        if (totalBytes > 50 * 1024 * 1024) {
          return reply.code(413).send({
            error:
              "This campaign's uploads exceed 50 MB. Use `npm run backup` for a full database and uploads archive.",
          });
        }
        embeddedAssets[`/uploads/${filename}`] = data.toString("base64");
      }
      payload.embeddedAssets = embeddedAssets;
      payload.note =
        "Self-contained export: uploaded images and audio are embedded as base64. Import this file to restore the campaign without the original uploads folder. Private player notes are never included.";
    }
    const safeName = row.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "campaign";
    const suffix = selfContained ? ".runehall.self-contained.json" : ".runehall.json";
    return reply
      .header("Content-Disposition", `attachment; filename="${safeName}${suffix}"`)
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
    if (body.advancementSpeed !== undefined && !isAdvancementSpeed(body.advancementSpeed)) {
      return reply.code(400).send({ error: "Choose fast, medium, or slow advancement." });
    }
    const ruleset =
      body.ruleset === undefined ? normalizeCampaignRuleset(row.ruleset) : body.ruleset;
    const xpMode = body.xpMode === undefined ? normalizeXpMode(row.xp_mode) : body.xpMode;
    const advancementSpeed =
      body.advancementSpeed === undefined
        ? normalizeAdvancementSpeed(row.advancement_speed)
        : body.advancementSpeed;
    const freeArchetype =
      body.freeArchetype === undefined ? Boolean(row.free_archetype) : body.freeArchetype === true;
    const automaticBonusProgression =
      body.automaticBonusProgression === undefined
        ? Boolean(row.automatic_bonus_progression)
        : body.automaticBonusProgression === true;
    const playerItemGrant =
      body.playerItemGrant === undefined
        ? Boolean(row.player_item_grant)
        : body.playerItemGrant === true;
    const variantsChanged =
      freeArchetype !== Boolean(row.free_archetype) ||
      automaticBonusProgression !== Boolean(row.automatic_bonus_progression);
    db.prepare(
      "UPDATE campaigns SET name = ?, description = ?, ruleset = ?, xp_mode = ?, advancement_speed = ?, free_archetype = ?, automatic_bonus_progression = ?, player_item_grant = ?, updated_at = ? WHERE id = ?"
    ).run(
      name,
      description,
      ruleset,
      xpMode,
      advancementSpeed,
      freeArchetype ? 1 : 0,
      automaticBonusProgression ? 1 : 0,
      playerItemGrant ? 1 : 0,
      now(),
      id
    );
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
    if (variantsChanged) refreshVariantSummaries(app, updated);
    broadcastCampaignSummary(app, updated);
    logAudit({
      action: "campaign.update",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${name} (${ruleset}/${xpMode}/${advancementSpeed}; free archetype ${
        freeArchetype ? "on" : "off"
      }; automatic bonus progression ${automaticBonusProgression ? "on" : "off"}; player gear grant ${
        playerItemGrant ? "on" : "off"
      })`,
      request,
    });
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
    const body = (request.body ?? {}) as Record<string, unknown>;
    const confirmName = safeString(body.confirmName, "", 80).trim();
    if (confirmName !== row.name) {
      return reply.code(400).send({
        error: `Type the campaign name "${row.name}" exactly to confirm permanent deletion.`,
      });
    }
    app.broadcastCampaign(id, "campaign:deleted", { campaignId: id });
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

  app.post("/api/campaigns/:id/transfer", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can transfer the campaign." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetId = safeString(body.userId, "", 120);
    if (!targetId) return reply.code(400).send({ error: "Choose a campaign member." });
    if (targetId === row.gm_id) {
      return reply.code(400).send({ error: "That member is already the GM." });
    }
    const membership = getMembership(id, targetId);
    if (!membership) {
      return reply
        .code(400)
        .send({ error: "The new GM must already be a member of this campaign." });
    }
    const ts = now();
    transaction(() => {
      db.prepare("UPDATE campaigns SET gm_id = ?, updated_at = ? WHERE id = ?").run(
        targetId,
        ts,
        id
      );
      db.prepare(
        "UPDATE campaign_members SET role = 'player' WHERE campaign_id = ? AND user_id = ?"
      ).run(id, row.gm_id);
      db.prepare(
        "UPDATE campaign_members SET role = 'gm' WHERE campaign_id = ? AND user_id = ?"
      ).run(id, targetId);
    });
    // Role rooms are joined at socket connect time, so swap them immediately
    // rather than waiting for either GM to reconnect.
    syncUserCampaignRooms(app, id, row.gm_id, "player");
    syncUserCampaignRooms(app, id, targetId, "gm");
    touchCampaign(id);
    logAudit({
      action: "campaign.transfer",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Transferred GM from ${getUser(row.gm_id)?.display_name ?? row.gm_id} to ${getUser(targetId)?.display_name ?? targetId}`,
      request,
    });
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send({
      campaign: serializeCampaignSummary(
        getCampaign(id)!,
        "gm",
        campaignCounts(getCampaign(id)!),
        request.user.displayName
      ),
    });
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
    unassignCampaignCharacters(app, id, request.user.id);
    ejectUserSockets(app, id, request.user.id);
    broadcastCampaignSummary(app, row);
    touchCampaign(id);
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
    unassignCampaignCharacters(app, id, userId);
    ejectUserSockets(app, id, userId, true);
    // The removed player should not be able to reuse the old invite code.
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
    broadcastCampaignSummary(app, getCampaign(id)!);
    touchCampaign(id);
    logAudit({
      action: "campaign.member_remove",
      actor: request.user,
      targetType: "campaign_member",
      targetId: userId,
      detail: `${row.name} / ${userId}`,
      request,
    });
    return reply.send({ ok: true, inviteCode: code });
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
      const summary = advanceCharacterLevel(app, row, character);
      if (summary) {
        leveled += 1;
        continue;
      }
      try {
        const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
        if (draft.level >= 20) atMaxLevel += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
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
    const questStatus = kind === "handout" ? normalizeQuestStatus(body.questStatus) : "none";
    const questXp = kind === "handout" ? normalizeQuestXp(body.questXp) : 0;
    const entryId = newId("journal");
    const ts = now();
    db.prepare(
      `INSERT INTO journal_entries
        (id, campaign_id, title, content, visible, kind, attachments, quest_status, quest_xp, quest_rewarded_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entryId,
      id,
      title,
      content,
      visible ? 1 : 0,
      kind,
      JSON.stringify(attachments),
      questStatus,
      questXp,
      null,
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
    touchCampaign(id);
    broadcastJournalCreated(app, id, serializeJournal(row));
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
    const existingStatus = normalizeQuestStatus(existing.quest_status);
    const existingXp = normalizeQuestXp(existing.quest_xp);
    const questStatus =
      kind === "handout"
        ? body.questStatus === undefined
          ? existingStatus
          : normalizeQuestStatus(body.questStatus)
        : "none";
    const questXp =
      kind === "handout"
        ? body.questXp === undefined
          ? existingXp
          : normalizeQuestXp(body.questXp)
        : 0;
    // A paid quest reward stays paid even if the GM later edits the handout;
    // this prevents a double award through the same entry.
    const questRewardedAt = existing.quest_rewarded_at;
    db.prepare(
      "UPDATE journal_entries SET title = ?, content = ?, visible = ?, kind = ?, attachments = ?, quest_status = ?, quest_xp = ?, quest_rewarded_at = ?, updated_at = ? WHERE id = ?"
    ).run(
      title,
      content,
      visible ? 1 : 0,
      kind,
      JSON.stringify(attachments),
      questStatus,
      questXp,
      questRewardedAt,
      now(),
      entryId
    );
    const row = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`
      )
      .get(entryId) as import("../db").JournalRow & { author_name: string | null };
    touchCampaign(id);
    broadcastJournalUpdated(app, id, serializeJournal(row), Boolean(existing.visible));
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
        (id, campaign_id, title, content, visible, kind, attachments, quest_status, quest_xp, quest_rewarded_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      duplicateId,
      id,
      `${existing.title} (copy)`.slice(0, 140),
      existing.content,
      existing.visible,
      normalizeJournalKind(existing.kind),
      existing.attachments,
      normalizeQuestStatus(existing.quest_status),
      normalizeQuestXp(existing.quest_xp),
      null,
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
    broadcastJournalCreated(app, id, serializeJournal(row));
    return reply.code(201).send({ entry: serializeJournal(row) });
  });

  app.post("/api/campaigns/:id/journal/:entryId/award-quest-xp", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, entryId } = request.params as { id: string; entryId: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm") {
      return reply.code(403).send({ error: "Only the GM can award quest XP." });
    }
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (normalizeXpMode(campaign.xp_mode) !== "xp") {
      return reply.code(400).send({ error: "Quest XP is only awarded in XP tracking mode." });
    }
    const existing = db
      .prepare("SELECT * FROM journal_entries WHERE id = ? AND campaign_id = ?")
      .get(entryId, id) as JournalRow | undefined;
    if (!existing) return reply.code(404).send({ error: "Journal entry not found." });
    if (
      normalizeJournalKind(existing.kind) !== "handout" ||
      normalizeQuestStatus(existing.quest_status) !== "completed"
    ) {
      return reply.code(400).send({ error: "Complete a quest handout before awarding its XP." });
    }
    if (existing.quest_rewarded_at) {
      return reply.code(409).send({ error: "That quest reward has already been awarded." });
    }
    const amount = normalizeQuestXp(existing.quest_xp);
    if (amount < 1) return reply.code(400).send({ error: "Set a quest XP reward first." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const requested = Array.isArray(body.characterIds)
      ? body.characterIds.filter((value): value is string => typeof value === "string")
      : [];
    const rows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    const selected = requested.length
      ? rows.filter((character) => requested.includes(character.id))
      : rows;
    if (!selected.length) {
      return reply.code(400).send({ error: "Choose at least one character in this campaign." });
    }
    let recipients = 0;
    let skipped = 0;
    let rewardedAt = 0;
    let questAwardId = "";
    const actorId = request.user.id;
    const updates: { character: CharacterRow; draft: CharacterDraft; summary: CharacterSummary }[] =
      [];
    transaction(() => {
      for (const character of selected) {
        let draft;
        try {
          draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
        } catch {
          skipped += 1;
          continue;
        }
        draft.play.xp = Math.max(0, Math.round(draft.play.xp + amount));
        const summary = characterSummary(draft, contextForCampaign(id, draft));
        db.prepare(
          "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
        ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
        updates.push({ character, draft, summary });
        recipients += 1;
      }
      rewardedAt = now();
      db.prepare(
        "UPDATE journal_entries SET quest_rewarded_at = ?, updated_at = ? WHERE id = ?"
      ).run(rewardedAt, rewardedAt, entryId);
      questAwardId = newId("xpa");
      db.prepare(
        "INSERT INTO xp_awards (id, campaign_id, actor_id, kind, amount, reason, recipient_count, created_at) VALUES (?, ?, ?, 'quest', ?, ?, ?, ?)"
      ).run(questAwardId, id, actorId, amount, `Quest: ${existing.title}`, recipients, rewardedAt);
    });
    for (const update of updates) {
      app.broadcastCampaign(id, "character:updated", {
        characterId: update.character.id,
        summary: update.summary,
        name: update.draft.name,
        data: update.draft,
        revision: Number(
          (
            db.prepare("SELECT revision FROM characters WHERE id = ?").get(update.character.id) as
              { revision: number } | undefined
          )?.revision ?? 0
        ),
      });
    }
    touchCampaign(id);
    logAudit({
      action: "campaign.quest_xp",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${amount} XP from ${existing.title} to ${recipients} characters`,
      request,
    });
    const row = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`
      )
      .get(entryId) as JournalRow & { author_name: string | null };
    broadcastJournalUpdated(app, id, serializeJournal(row), Boolean(existing.visible));
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    const award = db
      .prepare("SELECT * FROM xp_awards WHERE id = ?")
      .get(questAwardId) as XpAwardRow;
    return reply.send({
      entry: serializeJournal(row),
      amount,
      recipients,
      skipped,
      characters,
      award: serializeXpAward(award),
    });
  });

  app.delete("/api/campaigns/:id/journal/:entryId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, entryId } = request.params as { id: string; entryId: string };
    const role = getMembership(id, request.user.id)?.role;
    if (role !== "gm")
      return reply.code(403).send({ error: "Only the GM can delete journal entries." });
    const existing = db
      .prepare("SELECT * FROM journal_entries WHERE id = ? AND campaign_id = ?")
      .get(entryId, id) as JournalRow | undefined;
    db.prepare("DELETE FROM journal_entries WHERE id = ? AND campaign_id = ?").run(entryId, id);
    touchCampaign(id);
    broadcastJournalDeleted(app, id, entryId, Boolean(existing?.visible));
    return reply.send({ ok: true });
  });
}
