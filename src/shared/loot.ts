import type { CharacterDraft, LootItem, LootParcel } from "./types";

const MAX_LOOT_ROWS = 200;
const MAX_ITEM_QUANTITY = 9999;

function clampQuantity(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.round(number)));
}

/**
 * Loot parcels are stored as JSON. Keep the shape defensive so an older or
 * hand-edited parcel cannot break the loot bench or a sheet import.
 */
export function normalizeLootItems(value: unknown): LootItem[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, LootItem>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const itemId = typeof record.itemId === "string" ? record.itemId.trim().slice(0, 200) : "";
    if (!itemId) continue;
    const name =
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim().slice(0, 140)
        : itemId;
    const quantity = clampQuantity(record.quantity);
    const existing = merged.get(itemId);
    if (existing) {
      existing.quantity = Math.min(MAX_ITEM_QUANTITY, existing.quantity + quantity);
    } else if (merged.size < MAX_LOOT_ROWS) {
      merged.set(itemId, { itemId, name, quantity });
    }
  }
  return [...merged.values()];
}

export function lootCopper(parcel: Pick<LootParcel, "gp" | "sp" | "cp">): number {
  return (
    Math.max(0, Math.round(parcel.gp)) * 100 +
    Math.max(0, Math.round(parcel.sp)) * 10 +
    Math.max(0, Math.round(parcel.cp))
  );
}

export function lootItemCount(parcel: Pick<LootParcel, "items">): number {
  return normalizeLootItems(parcel.items).reduce((total, item) => total + item.quantity, 0);
}

export function lootIsEmpty(parcel: Pick<LootParcel, "items" | "gp" | "sp" | "cp">): boolean {
  return lootItemCount(parcel) === 0 && lootCopper(parcel) === 0;
}

/**
 * Merge a parcel into a character draft. Existing equipment rows are updated,
 * new weapons/armor/shields start equipped (matching the gear picker), and
 * coins are added to the character's purse.
 */
export function applyLootToDraft(
  draft: CharacterDraft,
  parcel: Pick<LootParcel, "items" | "gp" | "sp" | "cp">,
  equippableItemIds: ReadonlySet<string> = new Set(),
): CharacterDraft {
  const equipment = draft.equipment.map((entry) => ({ ...entry }));
  for (const item of normalizeLootItems(parcel.items)) {
    const existing = equipment.find((entry) => entry.itemId === item.itemId);
    if (existing) {
      existing.quantity = Math.min(MAX_ITEM_QUANTITY, existing.quantity + item.quantity);
    } else {
      equipment.push({
        itemId: item.itemId,
        quantity: item.quantity,
        equipped: equippableItemIds.has(item.itemId),
      });
    }
  }
  return {
    ...draft,
    equipment,
    currency: {
      gp: draft.currency.gp + Math.max(0, Math.round(parcel.gp)),
      sp: draft.currency.sp + Math.max(0, Math.round(parcel.sp)),
      cp: draft.currency.cp + Math.max(0, Math.round(parcel.cp)),
    },
  };
}
