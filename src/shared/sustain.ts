import type { CharacterDraft, Spell, SustainedSpell } from "./types";

export const SUSTAINED_SPELL_LIMIT = 12;

function clampRank(value: unknown): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 1;
  return Math.max(1, Math.min(10, number));
}

/** True when the spell's printed text asks the caster to Sustain it. */
export function spellNeedsSustain(spell: Pick<Spell, "description" | "duration">): boolean {
  return /sustain/i.test(spell.description || "") || /sustain/i.test(spell.duration || "");
}

export function normalizeSustainedSpells(value: unknown): SustainedSpell[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SustainedSpell[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const spellId = typeof record.spellId === "string" ? record.spellId : "";
    if (!spellId || seen.has(spellId)) continue;
    seen.add(spellId);
    out.push({
      id:
        typeof record.id === "string" && record.id
          ? record.id.slice(0, 100)
          : `sustained:${spellId}`,
      spellId: spellId.slice(0, 120),
      name: (typeof record.name === "string" ? record.name : "Sustained spell").slice(0, 120),
      rank: clampRank(record.rank),
      duration: (typeof record.duration === "string" ? record.duration : "").slice(0, 120),
    });
    if (out.length >= SUSTAINED_SPELL_LIMIT) break;
  }
  return out;
}

export function sustainedSpellFor(
  draft: Pick<CharacterDraft, "play">,
  spellId: string
): SustainedSpell | null {
  return draft.play.sustainedSpells.find((entry) => entry.spellId === spellId) ?? null;
}

export interface BeginSustainResult {
  draft: CharacterDraft;
  added: boolean;
  reason: "already-active" | "not-sustained" | null;
}

/**
 * Record a spell as sustained. Recasting the same spell replaces its stored
 * rank and duration instead of creating a duplicate.
 */
export function beginSustainedSpell(
  draft: CharacterDraft,
  spell: Pick<Spell, "id" | "name" | "description" | "duration">,
  rank: number
): BeginSustainResult {
  if (!spellNeedsSustain(spell)) {
    return { draft, added: false, reason: "not-sustained" };
  }
  const existing = draft.play.sustainedSpells.find((entry) => entry.spellId === spell.id);
  if (existing) {
    return {
      draft: {
        ...draft,
        play: {
          ...draft.play,
          sustainedSpells: draft.play.sustainedSpells.map((entry) =>
            entry.spellId === spell.id
              ? { ...entry, rank: clampRank(rank), duration: spell.duration || entry.duration }
              : entry
          ),
        },
      },
      added: false,
      reason: "already-active",
    };
  }
  if (draft.play.sustainedSpells.length >= SUSTAINED_SPELL_LIMIT) {
    return { draft, added: false, reason: null };
  }
  return {
    draft: {
      ...draft,
      play: {
        ...draft.play,
        sustainedSpells: [
          ...draft.play.sustainedSpells,
          {
            id: `sustained:${spell.id}`,
            spellId: spell.id,
            name: spell.name,
            rank: clampRank(rank),
            duration: spell.duration || "Sustained",
          },
        ],
      },
    },
    added: true,
    reason: null,
  };
}

export function endSustainedSpell(draft: CharacterDraft, spellId: string): CharacterDraft {
  if (!draft.play.sustainedSpells.some((entry) => entry.spellId === spellId)) return draft;
  return {
    ...draft,
    play: {
      ...draft.play,
      sustainedSpells: draft.play.sustainedSpells.filter((entry) => entry.spellId !== spellId),
    },
  };
}
