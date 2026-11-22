import { lootCopper, normalizeLootItems } from "./loot";
import type { LootParcel, TreasureBudget, TreasureItemMix, TreasureItemMixRow } from "./types";

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

export type TreasureItemKind = "permanent" | "consumable" | "other";

/** The compendium fields needed to classify a loot item. */
export interface TreasureItemFacts {
  level: number;
  type: string;
  traits?: string[];
  consumable?: unknown;
}

/**
 * Gear that stays on the sheet is permanent treasure; anything with a
 * consumable profile, single-use ammunition, the consumable trait, or the wand
 * trait is spent when used. Gems, art objects, and unmatched ids count as
 * other treasure.
 */
export function treasureItemKind(item: TreasureItemFacts | null | undefined): TreasureItemKind {
  if (!item) return "other";
  const traits = item.traits ?? [];
  // Wands are reusable once-per-day items, not consumables.
  if (traits.includes("wand")) return "permanent";
  if (
    item.consumable ||
    item.type === "consumable" ||
    item.type === "ammo" ||
    traits.includes("consumable")
  ) {
    return "consumable";
  }
  if (item.type === "treasure") return "other";
  return "permanent";
}

function emptyMixRow(level: number, permanentTarget: number, consumableTarget: number) {
  return { level, permanent: 0, permanentTarget, consumable: 0, consumableTarget };
}

/**
 * Item allotment from table 10-9. Permanent items sit one level above the
 * party and at party level; consumables span one level above through one
 * below. Levels 1 and 20 use the table's special rows.
 */
export function treasureItemTargets(level: number): TreasureItemMixRow[] {
  const safe = Math.max(1, Math.min(20, Math.round(level || 1)));
  if (safe === 20) {
    return [emptyMixRow(20, 4, 4), emptyMixRow(19, 0, 2)];
  }
  if (safe === 1) {
    return [emptyMixRow(2, 2, 2), emptyMixRow(1, 2, 3)];
  }
  return [emptyMixRow(safe + 1, 2, 2), emptyMixRow(safe, 2, 2), emptyMixRow(safe - 1, 0, 2)];
}

export function countTreasureItemKinds(
  items: ReadonlyArray<{ itemId: string; quantity: number }>,
  factsById: ReadonlyMap<string, TreasureItemFacts>
): { permanent: number; consumable: number; other: number } {
  const counts = { permanent: 0, consumable: 0, other: 0 };
  for (const stack of items) {
    const quantity = Math.max(0, Math.round(Number(stack.quantity) || 0));
    if (!quantity) continue;
    counts[treasureItemKind(factsById.get(stack.itemId))] += quantity;
  }
  return counts;
}

/**
 * Compare prepared and distributed parcel contents with the permanent and
 * consumable item counts on table 10-9. Values are advisory and do not gate
 * distribution.
 */
export function treasureItemMix(
  level: number,
  items: ReadonlyArray<{ itemId: string; quantity: number }>,
  factsById: ReadonlyMap<string, TreasureItemFacts>,
  priceCpById: ReadonlyMap<string, number> = new Map()
): TreasureItemMix {
  const rows = treasureItemTargets(level);
  const rowByLevel = new Map(rows.map((row) => [row.level, row]));
  let permanent = 0;
  let consumable = 0;
  let other = 0;
  let permanentValueCp = 0;
  let consumableValueCp = 0;
  let otherValueCp = 0;
  let outsideBands = 0;
  let unmatched = 0;

  for (const stack of items) {
    const quantity = Math.max(0, Math.round(Number(stack.quantity) || 0));
    if (!quantity) continue;
    const facts = factsById.get(stack.itemId);
    if (!facts) unmatched += quantity;
    const value = Math.max(0, Math.round(priceCpById.get(stack.itemId) ?? 0)) * quantity;
    const kind = treasureItemKind(facts);
    if (kind === "permanent") {
      permanent += quantity;
      permanentValueCp += value;
      const row = facts ? rowByLevel.get(facts.level) : undefined;
      if (row) row.permanent += quantity;
      else if (facts) outsideBands += quantity;
    } else if (kind === "consumable") {
      consumable += quantity;
      consumableValueCp += value;
      const row = facts ? rowByLevel.get(facts.level) : undefined;
      if (row) row.consumable += quantity;
      else if (facts) outsideBands += quantity;
    } else {
      other += quantity;
      otherValueCp += value;
    }
  }

  const warnings: string[] = [];
  const shortfalls = rows.flatMap((row) => {
    const parts: string[] = [];
    if (row.permanentTarget > 0 && row.permanent < row.permanentTarget) {
      parts.push(`level ${row.level} permanent ${row.permanent}/${row.permanentTarget}`);
    }
    if (row.consumableTarget > 0 && row.consumable < row.consumableTarget) {
      parts.push(`level ${row.level} consumable ${row.consumable}/${row.consumableTarget}`);
    }
    return parts;
  });
  if (shortfalls.length) {
    warnings.push(`Short of table 10-9: ${shortfalls.join("; ")}.`);
  }
  if (outsideBands > 0) {
    warnings.push(
      `${outsideBands} item${outsideBands === 1 ? "" : "s"} ${
        outsideBands === 1 ? "falls" : "fall"
      } outside this level's item bands.`
    );
  }
  if (unmatched > 0) {
    warnings.push(
      `${unmatched} item${unmatched === 1 ? "" : "s"} could not be matched to the compendium and counted as other.`
    );
  }

  return {
    permanent,
    consumable,
    other,
    permanentValueCp,
    consumableValueCp,
    otherValueCp,
    levels: rows,
    warnings,
  };
}
