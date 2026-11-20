import { lootCopper, normalizeLootItems } from "./loot";
import type { LootParcel, TreasureBudget } from "./types";

/**
 * GM Core table 10-9: treasure awarded over one level to a four-character
 * party. The total is approximate; item prices vary within a level.
 */
export const TREASURE_TOTAL_GP = [
  175, 300, 500, 850, 1_350, 2_000, 2_900, 4_000, 5_700, 8_000, 11_500, 16_500, 25_000, 36_500,
  54_500, 82_500, 128_000, 208_000, 355_000, 490_000,
];

/** The coin portion of the same table. */
export const TREASURE_CURRENCY_GP = [
  40, 70, 120, 200, 320, 500, 720, 1_000, 1_400, 2_000, 2_800, 4_000, 6_000, 9_000, 13_000, 20_000,
  30_000, 48_000, 80_000, 140_000,
];

export function treasureBudgetGp(level: number): TreasureBudget {
  const safe = Math.max(1, Math.min(20, Math.round(level || 1)));
  return {
    level: safe,
    totalGp: TREASURE_TOTAL_GP[safe - 1],
    currencyGp: TREASURE_CURRENCY_GP[safe - 1],
  };
}

/** Value equipment rows at their compendium price, including stack quantity. */
export function lootItemsValueCp(items: unknown, priceCpById: ReadonlyMap<string, number>): number {
  return normalizeLootItems(items).reduce((sum, item) => {
    const price = Math.max(0, Math.round(priceCpById.get(item.itemId) ?? 0));
    return sum + price * item.quantity;
  }, 0);
}

export function lootParcelValueCp(
  parcel: Pick<LootParcel, "items" | "gp" | "sp" | "cp">,
  priceCpById: ReadonlyMap<string, number>
): number {
  return lootCopper(parcel) + lootItemsValueCp(parcel.items, priceCpById);
}
