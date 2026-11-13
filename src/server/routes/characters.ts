import type { FastifyInstance } from "fastify";
import {
  characterSummary,
  computeCharacter,
  emptyCharacterDraft,
  normalizeCharacterDraft,
} from "../../shared/rules";
import type { CharacterDraft, CharacterSummary } from "../../shared/types";
import {
  canEditCharacter,
  canViewCharacter,
  getCampaign,
  getCampaignRole,
  getCharacter,
  getMembership,
  getUser,
} from "../access";
import {
  normalizeCampaignRuleset,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../../shared/content";
import { contextForDraft } from "../compendium";
import { importPathbuilder } from "../pathbuilder";
import { db, type CharacterRow, type TokenRow } from "../db";
import { serializeCharacter, serializeToken, touchCampaign } from "../serialize";
import {
  addCurrency,
  addItemToDraft,
  currencyToCp,
  removeItemQuantity,
  spendCurrency,
} from "../../shared/inventory";
import { newId, now, parseJson, safeString } from "../util";

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

function syncCharacterDraft(
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
      "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
    ).run(
      draft.name,
      summary.hp,
      draft.play.hp === null ? summary.hp : Math.max(0, Math.min(summary.hp, draft.play.hp)),
      summary.ac,
      now(),
      token.id
    );
    const updatedToken = db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as TokenRow;
    app.broadcastCampaign(row.campaign_id, "token:updated", serializeToken(updatedToken));
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
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
    if (campaignId && !getMembership(campaignId, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of that campaign." });
    }
    let contentMode: "core" | "expanded" = "expanded";
    let includeLegacy = false;
    if (campaignId) {
      const campaign = getCampaign(campaignId);
      if (campaign) {
        const ruleset = normalizeCampaignRuleset(campaign.ruleset);
        contentMode = rulesetContentMode(ruleset);
        includeLegacy = rulesetIncludesLegacy(ruleset);
      }
    }
    let result;
    try {
      result = importPathbuilder(build, { contentMode, includeLegacy });
    } catch {
      return reply.code(400).send({ error: "Runehall could not read that Pathbuilder export." });
    }
    const draft = normalizeCharacterDraft(result.draft, result.draft.name);
    const id = newId("char");
    const ts = now();
    db.prepare(
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)"
    ).run(id, request.user.id, campaignId, draft.name, JSON.stringify(draft), ts, ts);
    const row = getCharacter(id);
    if (!row) return reply.code(500).send({ error: "Could not create character." });
    const created = serializeCharacter(row, request.user.displayName, {
      canEdit: true,
      canView: true,
    });
    if (campaignId) {
      app.broadcastCampaign(campaignId, "character:created", { character: created });
    }
    return reply.code(201).send({ character: created, report: result.report });
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
        }),
      });
    }
    const draft = parseDraft(body.data, row.name);
    if (row.campaign_id) {
      const campaign = getCampaign(row.campaign_id);
      if (campaign) {
        const ruleset = normalizeCampaignRuleset(campaign.ruleset);
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
      }
    }
    const summary = summarize(draft);
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

    let sourceDraft = body.data
      ? parseDraft(body.data, source.name)
      : parseDraft(parseJson(source.data, {}), source.name);
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
      }),
      to: serializeCharacter(updatedTarget, targetOwner?.display_name ?? "", {
        canEdit: canEditCharacter(updatedTarget, request.user.id),
        canView: true,
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
    const context = contextForDraft(draft);
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
    return reply.code(201).send({
      character: serializeCharacter(created, request.user.displayName, {
        canEdit: true,
        canView: true,
      }),
    });
  });

  app.delete("/api/characters/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = getCharacter(id);
    if (!row) return reply.code(404).send({ error: "Character not found." });
    if (!canEditCharacter(row, request.user.id)) {
      return reply.code(403).send({ error: "You can't delete that character." });
    }
    db.prepare("DELETE FROM characters WHERE id = ?").run(id);
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
    const context = contextForDraft(draft);
    return reply.send({ derived: computeCharacter(draft, context) });
  });
}
