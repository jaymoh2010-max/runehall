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
 * The spell phrase inside a specific wand, parsed from prose such as
 * "You cast Fireball at 3rd-rank" or "You Cast the Spell".
 */
function parseWandCast(
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
  if (!name) return null;
  const rank =
    normalizeWandRank(item.name.match(WAND_RANK_NAME)?.[1]) ??
    normalizeWandRank(item.name.match(WAND_RANK_LABEL)?.[1]) ??
    normalizeWandRank(match[1]) ??
    normalizeWandRank(text.match(WAND_RANK_TEXT)?.[1]);
  return { name, rank };
}

function isFlexibleWandSpell(name: string): boolean {
  return /^(?:the|a|an)?\s*spell\b|^its\s+spell\b/i.test(name);
}

/**
 * The fixed spell inside a specific wand, parsed from prose such as
 * "You cast Fireball at 3rd-rank." Wands that let the wielder choose the spell
 * or modify an arbitrary spell return null and stay manual.
 */
export function specificWandSpell(
  item: Pick<Equipment, "name" | "traits" | "description"> | null | undefined
): SpecificWandSpell | null {
  const cast = parseWandCast(item);
  if (!cast || isFlexibleWandSpell(cast.name)) return null;
  return cast;
}

/**
 * Rank of a flexible wand that casts a spell chosen when the wand was made,
 * such as a Wand of Widening. The sheet uses the generic wand picker for these
 * and surfaces the wand's own effect as manual resolution.
 */
export function flexibleWandRank(
  item: Pick<Equipment, "name" | "traits" | "description"> | null | undefined
): number | null {
  const cast = parseWandCast(item);
  if (!cast || !isFlexibleWandSpell(cast.name)) return null;
  return cast.rank;
}

export interface StaffSpell {
  name: string;
  rank: number;
}

const STAFF_LIST_ITEM = /<li>\s*(?:<p>)?\s*<strong>([^<]+)<\/strong>([\s\S]*?)<\/li>/gi;
const STAFF_RANK_LABEL = /\b(Cantrips?|\d+(?:st|nd|rd|th))\b\s+/gi;

const STAFF_SPELL_FALLBACKS: Record<string, StaffSpell[]> = {
  "bounty's light": [
    { name: "Ignition", rank: 0 },
    { name: "Breathe Fire", rank: 1 },
    { name: "Breathe Fire", rank: 2 },
    { name: "Floating Flame", rank: 2 },
    { name: "Floating Flame", rank: 3 },
    { name: "Fireball", rank: 3 },
  ],
};

function cleanStaffSpellName(rawName: string): string {
  return rawName
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

/**
 * Expand a staff list entry into spell names. The compendium usually separates
 * spells with commas or "or", but some entries concatenate names without a
 * separator (for example "Runic Body Summon Animal"). When the caller supplies
 * the spell list, split concatenations against known names; otherwise keep the
 * raw entry and let the caller resolve it.
 */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function staffSpellNames(rawName: string, knownSpells: Map<string, string> | null): string[] {
  const cleaned = cleanStaffSpellName(rawName);
  if (!cleaned) return [];
  // Check the whole entry first so spell names containing "or" (such as
  // "Summon Plant or Fungus") are not split into two spells.
  const whole = knownSpells?.get(cleaned.toLowerCase());
  if (whole) return [whole];
  const parts = splitTopLevelCommas(cleaned)
    .flatMap((part) => {
      const trimmed = cleanStaffSpellName(part);
      if (!trimmed) return [];
      if (knownSpells?.has(trimmed.toLowerCase())) return [trimmed];
      return trimmed
        .split(/\s+or\s+/i)
        .map((candidate) => cleanStaffSpellName(candidate))
        .filter(Boolean);
    })
    .filter(Boolean);
  if (!knownSpells) return parts;
  return parts.flatMap((part) => {
    const exact = knownSpells.get(part.toLowerCase());
    if (exact) return [exact];
    const split = splitKnownSpellNames(part, knownSpells);
    return split.length ? split : [part];
  });
}

function splitKnownSpellNames(text: string, knownSpells: Map<string, string>): string[] {
  const memo = new Map<string, string[] | null>();
  const names = [...knownSpells.keys()].sort((left, right) => right.length - left.length);
  const solve = (value: string): string[] | null => {
    const key = value.toLowerCase();
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    for (const name of names) {
      if (!key.startsWith(name)) continue;
      if (key.length !== name.length && key[name.length] !== " ") continue;
      if (key.length === name.length) {
        memo.set(key, [knownSpells.get(name)!]);
        return [knownSpells.get(name)!];
      }
      const rest = solve(value.slice(name.length).trim());
      if (rest) {
        const result = [knownSpells.get(name)!, ...rest];
        memo.set(key, result);
        return result;
      }
    }
    memo.set(key, null);
    return null;
  };
  return solve(text) ?? [];
}

function plainStaffSpells(text: string, knownSpells: Map<string, string> | null): StaffSpell[] {
  const start = text.search(/\bCantrips?\b\s+[A-Z]/i);
  if (start < 0) return [];
  const segment = text.slice(start).split(/Craft Requirements/i)[0];
  const matches = [...segment.matchAll(STAFF_RANK_LABEL)];
  const spells: StaffSpell[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const rank = staffRank(matches[index][1]);
    if (rank === null) continue;
    const contentStart = (matches[index].index ?? 0) + matches[index][0].length;
    const contentEnd = matches[index + 1]?.index ?? segment.length;
    const content = segment.slice(contentStart, contentEnd);
    for (const name of staffSpellNames(content, knownSpells)) {
      if (name) spells.push({ name, rank });
    }
  }
  return spells;
}

function staffRank(label: string): number | null {
  const value = label.trim();
  if (/^cantrips?$/i.test(value)) return 0;
  const match = value.match(/^(\d+)(?:st|nd|rd|th)$/i);
  if (!match) return null;
  const rank = Number(match[1]);
  return Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : null;
}

/** Spells listed in a staff's activation block, grouped by their staff rank. */
export function staffSpells(
  item: Pick<Equipment, "name" | "traits" | "description"> | null | undefined,
  knownSpellNames?: Iterable<string>
): StaffSpell[] {
  if (!item?.traits?.includes("staff")) return [];
  const text = String(item.description ?? "");
  const knownSpells = knownSpellNames
    ? new Map([...knownSpellNames].map((name) => [name.toLowerCase(), name]))
    : null;
  const seen = new Set<string>();
  const spells: StaffSpell[] = [];
  const add = (name: string, rank: number) => {
    const key = `${rank}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    spells.push({ name, rank });
  };
  for (const match of text.matchAll(STAFF_LIST_ITEM)) {
    const rank = staffRank(match[1]);
    if (rank === null) continue;
    for (const name of staffSpellNames(match[2], knownSpells)) {
      if (name) add(name, rank);
    }
  }
  if (!spells.length) {
    for (const spell of plainStaffSpells(plainText(text), knownSpells)) {
      add(spell.name, spell.rank);
    }
  }
  if (!spells.length) {
    for (const spell of STAFF_SPELL_FALLBACKS[item.name.toLowerCase()] ?? []) {
      add(spell.name, spell.rank);
    }
  }
  return spells;
}

/**
 * The non-spell special text on a staff, taken from the prose before its
 * Activate block. This keeps unique bonuses and triggered effects visible at
 * the table without pretending to automate them.
 */
export function staffSpecialEffect(
  item: Pick<Equipment, "name" | "traits" | "description"> | null | undefined
): string | null {
  if (!item || !staffSpells(item).length) return null;
  const text = plainText(item.description);
  const activate = text.search(/\bActivate\b/i);
  const before = (activate >= 0 ? text.slice(0, activate) : text).trim();
  return before ? before.slice(0, 700) : null;
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
