import type { CharacterDraft, Spell } from "./types";

const WORD_NUMBERS: Record<string, number> = {
  once: 1,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * Innate cantrips are at will. A ranked spell uses its explicit daily maximum
 * when the builder or a granting ability sets one; otherwise fall back to the
 * frequency in the spell prose. An explicit 0 is the at-will sentinel for
 * ranked innate spells such as Neighborly Graces. Hourly and weekly abilities
 * are reset on daily preparations because the sheet does not track exploration
 * time precisely.
 */
export function innateUsesMax(
  spell: Pick<Spell, "rank" | "description">,
  explicitMax?: number | null
): number | null {
  if (spell.rank === 0) return null;
  if (typeof explicitMax === "number" && Number.isFinite(explicitMax)) {
    if (explicitMax <= 0) return null;
    return Math.max(1, Math.min(20, Math.round(explicitMax)));
  }
  const text = String(spell.description || "");
  if (/\bat[- ]will\b/i.test(text)) return null;
  const numeric = text.match(/(\d+)\s+times?\s+per\s+(?:day|hour|week)/i);
  if (numeric) return Math.max(1, Math.min(20, Number(numeric[1])));
  const word = text.match(
    /\b(once|twice|three|four|five)\s+(?:times?\s+)?per\s+(?:day|hour|week)/i
  );
  if (word) return WORD_NUMBERS[word[1].toLowerCase()] ?? 1;
  return 1;
}

export function innateUsesRemaining(
  draft: Pick<CharacterDraft, "spells">,
  spell: Pick<Spell, "id" | "rank" | "description">
): number | null {
  const max = innateUsesMax(spell, draft.spells.innateMax?.[spell.id]);
  if (max === null) return null;
  const used = Math.max(0, Math.round(Number(draft.spells.innateUsed[spell.id]) || 0));
  return Math.max(0, max - used);
}

export function consumeInnateUse(draft: CharacterDraft, spellId: string): CharacterDraft {
  const used = Math.max(0, Math.round(Number(draft.spells.innateUsed[spellId]) || 0));
  return {
    ...draft,
    spells: {
      ...draft.spells,
      innateUsed: { ...draft.spells.innateUsed, [spellId]: used + 1 },
    },
  };
}
