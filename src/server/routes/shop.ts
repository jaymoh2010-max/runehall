import type { FastifyInstance, FastifyReply } from "fastify";
import {
  canAdvanceCharacter,
  canEditCharacter,
  getCampaign,
  getCampaignRole,
  getCharacter,
  getUser,
} from "../access";
import { contextForDraft, equipment } from "../compendium";
import {
  db,
  transaction,
  type CampaignRow,
  type CampaignShopStockRow,
  type CharacterRow,
} from "../db";
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
  MAX_SHOP_STOCK_ROWS,
  isShopStockMode,
  normalizeSettlementLevel,
  normalizeShopStockMode,
  shopAvailabilityError,
  shopBuyCostCp,
  shopQuantity,
  shopSellValueCp,
  shopStockCount,
} from "../../shared/shop";
import type { CharacterDraft, ShopState, ShopStockEntry } from "../../shared/types";
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

class StockUnavailableError extends Error {}

function stockEntry(row: CampaignShopStockRow): ShopStockEntry | null {
  const item = findItem(row.item_id);
  if (!item) return null;
  return {
    itemId: item.id,
    name: item.name,
    level: item.level,
    priceCp: item.price.cpTotal,
    bulk: item.bulk,
    rarity: item.rarity,
    type: item.type,
    quantity: shopStockCount(row.quantity),
    updatedAt: row.updated_at,
  };
}

function stockEntries(campaignId: string): ShopStockEntry[] {
  return (
    db
      .prepare("SELECT * FROM campaign_shop_stock WHERE campaign_id = ? ORDER BY item_id ASC")
      .all(campaignId) as CampaignShopStockRow[]
  )
    .map(stockEntry)
    .filter((entry): entry is ShopStockEntry => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function shopStateFor(campaign: CampaignRow): ShopState {
  return {
    mode: normalizeShopStockMode(campaign.shop_mode),
    settlementLevel: normalizeSettlementLevel(campaign.settlement_level),
    stock: stockEntries(campaign.id),
  };
}

function stockQuantity(campaignId: string, itemId: string): number {
  const row = db
    .prepare("SELECT quantity FROM campaign_shop_stock WHERE campaign_id = ? AND item_id = ?")
    .get(campaignId, itemId) as { quantity: number } | undefined;
  return shopStockCount(row?.quantity);
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
  app.get("/api/campaigns/:id/shop", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    return reply.send({ shop: shopStateFor(campaign) });
  });

  app.put("/api/campaigns/:id/shop/stock", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can manage merchant stock." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.mode !== undefined && !isShopStockMode(body.mode)) {
      return reply.code(400).send({ error: "Choose open market or tracked merchant stock." });
    }
    const mode = body.mode === undefined ? normalizeShopStockMode(campaign.shop_mode) : body.mode;
    const items = body.items;
    if (items !== undefined && !Array.isArray(items)) {
      return reply.code(400).send({ error: "Shop stock must be a list of items." });
    }
    const rawItems = Array.isArray(items) ? items : null;
    if (rawItems && rawItems.length > MAX_SHOP_STOCK_ROWS) {
      return reply
        .code(400)
        .send({ error: `A merchant can stock at most ${MAX_SHOP_STOCK_ROWS} item rows.` });
    }
    const stock = new Map<string, number>();
    if (rawItems) {
      for (const raw of rawItems) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const itemId = safeString(entry.itemId, "", 200);
        const item = findItem(itemId);
        if (!item) {
          return reply.code(400).send({ error: "One of those items is not in the compendium." });
        }
        if (item.price.cpTotal <= 0) {
          return reply.code(400).send({ error: `${item.name} has no purchase price.` });
        }
        stock.set(item.id, shopStockCount(entry.quantity));
      }
    }

    const ts = now();
    transaction(() => {
      db.prepare("UPDATE campaigns SET shop_mode = ?, updated_at = ? WHERE id = ?").run(
        mode,
        ts,
        id
      );
      if (rawItems) {
        db.prepare("DELETE FROM campaign_shop_stock WHERE campaign_id = ?").run(id);
        const insert = db.prepare(
          `INSERT INTO campaign_shop_stock
             (campaign_id, item_id, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const [itemId, quantity] of stock) {
          insert.run(id, itemId, quantity, ts, ts);
        }
      }
    });
    touchCampaign(id);
    logAudit({
      action: "campaign.shop_stock",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${mode} merchant stock${
        rawItems ? ` (${stock.size} item row${stock.size === 1 ? "" : "s"})` : ""
      }`,
      request,
    });
    const updated = getCampaign(id)!;
    return reply.send({ shop: shopStateFor(updated) });
  });

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
    const mode = normalizeShopStockMode(campaign.shop_mode);
    const settlementLevel = normalizeSettlementLevel(campaign.settlement_level);
    if (mode === "stocked") {
      if (item.price.cpTotal <= 0) {
        return reply.code(400).send({ error: "That item has no purchase price." });
      }
      const available = stockQuantity(id, item.id);
      if (available < 1) {
        return reply.code(400).send({ error: `${item.name} is out of stock.` });
      }
      const requested = shopQuantity(body.quantity);
      if (available < requested) {
        return reply
          .code(400)
          .send({ error: `The merchant only has ${available}× ${item.name} in stock.` });
      }
    } else {
      const unavailable = shopAvailabilityError(item, settlementLevel);
      if (unavailable) return reply.code(400).send({ error: unavailable });
    }
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
    let saved;
    try {
      saved = transaction(() => {
        const result = saveShopDraft(character, draft);
        if (!result.moved) return { moved: false as const, summary: result.summary };
        if (mode === "stocked") {
          const update = db
            .prepare(
              `UPDATE campaign_shop_stock
               SET quantity = quantity - ?, updated_at = ?
               WHERE campaign_id = ? AND item_id = ? AND quantity >= ?`
            )
            .run(quantity, now(), id, item.id, quantity);
          if (Number(update.changes) === 0) throw new StockUnavailableError();
        }
        return { moved: true as const, summary: result.summary };
      });
    } catch (error) {
      if (error instanceof StockUnavailableError) {
        return reply
          .code(400)
          .send({ error: `The merchant no longer has ${quantity}× ${item.name} in stock.` });
      }
      throw error;
    }
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
      stockQuantity: mode === "stocked" ? stockQuantity(id, item.id) : null,
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
    const mode = normalizeShopStockMode(campaign.shop_mode);
    const saved = transaction(() => {
      const result = saveShopDraft(character, draft);
      if (!result.moved) return { moved: false as const, summary: result.summary };
      if (mode === "stocked") {
        const ts = now();
        db.prepare(
          `INSERT INTO campaign_shop_stock
             (campaign_id, item_id, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(campaign_id, item_id) DO UPDATE SET
             quantity = MIN(9999, campaign_shop_stock.quantity + excluded.quantity),
             updated_at = excluded.updated_at`
        ).run(id, item.id, quantity, ts, ts);
      }
      return { moved: true as const, summary: result.summary };
    });
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
      stockQuantity: mode === "stocked" ? stockQuantity(id, item.id) : null,
    });
  });
}
