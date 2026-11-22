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
  type CampaignMerchantRow,
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
import { newId, now, parseJson, safeString, sanitizeUserText } from "../util";

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

function stockEntryFor(itemId: string, quantity: number, updatedAt: number): ShopStockEntry | null {
  const item = findItem(itemId);
  if (!item) return null;
  return {
    itemId: item.id,
    name: item.name,
    level: item.level,
    priceCp: item.price.cpTotal,
    bulk: item.bulk,
    rarity: item.rarity,
    type: item.type,
    quantity: shopStockCount(quantity),
    updatedAt,
  };
}

function merchantStockMap(merchant: CampaignMerchantRow): Map<string, number> {
  const raw = parseJson<unknown>(merchant.stock, []);
  const map = new Map<string, number>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw.slice(0, MAX_SHOP_STOCK_ROWS)) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const itemId = safeString(value.itemId, "", 200);
    if (!itemId || !findItem(itemId)) continue;
    map.set(itemId, shopStockCount(value.quantity));
  }
  return map;
}

function saveMerchantStock(merchantId: string, stock: Map<string, number>, ts = now()): void {
  db.prepare("UPDATE campaign_merchants SET stock = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify([...stock.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))),
    ts,
    merchantId
  );
}

function stockEntriesForMerchant(merchant: CampaignMerchantRow): ShopStockEntry[] {
  return [...merchantStockMap(merchant).entries()]
    .map(([itemId, quantity]) => stockEntryFor(itemId, quantity, merchant.updated_at))
    .filter((entry): entry is ShopStockEntry => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function merchantsFor(campaignId: string): CampaignMerchantRow[] {
  return db
    .prepare(
      "SELECT * FROM campaign_merchants WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC"
    )
    .all(campaignId) as CampaignMerchantRow[];
}

function nextMerchantSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_merchants WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

function legacyStock(campaignId: string): Map<string, number> {
  const rows = db
    .prepare("SELECT * FROM campaign_shop_stock WHERE campaign_id = ?")
    .all(campaignId) as CampaignShopStockRow[];
  return new Map(rows.map((row) => [row.item_id, shopStockCount(row.quantity)]));
}

/** Create and activate a default merchant once so older campaigns keep their shop. */
function ensureActiveMerchant(campaign: CampaignRow): CampaignMerchantRow {
  const existing = merchantsFor(campaign.id);
  const active = existing.find((merchant) => Boolean(merchant.active));
  if (active) return active;
  if (existing.length) {
    const first = existing[0];
    db.prepare("UPDATE campaign_merchants SET active = 1, updated_at = ? WHERE id = ?").run(
      now(),
      first.id
    );
    return { ...first, active: 1 };
  }
  const ts = now();
  const merchantId = newId("merchant");
  const stock = legacyStock(campaign.id);
  db.prepare(
    `INSERT INTO campaign_merchants
       (id, campaign_id, name, description, mode, stock, active, sort_order,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
  ).run(
    merchantId,
    campaign.id,
    "Settlement merchant",
    "The campaign's default shop.",
    normalizeShopStockMode(campaign.shop_mode),
    JSON.stringify([...stock.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))),
    ts,
    ts
  );
  return db
    .prepare("SELECT * FROM campaign_merchants WHERE id = ?")
    .get(merchantId) as CampaignMerchantRow;
}

function shopStateFor(campaign: CampaignRow): ShopState {
  const active = ensureActiveMerchant(campaign);
  return {
    mode: normalizeShopStockMode(active.mode),
    settlementLevel: normalizeSettlementLevel(campaign.settlement_level),
    stock: stockEntriesForMerchant(active),
    merchantId: active.id,
    merchantName: active.name,
    merchantDescription: active.description,
    merchants: merchantsFor(campaign.id).map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      mode: normalizeShopStockMode(merchant.mode),
      active: Boolean(merchant.active),
      stockCount: merchantStockMap(merchant).size,
    })),
  };
}

function stockQuantity(campaign: CampaignRow, itemId: string): number {
  const merchant = ensureActiveMerchant(campaign);
  return merchantStockMap(merchant).get(itemId) ?? 0;
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

  app.get("/api/campaigns/:id/shop/merchants", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    const role = getCampaignRole(id, request.user.id);
    if (!role) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const active = ensureActiveMerchant(campaign);
    const visibleMerchants =
      role === "gm" ? merchantsFor(id) : merchantsFor(id).filter((merchant) => merchant.active);
    return reply.send({
      merchants: visibleMerchants.map((merchant) => ({
        id: merchant.id,
        name: merchant.name,
        description: merchant.description,
        mode: normalizeShopStockMode(merchant.mode),
        active: Boolean(merchant.active),
        stockCount: merchantStockMap(merchant).size,
      })),
      activeMerchantId: active.id,
    });
  });

  app.post("/api/campaigns/:id/shop/merchants", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can add merchants." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 120);
    if (!name) return reply.code(400).send({ error: "Give the merchant a name." });
    const mode = body.mode === undefined ? normalizeShopStockMode(campaign.shop_mode) : body.mode;
    if (!isShopStockMode(mode)) {
      return reply.code(400).send({ error: "Choose open market or tracked merchant stock." });
    }
    const existing = merchantsFor(id);
    const active = existing.find((merchant) => Boolean(merchant.active));
    const copyFromId = safeString(body.copyFromMerchantId, "", 120);
    const copyFrom = copyFromId
      ? (existing.find((merchant) => merchant.id === copyFromId) ?? null)
      : null;
    const stock = copyFrom ? merchantStockMap(copyFrom) : new Map<string, number>();
    const merchantId = newId("merchant");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_merchants
         (id, campaign_id, name, description, mode, stock, active, sort_order,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      merchantId,
      id,
      name,
      sanitizeUserText(body.description, 2_000),
      mode,
      JSON.stringify([...stock.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))),
      existing.length ? 0 : 1,
      nextMerchantSortOrder(id),
      ts,
      ts
    );
    touchCampaign(id);
    logAudit({
      action: "campaign.merchant_created",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Created merchant ${name}${active && !existing.length ? " (active)" : ""}`,
      request,
    });
    const updated = getCampaign(id)!;
    return reply.code(201).send({ shop: shopStateFor(updated) });
  });

  app.patch("/api/campaigns/:id/shop/merchants/:merchantId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, merchantId } = request.params as { id: string; merchantId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit merchants." });
    }
    const merchant = db
      .prepare("SELECT * FROM campaign_merchants WHERE id = ? AND campaign_id = ?")
      .get(merchantId, id) as CampaignMerchantRow | undefined;
    if (!merchant) return reply.code(404).send({ error: "Merchant not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name =
      body.name === undefined ? merchant.name : safeString(body.name, merchant.name, 120);
    if (!name) return reply.code(400).send({ error: "Give the merchant a name." });
    const mode = body.mode === undefined ? normalizeShopStockMode(merchant.mode) : body.mode;
    if (!isShopStockMode(mode)) {
      return reply.code(400).send({ error: "Choose open market or tracked merchant stock." });
    }
    db.prepare(
      `UPDATE campaign_merchants
       SET name = ?, description = ?, mode = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      body.description === undefined
        ? merchant.description
        : sanitizeUserText(body.description, 2_000),
      mode,
      now(),
      merchantId
    );
    if (Boolean(merchant.active)) {
      db.prepare("UPDATE campaigns SET shop_mode = ?, updated_at = ? WHERE id = ?").run(
        mode,
        now(),
        id
      );
    }
    touchCampaign(id);
    const updated = getCampaign(id)!;
    return reply.send({ shop: shopStateFor(updated) });
  });

  app.post("/api/campaigns/:id/shop/merchants/:merchantId/activate", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, merchantId } = request.params as { id: string; merchantId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can switch merchants." });
    }
    const merchant = db
      .prepare("SELECT * FROM campaign_merchants WHERE id = ? AND campaign_id = ?")
      .get(merchantId, id) as CampaignMerchantRow | undefined;
    if (!merchant) return reply.code(404).send({ error: "Merchant not found." });
    const ts = now();
    transaction(() => {
      db.prepare(
        "UPDATE campaign_merchants SET active = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = ? WHERE campaign_id = ?"
      ).run(merchantId, ts, id);
      db.prepare("UPDATE campaigns SET shop_mode = ?, updated_at = ? WHERE id = ?").run(
        normalizeShopStockMode(merchant.mode),
        ts,
        id
      );
    });
    touchCampaign(id);
    logAudit({
      action: "campaign.merchant_activated",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Activated merchant ${merchant.name}`,
      request,
    });
    const updated = getCampaign(id)!;
    return reply.send({ shop: shopStateFor(updated) });
  });

  app.delete("/api/campaigns/:id/shop/merchants/:merchantId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, merchantId } = request.params as { id: string; merchantId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can delete merchants." });
    }
    const merchants = merchantsFor(id);
    const merchant = merchants.find((entry) => entry.id === merchantId);
    if (!merchant) return reply.code(404).send({ error: "Merchant not found." });
    if (merchants.length <= 1) {
      return reply.code(400).send({ error: "Keep at least one merchant in the campaign." });
    }
    db.prepare("DELETE FROM campaign_merchants WHERE id = ?").run(merchantId);
    if (Boolean(merchant.active)) {
      const replacement = merchants.find((entry) => entry.id !== merchantId)!;
      db.prepare("UPDATE campaign_merchants SET active = 1, updated_at = ? WHERE id = ?").run(
        now(),
        replacement.id
      );
    }
    touchCampaign(id);
    const updated = getCampaign(id)!;
    return reply.send({ shop: shopStateFor(updated) });
  });

  app.post("/api/campaigns/:id/shop/merchants/:merchantId/restock", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, merchantId } = request.params as { id: string; merchantId: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can restock merchants." });
    }
    const merchant = db
      .prepare("SELECT * FROM campaign_merchants WHERE id = ? AND campaign_id = ?")
      .get(merchantId, id) as CampaignMerchantRow | undefined;
    if (!merchant) return reply.code(404).send({ error: "Merchant not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const quantity = shopStockCount(body.quantity ?? 5);
    const onlySoldOut = body.onlySoldOut === true;
    const stock = merchantStockMap(merchant);
    if (!stock.size) {
      return reply.code(400).send({ error: "Add items to this merchant before restocking." });
    }
    for (const [itemId, current] of stock) {
      if (onlySoldOut && current > 0) continue;
      stock.set(itemId, quantity);
    }
    saveMerchantStock(merchantId, stock);
    touchCampaign(id);
    logAudit({
      action: "campaign.merchant_restock",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Restocked ${merchant.name}${onlySoldOut ? " sold-out items" : " to " + quantity}`,
      request,
    });
    const updated = getCampaign(id)!;
    return reply.send({ shop: shopStateFor(updated) });
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
    const merchant = ensureActiveMerchant(campaign);
    const mode = body.mode === undefined ? normalizeShopStockMode(merchant.mode) : body.mode;
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
      db.prepare("UPDATE campaign_merchants SET mode = ?, updated_at = ? WHERE id = ?").run(
        mode,
        ts,
        merchant.id
      );
      if (rawItems) saveMerchantStock(merchant.id, stock, ts);
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
    const merchant = ensureActiveMerchant(campaign);
    const mode = normalizeShopStockMode(merchant.mode);
    const settlementLevel = normalizeSettlementLevel(campaign.settlement_level);
    if (mode === "stocked") {
      if (item.price.cpTotal <= 0) {
        return reply.code(400).send({ error: "That item has no purchase price." });
      }
      const available = stockQuantity(campaign, item.id);
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
          const currentMerchant = db
            .prepare("SELECT * FROM campaign_merchants WHERE id = ?")
            .get(merchant.id) as CampaignMerchantRow | undefined;
          if (!currentMerchant) throw new StockUnavailableError();
          const currentStock = merchantStockMap(currentMerchant);
          const available = currentStock.get(item.id) ?? 0;
          if (available < quantity) throw new StockUnavailableError();
          currentStock.set(item.id, available - quantity);
          saveMerchantStock(merchant.id, currentStock);
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
      stockQuantity: mode === "stocked" ? stockQuantity(campaign, item.id) : null,
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
    const merchant = ensureActiveMerchant(campaign);
    const mode = normalizeShopStockMode(merchant.mode);
    const saved = transaction(() => {
      const result = saveShopDraft(character, draft);
      if (!result.moved) return { moved: false as const, summary: result.summary };
      if (mode === "stocked") {
        const currentMerchant = db
          .prepare("SELECT * FROM campaign_merchants WHERE id = ?")
          .get(merchant.id) as CampaignMerchantRow | undefined;
        if (!currentMerchant) throw new Error("The active merchant disappeared.");
        const stock = merchantStockMap(currentMerchant);
        stock.set(item.id, Math.min(9_999, (stock.get(item.id) ?? 0) + quantity));
        saveMerchantStock(merchant.id, stock);
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
      stockQuantity: mode === "stocked" ? stockQuantity(campaign, item.id) : null,
    });
  });
}
