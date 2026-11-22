import type { CharacterDraft, Spell } from "./types";

const WORD_NUMBERS: Record<string, number> = {
  once: 1,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * Innate cantrips are at will. Most granted spells say "once per day"; a few
 * allow two or three uses. Hourly and weekly abilities are reset on daily
 * preparations because the sheet does not track exploration time precisely.
 */
export function innateUsesMax(spell: Pick<Spell, "rank" | "description">): number | null {
  if (spell.rank === 0) return null;
  const text = String(spell.description || "");
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
  const max = innateUsesMax(spell);
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
