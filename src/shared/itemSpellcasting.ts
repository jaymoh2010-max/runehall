import type { Equipment } from "./types";

const MAGIC_WAND_NAME = /^Magic Wand \((\d+)(?:st|nd|rd|th)-Rank Spell\)$/i;

/** Whether an inventory item is a generic Magic Wand with a ranked spell slot. */
export function isMagicWand(item: Pick<Equipment, "name" | "traits"> | null | undefined): boolean {
  return Boolean(item?.traits?.includes("wand") && MAGIC_WAND_NAME.test(item.name));
}

/** Rank of a generic Magic Wand, or null for specific wands. */
export function wandSpellRank(
  item: Pick<Equipment, "name" | "traits"> | null | undefined
): number | null {
  if (!item || !isMagicWand(item)) return null;
  const match = item.name.match(MAGIC_WAND_NAME);
  if (!match) return null;
  const rank = Number(match[1]);
  return Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : null;
}

export interface SpecificWandSpell {
  name: string;
  rank: number | null;
}

const WAND_RANK_NAME = /\((\d+)(?:st|nd|rd|th)[- ]?rank/i;
const WAND_RANK_LABEL = /\(Rank (\d+)\)/i;
const WAND_RANK_TEXT = /\bat\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)[- ]rank/i;
const WAND_CAST = /\bYou cast\s+(?:a\s+)?(?:(?:the\s+)?(\d+)(?:st|nd|rd|th)[- ]rank\s+)?([^,.;]+)/i;

function plainText(html: string | undefined): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWandRank(value: string | undefined | null): number | null {
  const rank = Number(value);
  return Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : null;
}

/**
 * The fixed spell inside a specific wand, parsed from prose such as
 * "You cast Fireball at 3rd-rank." Wands that let the wielder choose the spell
 * or modify an arbitrary spell return null and stay manual.
 */
export function specificWandSpell(
  item: Pick<Equipment, "name" | "traits" | "description"> | null | undefined
): SpecificWandSpell | null {
  if (!item || !item.traits?.includes("wand") || isMagicWand(item)) return null;
  const text = plainText(item.description);
  const match = text.match(WAND_CAST);
  if (!match) return null;
  const name = match[2]
    .trim()
    .replace(/\s+at\s+(?:the\s+)?(?:\d+(?:st|nd|rd|th)[- ]rank|indicated rank).*$/i, "")
    .replace(/\s+of the indicated (?:level|rank).*$/i, "")
    .replace(/\s+but\b.*$/i, "")
    .trim();
  if (!name || /^(?:the|a|an)?\s*spell\b|^its\s+spell\b/i.test(name)) return null;
  const rank =
    normalizeWandRank(item.name.match(WAND_RANK_NAME)?.[1]) ??
    normalizeWandRank(item.name.match(WAND_RANK_LABEL)?.[1]) ??
    normalizeWandRank(match[1]) ??
    normalizeWandRank(text.match(WAND_RANK_TEXT)?.[1]);
  return { name, rank };
}

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
