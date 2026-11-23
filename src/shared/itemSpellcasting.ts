import type { Equipment } from "./types";

/** Whether an inventory item is a consumable spell scroll. */
export function isSpellScroll(item: Pick<Equipment, "traits"> | null | undefined): boolean {
  return Boolean(item?.traits?.includes("scroll"));
}

/**
 * Rank printed on a generic scroll, such as "Scroll of 3rd-rank Spell".
 * Specific spell scrolls follow the same naming convention.
 */
export function scrollSpellRank(
  item: Pick<Equipment, "name" | "traits" | "level"> | null | undefined
): number | null {
  if (!item || !isSpellScroll(item)) return null;
  const match = item.name.match(/(\d+)(?:st|nd|rd|th)-rank\s+spell/i);
  if (match) {
    const rank = Number(match[1]);
    if (Number.isInteger(rank) && rank >= 1 && rank <= 10) return rank;
  }
  // Generic scrolls sit at item level 2 × rank - 1.
  if (Number.isFinite(item.level) && item.level >= 1 && item.level <= 19) {
    const rank = Math.ceil((item.level + 1) / 2);
    return rank >= 1 && rank <= 10 ? rank : null;
  }
  return null;
}
