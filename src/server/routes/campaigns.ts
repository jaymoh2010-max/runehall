import type { FastifyInstance } from "fastify";
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
  type AudioTrackRow,
  type CampaignDashboardRow,
  type CampaignFactionRow,
  type CampaignKnowledgeRow,
  type CampaignChapterRow,
  type CampaignMerchantRow,
  type CampaignNpcRow,
  type CampaignRow,
  type CampaignSessionZeroRow,
  type CampaignTravelRow,
  type CharacterRow,
  type EncounterRow,
  type JournalRow,
  type LootParcelRow,
  type MessageRow,
  type SceneRow,
  type TokenRow,
  type XpAwardRow,
} from "../db";
import {
  serializeAudioTrack,
  serializeCampaignDashboard,
  serializeCampaignFaction,
  serializeCampaignKnowledge,
  serializeCampaignChapter,
  serializeCampaignNpc,
  serializeCampaignSummary,
  serializeCampaignTravel,
  serializeCampaignSessionZero,
  serializeCharacter,
  serializeEncounter,
  serializeInitiative,
  serializeJoinRequest,
  serializeJournal,
  serializeLootParcel,
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
import {
  characterSummary,
  computeCharacter,
  isPreparedCasterClass,
  normalizeCharacterDraft,
  replacementWealthGrantCp,
  startingWealthCp,
} from "../../shared/rules";
import { addCurrency } from "../../shared/inventory";
import { applyLongRest, type LongRestResult } from "../../shared/rest";
import { levelUpCurrentHp } from "../../shared/levelup";
import { normalizeTokenConditions, syncLifeConditions } from "../../shared/tokens";
import {
  isJournalKind,
  normalizeJournalAttachments,
  normalizeJournalKind,
  normalizeQuestStatus,
  normalizeQuestXp,
} from "../../shared/journal";
import {
  ACCOMPLISHMENT_LABELS,
  ACCOMPLISHMENT_XP,
  consumeLevelXp,
  hazardXp,
  isAccomplishmentTier,
  isAdvancementSpeed,
  normalizeAdvancementSpeed,
  normalizeXpAwardKind,
  type AdvancementSpeed,
  type AccomplishmentTier,
} from "../../shared/xp";
import {
  isSettlementLevel,
  normalizeSettlementLevel,
  normalizeShopStockMode,
  shopStockCount,
} from "../../shared/shop";
import { grantHeroPoints, resetHeroPoints } from "../../shared/heroPoints";
import { normalizeGolarionDate, shiftGolarionDate } from "../../shared/calendar";
import { contextForDraft } from "../compendium";
import { campaignSessionsFor } from "../sessionData";
import { importCampaign } from "../campaignImport";
import { logAudit } from "../audit";
import {
  inviteCode,
  newId,
  now,
  parseJson,
  safeInt,
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
  db.prepare(
    `UPDATE tokens SET character_id = NULL, owner_id = NULL, updated_at = ?
     WHERE character_id IN (${placeholders})`
  ).run(now(), ...ids);
  db.prepare(
    `UPDATE characters SET campaign_id = NULL, updated_at = ? WHERE id IN (${placeholders})`
  ).run(now(), ...ids);
  for (const row of rows) {
    app.broadcastCampaign(campaignId, "character:removed", { characterId: row.id });
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
    if (body.settlementLevel !== undefined && !isSettlementLevel(body.settlementLevel)) {
      return reply.code(400).send({ error: "Choose a settlement level between 0 and 25." });
    }
    const settlementLevel = normalizeSettlementLevel(body.settlementLevel);
    let code = inviteCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const exists = db.prepare("SELECT id FROM campaigns WHERE invite_code = ?").get(code);
      if (!exists) break;
      code = inviteCode();
    }
    const id = newId("camp");
    const ts = now();
    db.prepare(
      "INSERT INTO campaigns (id, name, description, gm_id, invite_code, ruleset, xp_mode, advancement_speed, settlement_level, created_at, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      name,
      description,
      request.user.id,
      code,
      ruleset,
      xpMode,
      advancementSpeed,
      settlementLevel,
      ts,
      ts,
      ts
    );
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
      detail: `${name} (${ruleset}/${xpMode}/${advancementSpeed}/settlement ${settlementLevel})`,
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
      summary = characterSummary(draft, contextForDraft(draft));
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
      app.broadcastCampaign(id, "character:created", { character: serialized });
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
    const loot = (
      db
        .prepare(
          "SELECT * FROM loot_parcels WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(id) as LootParcelRow[]
    ).map(serializeLootParcel);
    const legacyShopStock = (
      db
        .prepare(
          "SELECT item_id, quantity FROM campaign_shop_stock WHERE campaign_id = ? ORDER BY item_id ASC"
        )
        .all(id) as { item_id: string; quantity: number }[]
    ).map((entry) => ({ itemId: entry.item_id, quantity: shopStockCount(entry.quantity) }));
    const merchants = (
      db
        .prepare(
          "SELECT * FROM campaign_merchants WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
        )
        .all(id) as CampaignMerchantRow[]
    ).map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      description: merchant.description,
      mode: normalizeShopStockMode(merchant.mode),
      active: Boolean(merchant.active),
      sortOrder: merchant.sort_order,
      stock: (parseJson<unknown>(merchant.stock, []) as unknown[])
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object")
        )
        .map((entry) => ({
          itemId: typeof entry.itemId === "string" ? entry.itemId : "",
          quantity: shopStockCount(entry.quantity),
        }))
        .filter((entry) => entry.itemId),
      createdAt: merchant.created_at,
      updatedAt: merchant.updated_at,
    }));
    const activeMerchant = merchants.find((merchant) => merchant.active) ?? merchants[0];
    const shopStock = activeMerchant?.stock.length ? activeMerchant.stock : legacyShopStock;
    const travelRow = db.prepare("SELECT * FROM campaign_travel WHERE campaign_id = ?").get(id) as
      CampaignTravelRow | undefined;
    const travel = travelRow
      ? serializeCampaignTravel(travelRow, new Set(characters.map((entry) => entry.id)), true)
      : null;
    const sessionZeroRow = db
      .prepare("SELECT * FROM campaign_session_zero WHERE campaign_id = ?")
      .get(id) as CampaignSessionZeroRow | undefined;
    const sessionZero = serializeCampaignSessionZero(sessionZeroRow ?? null, id, true);
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
    const sessions = campaignSessionsFor(id, "gm", request.user.id);
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
      shopStock,
      merchants,
      travel,
      sessionZero,
      dashboard,
      npcs,
      factions,
      knowledge,
      chapters,
      sessions,
      messages,
      journal,
      audioTracks,
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
      let totalBytes = 0;
      for (const filename of referencedUploads) {
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
    if (body.settlementLevel !== undefined && !isSettlementLevel(body.settlementLevel)) {
      return reply.code(400).send({ error: "Choose a settlement level between 0 and 25." });
    }
    const ruleset =
      body.ruleset === undefined ? normalizeCampaignRuleset(row.ruleset) : body.ruleset;
    const xpMode = body.xpMode === undefined ? normalizeXpMode(row.xp_mode) : body.xpMode;
    const advancementSpeed =
      body.advancementSpeed === undefined
        ? normalizeAdvancementSpeed(row.advancement_speed)
        : body.advancementSpeed;
    const settlementLevel =
      body.settlementLevel === undefined
        ? normalizeSettlementLevel(row.settlement_level)
        : body.settlementLevel;
    db.prepare(
      "UPDATE campaigns SET name = ?, description = ?, ruleset = ?, xp_mode = ?, advancement_speed = ?, settlement_level = ?, updated_at = ? WHERE id = ?"
    ).run(name, description, ruleset, xpMode, advancementSpeed, settlementLevel, now(), id);
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
    broadcastCampaignSummary(app, updated);
    return reply.send({
      campaign: serializeCampaignSummary(updated, "gm", campaignCounts(updated)),
    });
  });

  app.put("/api/campaigns/:id/calendar", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can change the in-world date." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.year === undefined && body.month === undefined && body.day === undefined) {
      return reply.code(400).send({ error: "Choose a year, month, and day." });
    }
    // Merge a partial update with the current date rather than resetting the
    // omitted fields to the calendar's defaults.
    const merged = {
      year: body.year === undefined ? row.world_year : body.year,
      month: body.month === undefined ? row.world_month : body.month,
      day: body.day === undefined ? row.world_day : body.day,
    };
    for (const value of [merged.year, merged.month, merged.day]) {
      if (value === null || value === "" || !Number.isFinite(Number(value))) {
        return reply.code(400).send({ error: "Enter a valid in-world date." });
      }
    }
    const worldDate = normalizeGolarionDate(merged);
    db.prepare(
      "UPDATE campaigns SET world_year = ?, world_month = ?, world_day = ?, updated_at = ? WHERE id = ?"
    ).run(worldDate.year, worldDate.month, worldDate.day, now(), id);
    touchCampaign(id);
    logAudit({
      action: "campaign.calendar_set",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${worldDate.day}/${worldDate.month}/${worldDate.year} AR`,
      request,
    });
    const updated = getCampaign(id)!;
    broadcastCampaignSummary(app, updated);
    return reply.send({
      worldDate,
      campaign: serializeCampaignSummary(updated, "gm", campaignCounts(updated)),
    });
  });

  app.post("/api/campaigns/:id/calendar/advance", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can advance the in-world date." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const days = safeInt(body.days, 0, -3650, 3650);
    if (!days) return reply.code(400).send({ error: "Advance by at least one day." });
    const current = {
      year: row.world_year,
      month: row.world_month,
      day: row.world_day,
    };
    const worldDate = shiftGolarionDate(current, days);
    db.prepare(
      "UPDATE campaigns SET world_year = ?, world_month = ?, world_day = ?, updated_at = ? WHERE id = ?"
    ).run(worldDate.year, worldDate.month, worldDate.day, now(), id);
    touchCampaign(id);
    logAudit({
      action: "campaign.calendar_advance",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${days} day${days === 1 ? "" : "s"} to ${worldDate.day}/${worldDate.month}/${worldDate.year} AR`,
      request,
    });
    const updated = getCampaign(id)!;
    broadcastCampaignSummary(app, updated);
    return reply.send({
      worldDate,
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
      draft.level += 1;
      if (normalizeXpMode(row.xp_mode) === "xp") {
        draft.play.xp = consumeLevelXp(
          draft.play.xp,
          normalizeAdvancementSpeed(row.advancement_speed)
        );
      }
      const after = characterSummary(draft, contextForDraft(draft));
      // A wounded character gains the new maximum's HP increase, not just a
      // higher cap that leaves them further below full.
      draft.play.hp = levelUpCurrentHp(draft.play.hp, before.hp, after.hp);
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);

      const linkedTokens = db
        .prepare("SELECT * FROM tokens WHERE character_id = ?")
        .all(character.id) as TokenRow[];
      for (const token of linkedTokens) {
        const nextHp = Math.min(draft.play.hp ?? summary.hp, summary.hp);
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
        ).run(draft.name, summary.hp, nextHp, summary.ac, now(), token.id);
        const updatedToken = db
          .prepare("SELECT * FROM tokens WHERE id = ?")
          .get(token.id) as TokenRow;
        tokenEventsFor(app, id).updated(serializeToken(updatedToken), Boolean(token.hidden));
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

  app.post("/api/campaigns/:id/catch-up", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can catch characters up." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const characterId = typeof body.characterId === "string" ? body.characterId : null;
    const characterRows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    if (!characterRows.length) {
      return reply.code(400).send({ error: "There are no characters in this campaign yet." });
    }

    const parsed: { character: CharacterRow; draft: ReturnType<typeof normalizeCharacterDraft> }[] =
      [];
    let skipped = 0;
    for (const character of characterRows) {
      try {
        const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
        parsed.push({ character, draft });
      } catch {
        skipped += 1;
      }
    }
    if (!parsed.length) {
      return reply.code(400).send({ error: "No character drafts in this campaign could be read." });
    }
    if (characterId && !parsed.some((entry) => entry.character.id === characterId)) {
      return reply.code(404).send({ error: "That character is not in this campaign." });
    }

    const targetLevel = Math.max(...parsed.map((entry) => entry.draft.level));
    const xpMode = normalizeXpMode(row.xp_mode) === "xp";
    const targetXp = xpMode ? Math.max(...parsed.map((entry) => entry.draft.play.xp)) : 0;
    const selected = characterId
      ? parsed.filter((entry) => entry.character.id === characterId)
      : parsed;

    let caughtUp = 0;
    let alreadyCurrent = 0;
    for (const { character, draft } of selected) {
      const levelChanged = draft.level < targetLevel;
      const xpChanged = xpMode && draft.play.xp < targetXp;
      if (!levelChanged && !xpChanged) {
        alreadyCurrent += 1;
        continue;
      }
      const before = characterSummary(draft, contextForDraft(draft));
      if (levelChanged) draft.level = targetLevel;
      if (xpMode) draft.play.xp = Math.max(draft.play.xp, targetXp);
      const after = characterSummary(draft, contextForDraft(draft));
      if (levelChanged) {
        draft.play.hp = levelUpCurrentHp(draft.play.hp, before.hp, after.hp);
      }
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);

      const linkedTokens = db
        .prepare("SELECT * FROM tokens WHERE character_id = ?")
        .all(character.id) as TokenRow[];
      for (const token of linkedTokens) {
        const nextHp = Math.min(draft.play.hp ?? summary.hp, summary.hp);
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
        ).run(draft.name, summary.hp, nextHp, summary.ac, now(), token.id);
        const updatedToken = db
          .prepare("SELECT * FROM tokens WHERE id = ?")
          .get(token.id) as TokenRow;
        tokenEventsFor(app, id).updated(serializeToken(updatedToken), Boolean(token.hidden));
      }

      app.broadcastCampaign(id, "character:updated", {
        characterId: character.id,
        summary,
        name: draft.name,
      });
      caughtUp += 1;
    }

    touchCampaign(id);
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    logAudit({
      action: "campaign.catch_up",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: characterId
        ? `${selected[0]?.character.name ?? "Character"}: ${caughtUp ? `caught up to level ${targetLevel}` : "already current"}`
        : `${caughtUp} caught up to level ${targetLevel}, ${alreadyCurrent} already current, ${skipped} skipped`,
      request,
    });
    return reply.send({
      caughtUp,
      alreadyCurrent,
      skipped,
      targetLevel,
      targetXp,
      characters,
    });
  });

  app.post("/api/campaigns/:id/characters/:characterId/wealth", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, characterId } = request.params as { id: string; characterId: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can grant replacement wealth." });
    }
    const character = getCharacter(characterId);
    if (!character || character.campaign_id !== id) {
      return reply.code(404).send({ error: "That character is not part of this campaign." });
    }
    let draft;
    try {
      draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const derived = computeCharacter(draft, contextForDraft(draft));
    const committedCp = derived.wealth.committed;
    const targetCp = startingWealthCp(draft.level);
    const grantCp = replacementWealthGrantCp(draft.level, committedCp);
    let summary = characterSummary(draft, contextForDraft(draft));
    if (grantCp > 0) {
      draft.currency = addCurrency(draft.currency, grantCp);
      // This is play-history wealth, not a fresh creation budget.
      draft.wealthBudgetCp = null;
      summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
      app.broadcastCampaign(id, "character:updated", {
        characterId: character.id,
        summary,
        name: draft.name,
      });
      touchCampaign(id);
      logAudit({
        action: "campaign.wealth_grant",
        actor: request.user,
        targetType: "campaign",
        targetId: id,
        detail: `${draft.name}: ${grantCp} cp to level ${draft.level} wealth`,
        request,
      });
    }
    const updated = getCharacter(character.id)!;
    const owner = getUser(updated.user_id);
    return reply.send({
      character: serializeCharacter(updated, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
      }),
      grantCp,
      targetCp,
      committedCp: committedCp + grantCp,
    });
  });

  app.get("/api/campaigns/:id/xp-awards", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can view the XP ledger." });
    }
    const query = request.query as { limit?: string };
    const limit = safeInt(query.limit, 20, 1, 100);
    const awards = (
      db
        .prepare(
          "SELECT * FROM xp_awards WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?"
        )
        .all(id, limit) as XpAwardRow[]
    ).map(serializeXpAward);
    return reply.send({ awards });
  });

  app.post("/api/campaigns/:id/award-xp", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can award XP." });
    }
    if (normalizeXpMode(row.xp_mode) !== "xp") {
      return reply.code(400).send({ error: "Award XP in XP tracking mode." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const kind = normalizeXpAwardKind(body.kind);
    if (kind === "quest") {
      return reply.code(400).send({ error: "Award quest XP from a completed quest handout." });
    }
    let amount = 0;
    let defaultReason = "";
    if (kind === "hazard") {
      const hazardLevel = Number(body.hazardLevel);
      if (!Number.isInteger(hazardLevel) || hazardLevel < 0 || hazardLevel > 30) {
        return reply.code(400).send({ error: "Choose a hazard level between 0 and 30." });
      }
      const partyLevel = safeInt(body.partyLevel, 1, 1, 20);
      const complexity = body.hazardComplexity === "simple" ? "simple" : "complex";
      amount = hazardXp(hazardLevel, partyLevel, complexity);
      if (amount < 1) {
        return reply
          .code(400)
          .send({ error: "A hazard more than four levels below the party awards no XP." });
      }
      const label = complexity === "simple" ? "Simple hazard" : "Complex hazard";
      defaultReason = `${label} ${hazardLevel} vs party ${partyLevel}`;
    } else if (kind === "accomplishment") {
      const tier: AccomplishmentTier = isAccomplishmentTier(body.tier) ? body.tier : "moderate";
      amount = ACCOMPLISHMENT_XP[tier];
      defaultReason = `${ACCOMPLISHMENT_LABELS[tier]} accomplishment`;
    } else {
      amount = safeInt(body.amount, 0, 1, 100_000);
      if (amount < 1) return reply.code(400).send({ error: "Award at least 1 XP." });
    }
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
    const reason = sanitizeUserText(body.reason, 200) || defaultReason;
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

    const awardId = newId("xpa");
    db.prepare(
      "INSERT INTO xp_awards (id, campaign_id, actor_id, kind, amount, reason, recipient_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(awardId, id, request.user.id, kind, amount, reason, recipients, now());
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
    const award = db.prepare("SELECT * FROM xp_awards WHERE id = ?").get(awardId) as XpAwardRow;
    return reply.send({
      amount,
      recipients,
      skipped,
      characters,
      award: serializeXpAward(award),
    });
  });

  app.post("/api/campaigns/:id/award-hero-points", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can award Hero Points." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const amount = safeInt(body.amount, 1, 1, 3);
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
    const rows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    const selected = rows.filter((character) => characterIds.includes(character.id));
    if (!selected.length) {
      return reply.code(400).send({ error: "Those characters are not in this campaign." });
    }
    let recipients = 0;
    let capped = 0;
    let skipped = 0;
    for (const character of selected) {
      let draft;
      try {
        draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      } catch {
        skipped += 1;
        continue;
      }
      const grant = grantHeroPoints(draft.play.heroPoints, amount);
      if (grant.capped > 0) capped += 1;
      if (grant.gained <= 0) continue;
      draft.play.heroPoints = grant.value;
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
      action: "campaign.award_hero_points",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${amount} Hero Point${amount === 1 ? "" : "s"} to ${recipients} characters${
        capped ? ` (${capped} at cap)` : ""
      }`,
      request,
    });
    return reply.send({ amount, recipients, capped, skipped, characters });
  });

  app.post("/api/campaigns/:id/reset-hero-points", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can reset Hero Points." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const value = resetHeroPoints(body.value === undefined ? 1 : body.value);
    const requested = Array.isArray(body.characterIds)
      ? body.characterIds.filter((entry): entry is string => typeof entry === "string")
      : [];
    const rows = db
      .prepare("SELECT * FROM characters WHERE campaign_id = ?")
      .all(id) as CharacterRow[];
    const selected = requested.length
      ? rows.filter((character) => requested.includes(character.id))
      : rows;
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
      if (draft.play.heroPoints === value) continue;
      draft.play.heroPoints = value;
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
      action: "campaign.reset_hero_points",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Reset ${recipients} characters to ${value} Hero Point${value === 1 ? "" : "s"}`,
      request,
    });
    return reply.send({ value, recipients, skipped, characters });
  });

  app.post("/api/campaigns/:id/downtime", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCampaign(id);
    if (!row) return reply.code(404).send({ error: "Campaign not found." });
    if (roleFor(row, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can grant downtime." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const days = safeInt(body.days, 0, 1, 3650);
    if (days < 1) return reply.code(400).send({ error: "Grant at least one downtime day." });
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
    for (const character of selected) {
      let draft;
      try {
        draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      } catch {
        skipped += 1;
        continue;
      }
      draft.play.downtimeDays = Math.min(9_999, draft.play.downtimeDays + days);
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
    logAudit({
      action: "campaign.downtime_grant",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${days} downtime day${days === 1 ? "" : "s"} to ${recipients} characters`,
      request,
    });
    const characters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: true,
        canView: true,
      })
    );
    return reply.send({ days, recipients, skipped, characters });
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
        const context = contextForDraft(draft);
        result = applyLongRest(draft, computeCharacter(draft, context), {
          preparedCaster: isPreparedCasterClass(context.classData?.name),
        });
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
        const tokenConditions = syncLifeConditions(
          normalizeTokenConditions(parseJson(token.conditions, [])),
          result.draft.play.conditions
        );
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, conditions = ?, updated_at = ? WHERE id = ?"
        ).run(
          result.draft.name,
          summary.hp,
          result.draft.play.hp === null
            ? summary.hp
            : Math.max(0, Math.min(summary.hp, result.draft.play.hp)),
          summary.ac,
          JSON.stringify(tokenConditions),
          now(),
          token.id
        );
        const updatedToken = db
          .prepare("SELECT * FROM tokens WHERE id = ?")
          .get(token.id) as TokenRow;
        tokenEventsFor(app, id).updated(serializeToken(updatedToken), Boolean(token.hidden));
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
    const rewardedAt = now();
    db.prepare("UPDATE journal_entries SET quest_rewarded_at = ?, updated_at = ? WHERE id = ?").run(
      rewardedAt,
      rewardedAt,
      entryId
    );
    const questAwardId = newId("xpa");
    db.prepare(
      "INSERT INTO xp_awards (id, campaign_id, actor_id, kind, amount, reason, recipient_count, created_at) VALUES (?, ?, ?, 'quest', ?, ?, ?, ?)"
    ).run(
      questAwardId,
      id,
      request.user.id,
      amount,
      `Quest: ${existing.title}`,
      recipients,
      rewardedAt
    );
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
