import type { DegreeOfSuccess, Spell } from "./types";

const DEGREE_ORDER: DegreeOfSuccess[] = [
  "critical-failure",
  "failure",
  "success",
  "critical-success",
];

/** Move a degree up or down one step, clamped to the four PF2e degrees. */
export function shiftDegree(degree: DegreeOfSuccess, steps: number): DegreeOfSuccess {
  const index = DEGREE_ORDER.indexOf(degree);
  const next = Math.max(0, Math.min(DEGREE_ORDER.length - 1, index + Math.round(steps)));
  return DEGREE_ORDER[next];
}

export function spellHasIncapacitation(spell: Pick<Spell, "traits">): boolean {
  return spell.traits.some((trait) => trait.toLowerCase() === "incapacitation");
}

/** More than twice the effect's rank means the target improves its save. */
export function incapacitationThreshold(effectRank: number): number {
  return Math.max(1, Math.round(effectRank)) * 2;
}

export function adjustDegreeForIncapacitation(
  degree: DegreeOfSuccess,
  targetLevel: number,
  effectRank: number
): { degree: DegreeOfSuccess; adjusted: boolean; threshold: number } {
  const threshold = incapacitationThreshold(effectRank);
  if (Math.round(targetLevel) > threshold) {
    return { degree: shiftDegree(degree, 1), adjusted: true, threshold };
  }
  return { degree, adjusted: false, threshold };
}

export function incapacitationNote(spellRank: number): string {
  return `Incapacitation: a target above level ${incapacitationThreshold(spellRank)} treats its save as one degree better.`;
}

/** Highest effect rank this counteract check can suppress, or null. */
export function counteractRankFor(degree: DegreeOfSuccess, castRank: number): number | null {
  const rank = Math.max(1, Math.min(10, Math.round(castRank)));
  if (degree === "critical-success") return Math.min(10, rank + 1);
  if (degree === "success") return rank;
  return null;
}

export interface CounteractResolution {
  degree: DegreeOfSuccess;
  castRank: number;
  effectRank: number;
  /** Highest effect rank the check can counteract. */
  counteractRank: number | null;
  counteracted: boolean;
  note: string;
}

export function resolveCounteract(
  degree: DegreeOfSuccess,
  castRank: number,
  effectRank: number
): CounteractResolution {
  const rank = Math.max(1, Math.min(10, Math.round(castRank)));
  const effect = Math.max(0, Math.min(20, Math.round(effectRank)));
  const counteractRank = counteractRankFor(degree, rank);
  const counteracted = counteractRank !== null && counteractRank >= effect;
  const note =
    counteractRank === null
      ? "The counteract check failed; the effect remains."
      : counteracted
        ? `Counteracted an effect of rank ${effect} or lower (counteract rank ${counteractRank}).`
        : `Counteract rank ${counteractRank} is too low for an effect of rank ${effect}.`;
  return {
    degree,
    castRank: rank,
    effectRank: effect,
    counteractRank,
    counteracted,
    note,
  };
}
