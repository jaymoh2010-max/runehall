import type { FastifyInstance, FastifyReply } from "fastify";
import {
  canAdvanceCharacter,
  canEditCharacter,
  getCampaign,
  getCharacter,
  getUser,
} from "../access";
import { contextForDraft, equipment } from "../compendium";
import { db, type CharacterRow } from "../db";
import { serializeCharacter, touchCampaign } from "../serialize";
import { syncCharacterDraft } from "./characters";
import {
  addCurrency,
  addItemToDraft,
  removeItemQuantity,
  spendCurrency,
} from "../../shared/inventory";
import { characterSummary, normalizeCharacterDraft } from "../../shared/rules";
import {
  normalizeSettlementLevel,
  shopAvailabilityError,
  shopBuyCostCp,
  shopQuantity,
  shopSellValueCp,
} from "../../shared/shop";
import type { CharacterDraft } from "../../shared/types";
import { logAudit } from "../audit";
import { now, parseJson, safeString } from "../util";

function expectedRevisionFrom(body: Record<string, unknown>): number | null {
  return typeof body.expectedRevision === "number" && Number.isFinite(body.expectedRevision)
    ? Math.round(body.expectedRevision)
    : null;
}

function serializeFor(character: CharacterRow, userId: string) {
  const owner = getUser(character.user_id);
  return serializeCharacter(character, owner?.display_name ?? "", {
    canEdit: canEditCharacter(character, userId),
    canView: true,
    canAdvance: canAdvanceCharacter(character, userId),
  });
}

function conflict(
  request: { user: { id: string } | null },
  reply: FastifyReply,
  character: CharacterRow,
  message: string
) {
  return reply.code(409).send({
    error: message,
    character: serializeFor(character, request.user!.id),
  });
}

function findItem(itemId: string) {
  return equipment.find((item) => item.id === itemId) ?? null;
}

function saveShopDraft(
  character: CharacterRow,
  draft: CharacterDraft
): { summary: ReturnType<typeof characterSummary>; moved: boolean } {
  const summary = characterSummary(draft, contextForDraft(draft));
  const result = db
    .prepare(
      "UPDATE characters SET name = ?, data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?"
    )
    .run(
      draft.name,
      JSON.stringify(draft),
      JSON.stringify(summary),
      now(),
      character.id,
      Number(character.revision ?? 1)
    );
  return { summary, moved: Number(result.changes) > 0 };
}

export async function registerShopRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/campaigns/:id/shop/buy", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const character = getCharacter(safeString(body.characterId, "", 120));
    if (!character || character.campaign_id !== id) {
      return reply.code(404).send({ error: "That character is not part of this campaign." });
    }
    if (!canEditCharacter(character, request.user.id)) {
      return reply.code(403).send({ error: "You can't shop for that character." });
    }
    const expectedRevision = expectedRevisionFrom(body);
    if (expectedRevision !== null && Number(character.revision) !== expectedRevision) {
      return conflict(
        request,
        reply,
        character,
        "This character changed somewhere else. Reload before buying."
      );
    }
    const itemId = safeString(body.itemId, "", 200);
    const item = findItem(itemId);
    if (!item) return reply.code(404).send({ error: "That item is not in the compendium." });
    const settlementLevel = normalizeSettlementLevel(campaign.settlement_level);
    const unavailable = shopAvailabilityError(item, settlementLevel);
    if (unavailable) return reply.code(400).send({ error: unavailable });
    const quantity = shopQuantity(body.quantity);
    const totalCp = shopBuyCostCp(item, quantity);
    if (totalCp < 1) return reply.code(400).send({ error: "That item has no purchase price." });

    let draft: CharacterDraft;
    try {
      draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const remaining = spendCurrency(draft.currency, totalCp);
    if (!remaining) {
      return reply.code(400).send({ error: "That character doesn't have enough coins." });
    }
    draft = addItemToDraft(
      { ...draft, currency: remaining, wealthBudgetCp: null },
      { itemId: item.id, quantity, equipped: false, invested: false, runes: [] }
    );
    const saved = saveShopDraft(character, draft);
    if (!saved.moved) {
      const current = getCharacter(character.id)!;
      return conflict(
        request,
        reply,
        current,
        "This character changed somewhere else. Reload before buying."
      );
    }
    syncCharacterDraft(app, character, draft, saved.summary);
    touchCampaign(id);
    logAudit({
      action: "character.shop_buy",
      actor: request.user,
      targetType: "character",
      targetId: character.id,
      detail: `${quantity}× ${item.name} for ${totalCp} cp`,
      request,
    });
    const updated = getCharacter(character.id)!;
    return reply.send({
      character: serializeFor(updated, request.user.id),
      item: { id: item.id, name: item.name, level: item.level },
      quantity,
      totalCp,
    });
  });

  app.post("/api/campaigns/:id/shop/sell", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const character = getCharacter(safeString(body.characterId, "", 120));
    if (!character || character.campaign_id !== id) {
      return reply.code(404).send({ error: "That character is not part of this campaign." });
    }
    if (!canEditCharacter(character, request.user.id)) {
      return reply.code(403).send({ error: "You can't sell that character's gear." });
    }
    const expectedRevision = expectedRevisionFrom(body);
    if (expectedRevision !== null && Number(character.revision) !== expectedRevision) {
      return conflict(
        request,
        reply,
        character,
        "This character changed somewhere else. Reload before selling."
      );
    }
    const itemId = safeString(body.itemId, "", 200);
    let draft: CharacterDraft;
    try {
      draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const entry = draft.equipment.find((row) => row.itemId === itemId);
    if (!entry) {
      return reply.code(400).send({ error: "That item is not in this character's pack." });
    }
    const item = findItem(itemId);
    if (!item) return reply.code(400).send({ error: "That item has no compendium price." });
    const quantity = Math.min(entry.quantity, shopQuantity(body.quantity));
    if (entry.runes?.length && quantity < entry.quantity) {
      return reply
        .code(400)
        .send({ error: "Sell the whole stack or remove its runes before selling." });
    }
    const runeCp =
      quantity >= entry.quantity
        ? (entry.runes ?? []).reduce(
            (sum, runeId) => sum + (contextForDraft(draft).equipment[runeId]?.price.cpTotal ?? 0),
            0
          )
        : 0;
    const totalCp = shopSellValueCp(item, quantity, runeCp);
    if (totalCp < 1) return reply.code(400).send({ error: "That item has no resale value." });
    const removed = removeItemQuantity(draft, itemId, quantity);
    if (!removed.moved) {
      return reply.code(400).send({ error: "That item is not in this pack." });
    }
    draft = {
      ...removed.draft,
      currency: addCurrency(removed.draft.currency, totalCp),
      wealthBudgetCp: null,
    };
    const saved = saveShopDraft(character, draft);
    if (!saved.moved) {
      const current = getCharacter(character.id)!;
      return conflict(
        request,
        reply,
        current,
        "This character changed somewhere else. Reload before selling."
      );
    }
    syncCharacterDraft(app, character, draft, saved.summary);
    touchCampaign(id);
    logAudit({
      action: "character.shop_sell",
      actor: request.user,
      targetType: "character",
      targetId: character.id,
      detail: `${quantity}× ${item.name} for ${totalCp} cp`,
      request,
    });
    const updated = getCharacter(character.id)!;
    return reply.send({
      character: serializeFor(updated, request.user.id),
      item: { id: item.id, name: item.name, level: item.level },
      quantity,
      totalCp,
    });
  });
}
