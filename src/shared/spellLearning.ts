import type { Spell } from "./types";

/** Learn a Spell check DCs by spell rank. */
const LEARN_SPELL_DC: Record<number, number> = {
  0: 15,
  1: 15,
  2: 18,
  3: 20,
  4: 23,
  5: 26,
  6: 28,
  7: 31,
  8: 34,
  9: 36,
  10: 41,
};

export function learnSpellDc(rank: number): number {
  const normalized = Math.max(0, Math.min(10, Math.round(Number(rank) || 0)));
  return LEARN_SPELL_DC[normalized] ?? LEARN_SPELL_DC[1];
}

/**
 * Learn a Spell cost in copper: 1 gp per rank for common spells, 2 gp for
 * uncommon, 5 gp for rare, and 10 gp for unique. Cantrips use rank 1 pricing.
 */
export function learnSpellCostCp(spell: Pick<Spell, "rank" | "rarity">): number {
  const rank = Math.max(1, Math.min(10, Math.round(Number(spell.rank) || 1)));
  const rarity = String(spell.rarity ?? "").toLowerCase();
  const multiplier =
    rarity === "unique" ? 10 : rarity === "rare" ? 5 : rarity === "uncommon" ? 2 : 1;
  return rank * multiplier * 100;
}
