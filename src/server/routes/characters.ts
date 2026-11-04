import type { FastifyInstance } from "fastify";
import { characterSummary, computeCharacter, emptyCharacterDraft, normalizeCharacterDraft } from "../../shared/rules";
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
import { db, type TokenRow } from "../db";
import { serializeCharacter, serializeToken, touchCampaign } from "../serialize";
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
           WHERE c.campaign_id = ? ORDER BY c.name COLLATE NOCASE`,
        )
        .all(query.campaignId) as (import("../db").CharacterRow & { owner_name: string })[];
      return reply.send({
        characters: rows.map((row) =>
          serializeCharacter(row, row.owner_name, {
            canEdit: canEditCharacter(row, request.user!.id),
            canView: true,
          }),
        ),
      });
    }
    const rows = db
      .prepare(
        `SELECT c.*, u.display_name AS owner_name FROM characters c
         JOIN users u ON u.id = c.user_id
         WHERE c.user_id = ? ORDER BY c.updated_at DESC`,
      )
      .all(request.user.id) as (import("../db").CharacterRow & { owner_name: string })[];
    return reply.send({
      characters: rows.map((row) =>
        serializeCharacter(row, row.owner_name, {
          canEdit: row.user_id === request.user!.id,
          canView: true,
        }),
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
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
    ).run(id, request.user.id, campaignId, name, JSON.stringify(draft), ts, ts);
    const row = getCharacter(id);
    if (!row) return reply.code(500).send({ error: "Could not create character." });
    const created = serializeCharacter(row, request.user.displayName, { canEdit: true, canView: true });
    if (campaignId) {
      app.broadcastCampaign(campaignId, "character:created", { character: created });
    }
    return reply.code(201).send({ character: created });
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
              "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
            )
            .run(draft.name, JSON.stringify(draft), JSON.stringify(summary), updatedAt, id, expectedRevision)
        : db
            .prepare(
              "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?",
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
    if (row.campaign_id) {
      // Keep any linked table tokens in step with the sheet.
      const linkedTokens = db.prepare("SELECT * FROM tokens WHERE character_id = ?").all(id) as TokenRow[];
      for (const token of linkedTokens) {
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?",
        ).run(
          draft.name,
          summary.hp,
          draft.play.hp === null ? summary.hp : Math.max(0, Math.min(summary.hp, draft.play.hp)),
          summary.ac,
          now(),
          token.id,
        );
        const updatedToken = db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as TokenRow;
        app.broadcastCampaign(row.campaign_id, "token:updated", serializeToken(updatedToken));
      }
      app.broadcastCampaign(row.campaign_id, "character:updated", {
        characterId: id,
        summary,
        name: draft.name,
      });
      touchCampaign(row.campaign_id);
    }
    return reply.send({
      character: serializeCharacter(updated!, owner?.display_name ?? "", {
        canEdit: true,
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
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newCharacterId,
      request.user.id,
      row.campaign_id,
      draft.name,
      JSON.stringify(draft),
      JSON.stringify(summary),
      ts,
      ts,
    );
    const created = getCharacter(newCharacterId)!;
    return reply.code(201).send({
      character: serializeCharacter(created, request.user.displayName, { canEdit: true, canView: true }),
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
