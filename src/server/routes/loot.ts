import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole, getCharacter, getUser } from "../access";
import { contextForDraft, equipment } from "../compendium";
import {
  db,
  transaction,
  type CampaignRow,
  type CharacterRow,
  type LootParcelRow,
  type TokenRow,
} from "../db";
import {
  serializeCharacter,
  serializeLootParcel,
  serializeToken,
  touchCampaign,
} from "../serialize";
import { normalizeLootItems, lootIsEmpty, applyLootToDraft } from "../../shared/loot";
import { characterSummary, normalizeCharacterDraft } from "../../shared/rules";
import { newId, now, parseJson, safeInt, safeString, sanitizeUserText } from "../util";

function gmRequires(
  request: { user: { id: string } | null },
  campaignId: string
): { row: CampaignRow | null; error?: string; code?: number } {
  if (!request.user) return { row: null, error: "Sign in to continue.", code: 401 };
  const row = getCampaign(campaignId);
  if (!row) return { row: null, error: "Campaign not found.", code: 404 };
  if (getCampaignRole(campaignId, request.user.id) !== "gm") {
    return { row: null, error: "Only the GM can prepare loot.", code: 403 };
  }
  return { row };
}

function getParcel(campaignId: string, parcelId: string): LootParcelRow | null {
  return (
    (db
      .prepare("SELECT * FROM loot_parcels WHERE id = ? AND campaign_id = ?")
      .get(parcelId, campaignId) as LootParcelRow | undefined) ?? null
  );
}

function parcelItems(row: LootParcelRow) {
  return normalizeLootItems(parseJson(row.items, []));
}

function saveItems(parcelId: string, items: ReturnType<typeof parcelItems>): void {
  db.prepare("UPDATE loot_parcels SET items = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(items),
    now(),
    parcelId
  );
}

function nextSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM loot_parcels WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

export async function registerLootRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/loot", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const rows = db
      .prepare(
        "SELECT * FROM loot_parcels WHERE campaign_id = ? ORDER BY sort_order ASC, updated_at DESC"
      )
      .all(id) as LootParcelRow[];
    return reply.send({ parcels: rows.map(serializeLootParcel) });
  });

  app.post("/api/campaigns/:id/loot", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parcelId = newId("loot");
    const ts = now();
    db.prepare(
      `INSERT INTO loot_parcels
        (id, campaign_id, name, description, items, gp, sp, cp, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, '[]', 0, 0, 0, 'open', ?, ?, ?)`
    ).run(
      parcelId,
      id,
      safeString(body.name, "New loot parcel", 120),
      sanitizeUserText(body.description, 4000),
      nextSortOrder(id),
      ts,
      ts
    );
    touchCampaign(id);
    return reply.code(201).send({ parcel: serializeLootParcel(getParcel(id, parcelId)!) });
  });

  app.patch("/api/campaigns/:id/loot/:parcelId", async (request, reply) => {
    const { id, parcelId } = request.params as { id: string; parcelId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getParcel(id, parcelId);
    if (!existing) return reply.code(404).send({ error: "Loot parcel not found." });
    if (existing.status === "distributed") {
      return reply.code(409).send({ error: "This parcel has already been distributed." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name =
      body.name === undefined ? existing.name : safeString(body.name, existing.name, 120);
    const description =
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 4000);
    const gp =
      body.gp === undefined ? existing.gp : safeInt(body.gp, existing.gp, 0, 1_000_000_000);
    const sp =
      body.sp === undefined ? existing.sp : safeInt(body.sp, existing.sp, 0, 1_000_000_000);
    const cp =
      body.cp === undefined ? existing.cp : safeInt(body.cp, existing.cp, 0, 1_000_000_000);
    db.prepare(
      "UPDATE loot_parcels SET name = ?, description = ?, gp = ?, sp = ?, cp = ?, updated_at = ? WHERE id = ?"
    ).run(name, description, gp, sp, cp, now(), parcelId);
    touchCampaign(id);
    return reply.send({ parcel: serializeLootParcel(getParcel(id, parcelId)!) });
  });

  app.delete("/api/campaigns/:id/loot/:parcelId", async (request, reply) => {
    const { id, parcelId } = request.params as { id: string; parcelId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    if (!getParcel(id, parcelId)) return reply.code(404).send({ error: "Loot parcel not found." });
    db.prepare("DELETE FROM loot_parcels WHERE id = ?").run(parcelId);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/loot/:parcelId/items", async (request, reply) => {
    const { id, parcelId } = request.params as { id: string; parcelId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getParcel(id, parcelId);
    if (!existing) return reply.code(404).send({ error: "Loot parcel not found." });
    if (existing.status === "distributed") {
      return reply.code(409).send({ error: "This parcel has already been distributed." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const item = equipment.find((entry) => entry.id === body.itemId);
    if (!item) return reply.code(404).send({ error: "Item not found in the compendium." });
    const quantity = safeInt(body.quantity, 1, 1, 9999);
    const items = parcelItems(existing);
    const row = items.find((entry) => entry.itemId === item.id);
    if (row) {
      row.quantity = Math.min(9999, row.quantity + quantity);
    } else {
      if (items.length >= 200) {
        return reply.code(400).send({ error: "That parcel already has too many item rows." });
      }
      items.push({ itemId: item.id, name: item.name, quantity });
    }
    saveItems(parcelId, items);
    touchCampaign(id);
    return reply.code(201).send({ parcel: serializeLootParcel(getParcel(id, parcelId)!) });
  });

  app.patch("/api/campaigns/:id/loot/:parcelId/items", async (request, reply) => {
    const { id, parcelId } = request.params as { id: string; parcelId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getParcel(id, parcelId);
    if (!existing) return reply.code(404).send({ error: "Loot parcel not found." });
    if (existing.status === "distributed") {
      return reply.code(409).send({ error: "This parcel has already been distributed." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const itemId = safeString(body.itemId, "", 200);
    if (!itemId) return reply.code(400).send({ error: "Choose an item to update." });
    const quantity = safeInt(body.quantity, 1, 0, 9999);
    const items = parcelItems(existing).flatMap((item) => {
      if (item.itemId !== itemId) return [item];
      return quantity > 0 ? [{ ...item, quantity }] : [];
    });
    saveItems(parcelId, items);
    touchCampaign(id);
    return reply.send({ parcel: serializeLootParcel(getParcel(id, parcelId)!) });
  });

  app.delete("/api/campaigns/:id/loot/:parcelId/items/:itemId", async (request, reply) => {
    const { id, parcelId, itemId } = request.params as {
      id: string;
      parcelId: string;
      itemId: string;
    };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getParcel(id, parcelId);
    if (!existing) return reply.code(404).send({ error: "Loot parcel not found." });
    if (existing.status === "distributed") {
      return reply.code(409).send({ error: "This parcel has already been distributed." });
    }
    saveItems(
      parcelId,
      parcelItems(existing).filter((item) => item.itemId !== itemId)
    );
    touchCampaign(id);
    return reply.send({ parcel: serializeLootParcel(getParcel(id, parcelId)!) });
  });

  app.post("/api/campaigns/:id/loot/:parcelId/distribute", async (request, reply) => {
    const { id, parcelId } = request.params as { id: string; parcelId: string };
    const access = gmRequires(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const parcel = getParcel(id, parcelId);
    if (!parcel) return reply.code(404).send({ error: "Loot parcel not found." });
    if (parcel.status === "distributed") {
      return reply.code(409).send({
        error: `This parcel was already given to ${parcel.distributed_to_name || "a character"}.`,
      });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const characterId = safeString(body.characterId, "", 120);
    if (!characterId)
      return reply.code(400).send({ error: "Choose a character to receive the loot." });
    const character = getCharacter(characterId);
    if (!character || character.campaign_id !== id) {
      return reply.code(404).send({ error: "That character is not part of this campaign." });
    }
    const serializedParcel = serializeLootParcel(parcel);
    if (lootIsEmpty(serializedParcel)) {
      return reply.code(400).send({ error: "Add items or coins before distributing this parcel." });
    }

    let draft;
    try {
      draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
    } catch {
      return reply.code(400).send({ error: "That character's draft could not be read." });
    }
    const equippable = new Set(
      equipment
        .filter((item) => Boolean(item.weapon || item.armor || item.shield))
        .map((item) => item.id)
    );
    draft = applyLootToDraft(draft, serializedParcel, equippable);
    const summary = characterSummary(draft, contextForDraft(draft));
    const ts = now();

    const updatedTokens = transaction(() => {
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), ts, character.id);
      const linkedTokens = db
        .prepare("SELECT * FROM tokens WHERE character_id = ?")
        .all(character.id) as TokenRow[];
      const tokens: TokenRow[] = [];
      for (const token of linkedTokens) {
        const wasFull =
          token.hp_current === null || token.hp_max === null || token.hp_current >= token.hp_max;
        const nextHp = wasFull ? summary.hp : Math.min(token.hp_current ?? summary.hp, summary.hp);
        db.prepare(
          "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, updated_at = ? WHERE id = ?"
        ).run(draft.name, summary.hp, nextHp, summary.ac, ts, token.id);
        tokens.push(db.prepare("SELECT * FROM tokens WHERE id = ?").get(token.id) as TokenRow);
      }
      db.prepare(
        `UPDATE loot_parcels
         SET status = 'distributed', distributed_to = ?, distributed_to_name = ?, distributed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(character.id, draft.name, ts, ts, parcelId);
      return tokens;
    });

    for (const token of updatedTokens) {
      app.broadcastCampaign(id, "token:updated", serializeToken(token));
    }
    app.broadcastCampaign(id, "character:updated", {
      characterId: character.id,
      summary,
      name: draft.name,
    });
    touchCampaign(id);

    const updatedCharacter = getCharacter(character.id)!;
    const owner = getUser(updatedCharacter.user_id);
    return reply.send({
      parcel: serializeLootParcel(getParcel(id, parcelId)!),
      character: serializeCharacter(updatedCharacter, owner?.display_name ?? "", {
        canEdit: true,
        canView: true,
      }),
    });
  });
}
