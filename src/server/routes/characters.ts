import type { FastifyInstance } from "fastify";
import {
  characterSummary,
  computeCharacter,
  emptyCharacterDraft,
  normalizeCharacterDraft,
} from "../../shared/rules";
import type { CharacterDraft, CharacterSummary } from "../../shared/types";
import {
  canAdvanceCharacter,
  canEditCharacter,
  canViewCharacter,
  getCampaign,
  getCampaignRole,
  getCharacter,
  getMembership,
  getUser,
  pendingJoinRequest,
} from "../access";
import {
  normalizeCampaignRuleset,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../../shared/content";
import { contextForDraft } from "../compendium";
import { importPathbuilder } from "../pathbuilder";
import { db, type CampaignRow, type CharacterRow, type TokenRow } from "../db";
import { serializeCharacter, serializeToken, touchCampaign } from "../serialize";
import { shiftGolarionDate } from "../../shared/calendar";
import { broadcastCampaignSummary } from "../campaignEvents";
import { tokenEventsFor } from "../tokenEvents";
import {
  addCurrency,
  addItemToDraft,
  currencyToCp,
  removeItemQuantity,
  spendCurrency,
} from "../../shared/inventory";
import { conditionNumericValue, conditionsFromSheet } from "../../shared/tokens";
import { characterTokenTurnEffects } from "../../shared/characterTurnEffects";
import { applyHeroicRecovery } from "../../shared/damage";
import { rollFormula, signed } from "../../shared/dice";
import {
  RECOVERY_ACTIVITIES,
  applyRecoveryToDraft,
  clearRecoveryImmunities,
  hasRecoveryFeat,
  medicineRank,
  recoveryActivityLabel,
  recoveryDcsForRank,
  recoveryHealingFormula,
  type RecoveryActivity,
} from "../../shared/recovery";
import { lifestyleRate, upkeepCostCp } from "../../shared/upkeep";
import { performDowntimeDay, type DowntimeActivityInput } from "../downtime";
import { logAudit } from "../audit";
import { newId, now, parseJson, safeInt, safeString, sanitizeUserText } from "../util";

function parseDraft(raw: unknown, fallbackName = "New Hero"): CharacterDraft {
  const draft = normalizeCharacterDraft(raw, fallbackName);
  if (draft.name === "New Hero" && raw && typeof raw === "object") {
    const name = safeString((raw as Record<string, unknown>).name, "", 120);
    if (name) draft.name = name;
  }
  return draft;
}

function summarize(draft: CharacterDraft): CharacterSummary {
  return characterSummary(draft, contextForDraft(draft));
}

function contextForCharacter(row: CharacterRow, draft: CharacterDraft) {
  const campaign = row.campaign_id ? getCampaign(row.campaign_id) : null;
  return contextForDraft(
    draft,
    Boolean(campaign?.free_archetype),
    Boolean(campaign?.automatic_bonus_progression)
  );
}

/** Downtime and long rests consume in-world days, not just character resources. */
function advanceCampaignDate(app: FastifyInstance, campaignId: string, days: number): void {
  if (days <= 0) return;
  const campaign = getCampaign(campaignId);
  if (!campaign) return;
  const worldDate = shiftGolarionDate(
    { year: campaign.world_year, month: campaign.world_month, day: campaign.world_day },
    days
  );
  db.prepare(
    "UPDATE campaigns SET world_year = ?, world_month = ?, world_day = ?, updated_at = ? WHERE id = ?"
  ).run(worldDate.year, worldDate.month, worldDate.day, now(), campaignId);
  const updated = getCampaign(campaignId);
  if (updated) broadcastCampaignSummary(app, updated);
}

export function syncCharacterDraft(
  app: FastifyInstance,
  row: CharacterRow,
  draft: CharacterDraft,
  summary: CharacterSummary
): void {
  if (!row.campaign_id) return;
  // Keep any linked table tokens in step with the sheet.
  const linkedTokens = db
    .prepare("SELECT * FROM tokens WHERE character_id = ?")
    .all(row.id) as TokenRow[];
  for (const token of linkedTokens) {
    db.prepare(
      "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, conditions = ?, turn_effects = ?, updated_at = ? WHERE id = ?"
    ).run(
      draft.name,
      summary.hp,
      draft.play.hp === null ? summary.hp : Math.max(0, Math.min(summary.hp, draft.play.hp)),
      summary.ac,
      JSON.stringify(conditionsFromSheet(draft.play.conditions)),
      JSON.stringify(characterTokenTurnEffects(draft.play)),
      now(),
      token.id
    );
    const updatedToken = db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as TokenRow;
    tokenEventsFor(app, row.campaign_id).updated(
      serializeToken(updatedToken),
      Boolean(token.hidden)
    );
  }
  app.broadcastCampaign(row.campaign_id, "character:updated", {
    characterId: row.id,
    summary,
    name: draft.name,
  });
}

export async function registerCharacterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/characters", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const query = request.query as { campaignId?: string };
    if (query.campaignId) {
      const role = getCampaignRole(query.campaignId, request.user.id);
      if (!role) return reply.code(403).send({ error: "You are not a member of that campaign." });
      const rows = db
        .prepare(
          `SELECT c.*, u.display_name AS owner_name FROM characters c
           JOIN users u ON u.id = c.user_id
           WHERE c.campaign_id = ? ORDER BY c.name COLLATE NOCASE`
        )
        .all(query.campaignId) as (import("../db").CharacterRow & { owner_name: string })[];
      return reply.send({
        characters: rows.map((row) =>
          serializeCharacter(row, row.owner_name, {
            canEdit: canEditCharacter(row, request.user!.id),
            canView: true,
            canAdvance: canAdvanceCharacter(row, request.user!.id),
          })
        ),
      });
    }
    const rows = db
      .prepare(
        `SELECT c.*, u.display_name AS owner_name FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE c.user_id = ? ORDER BY c.updated_at DESC`
      )
      .all(request.user.id) as (import("../db").CharacterRow & { owner_name: string })[];
    return reply.send({
      characters: rows.map((row) =>
        serializeCharacter(row, row.owner_name, {
          canEdit: row.user_id === request.user!.id,
          canView: true,
          canAdvance: canAdvanceCharacter(row, request.user!.id),
        })
      ),
    });
  });

  app.post("/api/characters", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
    if (campaignId && !getMembership(campaignId, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of that campaign." });
    }
    const name = safeString(body.name, "New Hero", 120);
    const draft = emptyCharacterDraft(name);
    if (campaignId) {
      const campaign = getCampaign(campaignId);
      if (campaign) {
        const ruleset = normalizeCampaignRuleset(campaign.ruleset);
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
      }
    }
    const id = newId("char");
    const ts = now();
    db.prepare(
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)"
    ).run(id, request.user.id, campaignId, name, JSON.stringify(draft), ts, ts);
    const row = getCharacter(id);
    if (!row) return reply.code(500).send({ error: "Could not create character." });
    const created = serializeCharacter(row, request.user.displayName, {
      canEdit: true,
      canView: true,
      canAdvance: canAdvanceCharacter(row, request.user.id),
    });
    if (campaignId) {
      app.broadcastCampaign(campaignId, "character:created", { character: created });
    }
    return reply.code(201).send({ character: created });
  });

  app.post("/api/characters/import/pathbuilder", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    let parsed: unknown = body.json;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return reply.code(400).send({ error: "That file is not valid JSON." });
      }
    }
    if (!parsed || typeof parsed !== "object") {
      return reply.code(400).send({ error: "Choose a Pathbuilder JSON export." });
    }
    const payload = parsed as Record<string, unknown>;
    const build =
      payload.build && typeof payload.build === "object"
        ? (payload.build as Record<string, unknown>)
        : null;
    if (!build) {
      return reply
        .code(400)
        .send({ error: "That JSON does not look like a Pathbuilder character export." });
    }

    const requestedCampaignId = typeof body.campaignId === "string" ? body.campaignId : null;
    const rawCode = safeString(body.campaignCode, "", 200).trim().toUpperCase();
    const campaignCode = rawCode.includes("/JOIN/")
      ? rawCode.split("/JOIN/").pop()!.split(/[/?#]/)[0]
      : rawCode;

    let campaign: CampaignRow | null = null;
    let attachCampaignId: string | null = null;
    if (requestedCampaignId) {
      campaign = getCampaign(requestedCampaignId);
      if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
      if (!getMembership(campaign.id, request.user.id)) {
        return reply.code(403).send({ error: "You are not a member of that campaign." });
      }
      attachCampaignId = campaign.id;
    } else if (campaignCode) {
      campaign =
        (db.prepare("SELECT * FROM campaigns WHERE UPPER(invite_code) = ?").get(campaignCode) as
          CampaignRow | undefined) ?? null;
      if (!campaign) {
        return reply.code(404).send({ error: "No campaign has that invite code." });
      }
      // Existing members skip the queue; new players import into a pending request.
      if (getMembership(campaign.id, request.user.id)) attachCampaignId = campaign.id;
    }

    let contentMode: "core" | "expanded" = "expanded";
    let includeLegacy = false;
    if (campaign) {
      const ruleset = normalizeCampaignRuleset(campaign.ruleset);
      contentMode = rulesetContentMode(ruleset);
      includeLegacy = rulesetIncludesLegacy(ruleset);
    }
    let result;
    try {
      result = importPathbuilder(build, { contentMode, includeLegacy });
    } catch {
      return reply.code(400).send({ error: "Runehall could not read that Pathbuilder export." });
    }
    const draft = normalizeCharacterDraft(result.draft, result.draft.name);
    const summary = summarize(draft);
    const report = {
      matched: result.report.matched,
      unmatched: result.report.unmatched.slice(0, 200),
      warnings: result.report.warnings.slice(0, 100),
    };
    const id = newId("char");
    const ts = now();
    db.prepare(
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      request.user.id,
      attachCampaignId,
      draft.name,
      JSON.stringify(draft),
      JSON.stringify(summary),
      ts,
      ts
    );
    const row = getCharacter(id);
    if (!row) return reply.code(500).send({ error: "Could not create character." });
    const created = serializeCharacter(row, request.user.displayName, {
      canEdit: true,
      canView: true,
      canAdvance: canAdvanceCharacter(row, request.user.id),
    });

    let joinRequest = null;
    if (campaign && !attachCampaignId) {
      const existing = pendingJoinRequest(campaign.id, request.user.id);
      joinRequest = {
        id: existing?.id ?? newId("join"),
        characterId: id,
        characterName: draft.name,
        createdAt: ts,
        report,
      };
      if (existing) {
        db.prepare(
          "UPDATE campaign_join_requests SET character_id = ?, report = ?, created_at = ? WHERE id = ?"
        ).run(id, JSON.stringify(report), ts, existing.id);
      } else {
        db.prepare(
          `INSERT INTO campaign_join_requests
             (id, campaign_id, user_id, character_id, status, source, report, created_at)
           VALUES (?, ?, ?, ?, 'pending', 'pathbuilder', ?, ?)`
        ).run(joinRequest.id, campaign.id, request.user.id, id, JSON.stringify(report), ts);
      }
      app.broadcastCampaign(
        campaign.id,
        "join-request:created",
        {
          requestId: joinRequest.id,
          characterName: draft.name,
          playerName: request.user.displayName,
        },
        "gm"
      );
    } else if (campaign) {
      app.broadcastCampaign(campaign.id, "character:created", { character: created });
    }
    return reply.code(201).send({ character: created, report, joinRequest });
  });

  app.get("/api/characters/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canViewCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't view that character." });
    }
    const owner = getUser(row.user_id);
    return reply.send({
      character: serializeCharacter(row, owner?.display_name ?? "", {
        canEdit: canEditCharacter(row, request.user.id),
        canView: true,
        canAdvance: canAdvanceCharacter(row, request.user.id),
      }),
    });
  });

  app.put("/api/characters/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't edit that character." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const expectedRevision =
      typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
        ? Math.round(body.expectedRevision)
        : null;
    const force = body.force === true;
    if (!force && expectedRevision !== null && Number(row.revision) !== expectedRevision) {
      const owner = getUser(row.user_id);
      return reply.code(409).send({
        error: "This character changed somewhere else. Reload before saving.",
        character: serializeCharacter(row, owner?.display_name ?? "", {
          canEdit: true,
          canView: true,
          canAdvance: canAdvanceCharacter(row, request.user.id),
        }),
      });
    }
    const existingDraft = parseDraft(parseJson(row.data, {}), row.name);
    const draft = parseDraft(body.data, row.name);
    if (draft.play.downtimeDays < existingDraft.play.downtimeDays) {
      return reply.code(400).send({
        error: "Spend downtime days from the sheet's Downtime action so upkeep is paid.",
      });
    }
    if (draft.level !== existingDraft.level && !canAdvanceCharacter(row, request.user.id)) {
      return reply
        .code(403)
        .send({ error: "Only the GM can change a campaign character's level." });
    }
    if (row.campaign_id) {
      const campaign = getCampaign(row.campaign_id);
      if (campaign) {
        const ruleset = normalizeCampaignRuleset(campaign.ruleset);
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
      }
    }
    const summary = characterSummary(draft, contextForCharacter(row, draft));
    const updatedAt = now();
    const update =
      !force && expectedRevision !== null
        ? db
            .prepare(
              "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?"
            )
            .run(
              draft.name,
              JSON.stringify(draft),
              JSON.stringify(summary),
              updatedAt,
              id,
              expectedRevision
            )
        : db
            .prepare(
              "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
            )
            .run(draft.name, JSON.stringify(draft), JSON.stringify(summary), updatedAt, id);
    if (Number(update.changes ?? 0) === 0 && !force && expectedRevision !== null) {
      const current = getCharacter(id) ?? row;
      const owner = getUser(current.user_id);
      return reply.code(409).send({
        error: "This character changed somewhere else. Reload before saving.",
        character: serializeCharacter(current, owner?.display_name ?? "", {
          canEdit: true,
          canView: true,
          canAdvance: canAdvanceCharacter(current, request.user.id),
        }),
      });
    }
    const updated = getCharacter(id);
    const owner = getUser(updated!.user_id);
    syncCharacterDraft(app, row, draft, summary);
    if (row.campaign_id) touchCampaign(row.campaign_id);
    return reply.send({
      character: serializeCharacter(updated!, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
        canAdvance: canAdvanceCharacter(updated!, request.user.id),
      }),
    });
  });

  app.post("/api/characters/:id/heroic-recovery", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const character = getCharacter(id);
    if (!character) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(character, request.user.id)) {
      return reply.code(403).send({ error: "You can't use Heroic Recovery for that character." });
    }
    let draft: CharacterDraft;
    try {
      draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const result = applyHeroicRecovery(draft);
    if (!result.applied) {
      const message =
        result.reason === "dead"
          ? "That character is dead."
          : result.reason === "not-dying"
            ? "That character is not dying."
            : "That character has no Hero Points to spend.";
      return reply.code(400).send({ error: message });
    }
    const summary = characterSummary(result.draft, contextForDraft(result.draft));
    db.prepare(
      "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(JSON.stringify(result.draft), JSON.stringify(summary), now(), character.id);
    syncCharacterDraft(app, character, result.draft, summary);
    if (character.campaign_id) touchCampaign(character.campaign_id);
    logAudit({
      action: "character.heroic_recovery",
      actor: request.user,
      targetType: "character",
      targetId: character.id,
      detail: `${result.draft.name}: spent ${result.spent} Hero Point${
        result.spent === 1 ? "" : "s"
      }`,
      request,
    });
    const updated = getCharacter(character.id)!;
    const owner = getUser(updated.user_id);
    return reply.send({
      character: serializeCharacter(updated, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
        canAdvance: canAdvanceCharacter(updated, request.user.id),
      }),
      spent: result.spent,
      notes: result.notes,
    });
  });

  app.post("/api/characters/:id/downtime/spend", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const character = getCharacter(id);
    if (!character) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(character, request.user.id)) {
      return reply.code(403).send({ error: "You can't spend downtime for that character." });
    }
    let draft: CharacterDraft;
    try {
      draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const rawActivity =
      body.activity && typeof body.activity === "object" && !Array.isArray(body.activity)
        ? (body.activity as Record<string, unknown>)
        : null;
    if (rawActivity) {
      const input: DowntimeActivityInput = {
        activityId: safeString(rawActivity.activityId, "", 80) || undefined,
        kind: safeString(rawActivity.kind, "", 40) || undefined,
        skill: safeString(rawActivity.skill, "", 120) || undefined,
        taskLevel:
          rawActivity.taskLevel === undefined
            ? undefined
            : safeInt(rawActivity.taskLevel, 0, 0, 20),
        dc: rawActivity.dc === undefined ? undefined : safeInt(rawActivity.dc, 15, 1, 100),
        label: safeString(rawActivity.label, "", 120) || undefined,
        daysRequired:
          rawActivity.daysRequired === undefined
            ? undefined
            : safeInt(rawActivity.daysRequired, 4, 1, 3650),
        notes:
          rawActivity.notes === undefined ? undefined : sanitizeUserText(rawActivity.notes, 4000),
      };
      const derived = computeCharacter(draft, contextForDraft(draft));
      const campaign = character.campaign_id ? getCampaign(character.campaign_id) : null;
      const result = performDowntimeDay({
        draft,
        skills: derived.skills,
        lore: derived.lore,
        input,
        settlementLevel: campaign?.settlement_level ?? 1,
        now: now(),
        id: newId("downtime"),
      });
      if ("error" in result) {
        return reply.code(result.code).send({ error: result.error });
      }
      const rate = lifestyleRate(draft.play.lifestyle);
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
      syncCharacterDraft(app, character, draft, summary);
      if (character.campaign_id) {
        touchCampaign(character.campaign_id);
        advanceCampaignDate(app, character.campaign_id, 1);
      }
      const activity = result.activity;
      logAudit({
        action: "character.downtime_activity",
        actor: request.user,
        targetType: "character",
        targetId: character.id,
        detail: `${draft.name}: ${activity?.kind ?? "downtime"} day${
          result.earnedCp ? `, earned ${result.earnedCp} cp` : ""
        }${result.paidCp ? `, paid ${result.paidCp} cp upkeep` : ""}`,
        request,
      });
      const updated = getCharacter(character.id)!;
      const owner = getUser(updated.user_id);
      return reply.send({
        character: serializeCharacter(updated, owner?.display_name ?? "", {
          canEdit: true,
          canView: true,
          canAdvance: canAdvanceCharacter(updated, request.user.id),
        }),
        days: 1,
        paidCp: result.paidCp,
        lifestyle: rate.id,
        label: rate.label,
        activity,
        roll: result.roll,
        degree: result.degree,
        earnedCp: result.earnedCp,
        upkeepWaived: result.upkeepWaived,
        completed: result.completed,
      });
    }
    const days = safeInt(body.days, 1, 1, 3650);
    if (draft.play.downtimeDays < days) {
      return reply.code(400).send({
        error: `That character only has ${draft.play.downtimeDays} downtime day${
          draft.play.downtimeDays === 1 ? "" : "s"
        } left.`,
      });
    }
    const rate = lifestyleRate(draft.play.lifestyle);
    const paidCp = upkeepCostCp(rate.id, days);
    const currency = spendCurrency(draft.currency, paidCp);
    if (!currency) {
      return reply.code(400).send({
        error: `You need ${paidCp} cp for ${days} day${days === 1 ? "" : "s"} of ${rate.label.toLowerCase()} living, but your purse holds ${currencyToCp(draft.currency)} cp.`,
      });
    }
    draft.currency = currency;
    draft.play.downtimeDays -= days;
    const summary = characterSummary(draft, contextForDraft(draft));
    db.prepare(
      "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
    syncCharacterDraft(app, character, draft, summary);
    if (character.campaign_id) {
      touchCampaign(character.campaign_id);
      advanceCampaignDate(app, character.campaign_id, days);
    }
    logAudit({
      action: "character.downtime_spend",
      actor: request.user,
      targetType: "character",
      targetId: character.id,
      detail: `${draft.name}: spent ${days} downtime day${
        days === 1 ? "" : "s"
      } and ${paidCp} cp on ${rate.label.toLowerCase()} living`,
      request,
    });
    const updated = getCharacter(character.id)!;
    const owner = getUser(updated.user_id);
    return reply.send({
      character: serializeCharacter(updated, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
        canAdvance: canAdvanceCharacter(updated, request.user.id),
      }),
      days,
      paidCp,
      lifestyle: rate.id,
      label: rate.label,
    });
  });

  app.post("/api/characters/:id/recovery", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const healer = getCharacter(id);
    if (!healer) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(healer, request.user.id)) {
      return reply.code(403).send({ error: "You can't use recovery for that character." });
    }
    let healerDraft: CharacterDraft;
    try {
      healerDraft = normalizeCharacterDraft(JSON.parse(healer.data), healer.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const healerDerived = computeCharacter(healerDraft, contextForDraft(healerDraft));
    const medicine = healerDerived.skills.find((skill) => skill.id === "medicine");
    if (!medicine || medicine.rank < 1) {
      return reply.code(400).send({
        error: "Train Medicine before using Treat Wounds, Battle Medicine, or Stabilize.",
      });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const activity = safeString(body.activity, "treat-wounds", 40) as RecoveryActivity;
    if (!RECOVERY_ACTIVITIES.includes(activity)) {
      return reply.code(400).send({ error: "Choose a recovery activity." });
    }
    if (activity === "battle-medicine" && !hasRecoveryFeat(healerDerived, "Battle Medicine")) {
      return reply.code(400).send({ error: "Battle Medicine requires the Battle Medicine feat." });
    }
    const targetId = safeString(body.targetId, healer.id, 120) || healer.id;
    const target = targetId === healer.id ? healer : getCharacter(targetId);
    if (!target) return reply.code(404).send({ error: "That recovery target was not found." });
    if (target.id !== healer.id) {
      if (!healer.campaign_id || target.campaign_id !== healer.campaign_id) {
        return reply
          .code(400)
          .send({ error: "You can only treat another character in the same campaign." });
      }
      if (!getMembership(target.campaign_id, request.user.id)) {
        return reply.code(403).send({ error: "You're not a member of that campaign." });
      }
    }
    let targetDraft: CharacterDraft;
    try {
      targetDraft = normalizeCharacterDraft(JSON.parse(target.data), target.name);
    } catch {
      return reply.code(400).send({ error: "That recovery target's draft could not be read." });
    }
    if (targetDraft.play.conditions.some((entry) => entry.name.toLowerCase() === "dead")) {
      return reply.code(400).send({ error: "That character is dead and cannot be treated." });
    }

    const allowedDcs = recoveryDcsForRank(medicine.rank, activity);
    const requestedDc =
      body.dc === undefined || body.dc === null
        ? allowedDcs[0]
        : safeInt(body.dc, allowedDcs[0], 1, 100);
    if (!allowedDcs.includes(requestedDc)) {
      return reply.code(400).send({
        error: `${recoveryActivityLabel(activity)} at DC ${requestedDc} requires a higher Medicine rank. Choose ${allowedDcs.join(", ")}.`,
      });
    }
    const dying = targetDraft.play.conditions.reduce((value, entry) => {
      return entry.name.toLowerCase().replace(/\s+\d+$/, "") === "dying"
        ? Math.max(value, conditionNumericValue(entry) ?? 0)
        : value;
    }, 0);
    if (activity === "stabilize" && dying <= 0) {
      return reply.code(400).send({ error: "Stabilize requires a dying creature." });
    }
    if (activity === "treat-wounds" && targetDraft.play.treatWoundsImmune) {
      return reply.code(400).send({
        error: `${target.name} is already immune to Treat Wounds. Wait an hour, take a long rest, or clear the immunity.`,
      });
    }
    if (
      activity === "battle-medicine" &&
      targetDraft.play.battleMedicineImmuneBy.includes(healer.id)
    ) {
      return reply.code(400).send({
        error: `${target.name} is already immune to ${healer.name}'s Battle Medicine.`,
      });
    }

    const label = `${recoveryActivityLabel(activity)} on ${target.name}`;
    const check = rollFormula(`1d20${signed(medicine.mod)}`, {
      dc: requestedDc,
      label: `${label} (Medicine)`,
    });
    const degree = check.degree ?? "failure";
    const healingFormula =
      activity === "stabilize" || degree === "failure" || degree === "critical-failure"
        ? null
        : recoveryHealingFormula(requestedDc);
    const healingRoll = healingFormula
      ? rollFormula(healingFormula, { label: `${label} healing` })
      : null;
    const damageRoll =
      activity === "treat-wounds" && degree === "critical-failure"
        ? rollFormula("1d8", { label: `${label} critical failure damage` })
        : null;
    const robustHealth = hasRecoveryFeat(healerDerived, "Robust Health");
    const continualRecovery = hasRecoveryFeat(healerDerived, "Continual Recovery");
    const targetDerived = computeCharacter(targetDraft, contextForDraft(targetDraft));
    const applied = applyRecoveryToDraft({
      draft: targetDraft,
      maxHp: targetDerived.maxHp,
      level: healerDraft.level,
      activity,
      degree,
      healing: healingRoll?.total ?? 0,
      damage: damageRoll?.total ?? 0,
      healerId: healer.id,
      robustHealth,
      continualRecovery,
    });
    targetDraft = applied.draft;
    const summary = summarize(targetDraft);
    db.prepare(
      "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(JSON.stringify(targetDraft), JSON.stringify(summary), now(), target.id);
    syncCharacterDraft(app, target, targetDraft, summary);
    if (target.campaign_id) {
      touchCampaign(target.campaign_id);
      const campaign = getCampaign(target.campaign_id);
      if (campaign) broadcastCampaignSummary(app, campaign);
    }
    logAudit({
      action: "character.recovery",
      actor: request.user,
      targetType: "character",
      targetId: target.id,
      detail: `${healer.name} used ${recoveryActivityLabel(activity)} on ${target.name}: ${degree}${applied.healed ? `, healed ${applied.healed} HP` : ""}${applied.damage ? `, dealt ${applied.damage} damage` : ""}`,
      request,
    });
    const updated = getCharacter(target.id)!;
    const owner = getUser(updated.user_id);
    return reply.send({
      character: serializeCharacter(updated, owner?.display_name ?? "", {
        canEdit: canEditCharacter(updated, request.user.id),
        canView: true,
        canAdvance: canAdvanceCharacter(updated, request.user.id),
      }),
      targetId: target.id,
      targetName: target.name,
      activity,
      dc: requestedDc,
      degree,
      roll: check,
      healingRoll,
      damageRoll,
      healed: applied.healed,
      damage: applied.damage,
      notes: applied.notes,
    });
  });

  app.post("/api/characters/:id/recovery/clear", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const character = getCharacter(id);
    if (!character) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(character, request.user.id)) {
      return reply
        .code(403)
        .send({ error: "You can't clear recovery immunities for that character." });
    }
    let draft: CharacterDraft;
    try {
      draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const cleared = clearRecoveryImmunities(draft);
    const summary = summarize(cleared);
    db.prepare(
      "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
    ).run(JSON.stringify(cleared), JSON.stringify(summary), now(), character.id);
    syncCharacterDraft(app, character, cleared, summary);
    if (character.campaign_id) {
      touchCampaign(character.campaign_id);
      const campaign = getCampaign(character.campaign_id);
      if (campaign) broadcastCampaignSummary(app, campaign);
    }
    const updated = getCharacter(character.id)!;
    const owner = getUser(updated.user_id);
    return reply.send({
      character: serializeCharacter(updated, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
        canAdvance: canAdvanceCharacter(updated, request.user.id),
      }),
    });
  });

  app.post("/api/characters/:id/transfer", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const source = getCharacter(id);
    if (!source) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(source, request.user.id)) {
      return reply.code(403).send({ error: "You can't give items from that character." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetId = safeString(body.toCharacterId, "", 120);
    if (!targetId) return reply.code(400).send({ error: "Choose who receives the transfer." });
    if (targetId === id) return reply.code(400).send({ error: "Choose another character." });
    const target = getCharacter(targetId);
    if (!target) return reply.code(404).send({ error: "That character was not found." });
    if (source.campaign_id && target.campaign_id !== source.campaign_id) {
      return reply
        .code(400)
        .send({ error: "Items can only be transferred between characters in the same campaign." });
    }
    if (!source.campaign_id) {
      return reply
        .code(400)
        .send({ error: "Assign both characters to a campaign before transferring items." });
    }
    if (!canViewCharacter(target, request.user.id)) {
      return reply.code(403).send({ error: "You can't give items to that character." });
    }

    const expectedRevision =
      typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
        ? Math.round(body.expectedRevision)
        : null;
    if (expectedRevision !== null && Number(source.revision) !== expectedRevision) {
      const owner = getUser(source.user_id);
      return reply.code(409).send({
        error: "This character changed somewhere else. Reload before transferring.",
        character: serializeCharacter(source, owner?.display_name ?? "", {
          canEdit: true,
          canView: true,
        }),
      });
    }

    // The stored row is the source of truth. A client-supplied draft could
    // fabricate items or coins and mint them into another character.
    let sourceDraft = parseDraft(parseJson(source.data, {}), source.name);
    let targetDraft = parseDraft(parseJson(target.data, {}), target.name);
    let transferred = false;

    if (typeof body.itemId === "string" && body.itemId.trim()) {
      const itemId = body.itemId.trim().slice(0, 200);
      const owned = sourceDraft.equipment.find((entry) => entry.itemId === itemId);
      if (!owned)
        return reply.code(400).send({ error: "That item is not in this character's pack." });
      const quantity = Math.max(
        1,
        Math.min(owned.quantity, Math.floor(Number(body.quantity) || 1))
      );
      const result = removeItemQuantity(sourceDraft, itemId, quantity);
      if (!result.moved) return reply.code(400).send({ error: "That item is not in this pack." });
      sourceDraft = result.draft;
      targetDraft = addItemToDraft(targetDraft, result.moved);
      transferred = true;
    }

    const rawCurrency = body.currency;
    let amountCp = 0;
    if (rawCurrency && typeof rawCurrency === "object") {
      const currency = rawCurrency as Record<string, unknown>;
      amountCp = currencyToCp({
        gp: Number(currency.gp) || 0,
        sp: Number(currency.sp) || 0,
        cp: Number(currency.cp) || 0,
      });
    }
    if (amountCp > 0) {
      const remaining = spendCurrency(sourceDraft.currency, amountCp);
      if (!remaining)
        return reply.code(400).send({ error: "That character doesn't have that many coins." });
      sourceDraft = { ...sourceDraft, currency: remaining };
      targetDraft = {
        ...targetDraft,
        currency: addCurrency(targetDraft.currency, amountCp),
      };
      transferred = true;
    }
    if (!transferred) {
      return reply.code(400).send({ error: "Choose an item or an amount of coins to transfer." });
    }

    // A transfer is play history, not character creation.
    sourceDraft.wealthBudgetCp = null;
    targetDraft.wealthBudgetCp = null;
    const sourceSummary = summarize(sourceDraft);
    const targetSummary = summarize(targetDraft);
    const updatedAt = now();
    db.exec("BEGIN");
    try {
      db.prepare(
        "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(
        sourceDraft.name,
        JSON.stringify(sourceDraft),
        JSON.stringify(sourceSummary),
        updatedAt,
        source.id
      );
      db.prepare(
        "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(
        targetDraft.name,
        JSON.stringify(targetDraft),
        JSON.stringify(targetSummary),
        updatedAt,
        target.id
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    syncCharacterDraft(app, source, sourceDraft, sourceSummary);
    syncCharacterDraft(app, target, targetDraft, targetSummary);
    touchCampaign(source.campaign_id);

    const updatedSource = getCharacter(source.id)!;
    const updatedTarget = getCharacter(target.id)!;
    const sourceOwner = getUser(updatedSource.user_id);
    const targetOwner = getUser(updatedTarget.user_id);
    return reply.send({
      from: serializeCharacter(updatedSource, sourceOwner?.display_name ?? "", {
        canEdit: true,
        canView: true,
        canAdvance: canAdvanceCharacter(updatedSource, request.user.id),
      }),
      to: serializeCharacter(updatedTarget, targetOwner?.display_name ?? "", {
        canEdit: canEditCharacter(updatedTarget, request.user.id),
        canView: true,
        canAdvance: canAdvanceCharacter(updatedTarget, request.user.id),
      }),
    });
  });

  app.post("/api/characters/:id/context", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canViewCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't view that character." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const draft = body.draft
      ? parseDraft(body.draft, row.name)
      : parseDraft(parseJson(row.data, {}), row.name);
    const context = contextForCharacter(row, draft);
    return reply.send({ context });
  });

  app.post("/api/characters/:id/duplicate", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (row.user_id !== request.user.id && !canEditCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't duplicate that character." });
    }
    const draft = normalizeCharacterDraft(parseJson(row.data, {}), row.name);
    draft.name = `${draft.name} (copy)`;
    if (draft.portraitUrl) draft.portraitUrl = null;
    if (row.campaign_id) {
      const campaign = getCampaign(row.campaign_id);
      if (campaign) {
        const ruleset = normalizeCampaignRuleset(campaign.ruleset);
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
      }
    }
    const newCharacterId = newId("char");
    const ts = now();
    const summary = summarize(draft);
    db.prepare(
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      newCharacterId,
      request.user.id,
      row.campaign_id,
      draft.name,
      JSON.stringify(draft),
      JSON.stringify(summary),
      ts,
      ts
    );
    const created = getCharacter(newCharacterId)!;
    const serialized = serializeCharacter(created, request.user.displayName, {
      canEdit: true,
      canView: true,
      canAdvance: canAdvanceCharacter(created, request.user.id),
    });
    if (row.campaign_id) {
      touchCampaign(row.campaign_id);
      app.broadcastCampaign(row.campaign_id, "character:created", { character: serialized });
    }
    return reply.code(201).send({ character: serialized });
  });

  app.delete("/api/characters/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't delete that character." });
    }
    const linkedTokenIds = row.campaign_id
      ? (
          db.prepare("SELECT id FROM tokens WHERE character_id = ?").all(id) as { id: string }[]
        ).map((token) => token.id)
      : [];
    db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    if (row.campaign_id) {
      touchCampaign(row.campaign_id);
      app.broadcastCampaign(row.campaign_id, "character:removed", { characterId: id });
      for (const tokenId of linkedTokenIds) {
        const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as
          TokenRow | undefined;
        if (token) {
          app.broadcastCampaign(row.campaign_id, "token:updated", serializeToken(token));
        }
      }
    }
    return reply.send({ ok: true });
  });

  app.post("/api/characters/:id/compute", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canViewCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't view that character." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const draft = body.draft
      ? parseDraft(body.draft, row.name)
      : parseDraft(parseJson(row.data, {}), row.name);
    const context = contextForCharacter(row, draft);
    return reply.send({ derived: computeCharacter(draft, context) });
  });
}
