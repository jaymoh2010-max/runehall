import type { CharacterCondition, CharacterPlay, TokenTurnEffects } from "./types";

export const REGENERATION_SUPPRESSED_CONDITION = "Regeneration Suppressed";

export interface CharacterTurnEffects {
  fastHealing: number;
  fastHealingActive: boolean;
  fastHealingNote: string;
  regeneration: number;
  regenerationActive: boolean;
  regenerationNote: string;
  regenerationDeactivatedBy: string[];
}

export interface CharacterTurnHealing {
  fastHealing: number;
  regeneration: number;
  total: number;
  suppressed: boolean;
}

function integer(value: unknown, max = 1_000): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function note(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function conditionBaseName(value: string): string {
  const raw = String(value ?? "").trim();
  const trailing = raw.match(/^(.*?)\s+\d+$/);
  return (trailing?.[1] ?? raw).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

/** Normalize one damage type for matching against a regeneration entry. */
export function normalizeDamageType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+damage$/, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

/** Accept an array or comma/and/or-separated string of damage types. */
export function normalizeDamageTypeList(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s*,\s*(?:(?:or|and)\s+)?|\s+(?:or|and)\s+/i)
      : [];
  const out: string[] = [];
  for (const entry of entries) {
    const type = normalizeDamageType(entry);
    if (type && !out.includes(type)) out.push(type);
    if (out.length >= 10) break;
  }
  return out;
}

/** Normalize the character-sheet fast healing/regeneration fields. */
export function normalizeCharacterTurnEffects(input: unknown): CharacterTurnEffects {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return {
    fastHealing: integer(raw.fastHealing),
    fastHealingActive: raw.fastHealingActive !== false,
    fastHealingNote: note(raw.fastHealingNote),
    regeneration: integer(raw.regeneration),
    regenerationActive: raw.regenerationActive !== false,
    regenerationNote: note(raw.regenerationNote),
    regenerationDeactivatedBy: normalizeDamageTypeList(raw.regenerationDeactivatedBy),
  };
}

export function characterHasRegenerationSuppressed(conditions: CharacterCondition[]): boolean {
  return conditions.some(
    (condition) => conditionBaseName(condition.name) === "regeneration suppressed"
  );
}

export function characterRegenerationActive(
  play: Pick<CharacterPlay, "regeneration" | "regenerationActive" | "conditions">
): boolean {
  return (
    Number(play.regeneration) > 0 &&
    play.regenerationActive !== false &&
    !characterHasRegenerationSuppressed(play.conditions)
  );
}

/**
 * Fast healing and regeneration both restore HP at the start of the turn.
 * Regeneration is skipped while its matching "Regeneration Suppressed"
 * condition is present; fast healing is not.
 */
export function characterTurnHealingParts(
  play: Pick<
    CharacterPlay,
    "fastHealing" | "fastHealingActive" | "regeneration" | "regenerationActive" | "conditions"
  >
): CharacterTurnHealing {
  const suppressed = characterHasRegenerationSuppressed(play.conditions ?? []);
  const fastHealing =
    play.fastHealingActive !== false ? Math.max(0, Math.round(Number(play.fastHealing) || 0)) : 0;
  const regeneration =
    play.regenerationActive !== false && !suppressed
      ? Math.max(0, Math.round(Number(play.regeneration) || 0))
      : 0;
  return {
    fastHealing,
    regeneration,
    total: Math.min(1_000, fastHealing + regeneration),
    suppressed,
  };
}

export function characterTurnHealing(
  play: Pick<
    CharacterPlay,
    "fastHealing" | "fastHealingActive" | "regeneration" | "regenerationActive" | "conditions"
  >
): number {
  return characterTurnHealingParts(play).total;
}

/** Mirror linked-character turn effects into the token shape used by the table panel. */
export function characterTokenTurnEffects(play: CharacterPlay): TokenTurnEffects {
  return {
    fastHealing: play.fastHealing,
    fastHealingActive: play.fastHealingActive,
    fastHealingNote: play.fastHealingNote,
    regeneration: play.regeneration,
    regenerationActive: play.regenerationActive,
    regenerationNote: play.regenerationNote,
    regenerationDeactivatedBy: play.regenerationDeactivatedBy,
    persistentDamage: play.persistentDamage,
  };
}

/**
 * Damage of a type listed in the regeneration entry deactivates regeneration
 * until the end of the character's next turn. The condition is removed after
 * the next start-of-turn healing check, so it skips exactly one turn of
 * regeneration.
 */
export function suppressRegenerationFromDamage(
  play: Pick<
    CharacterPlay,
    "regeneration" | "regenerationActive" | "regenerationDeactivatedBy" | "conditions"
  >,
  damageTypes: unknown
): { conditions: CharacterCondition[]; applied: boolean; types: string[] } {
  const conditions = play.conditions ?? [];
  if (!(Number(play.regeneration) > 0) || play.regenerationActive === false) {
    return { conditions, applied: false, types: [] };
  }
  if (characterHasRegenerationSuppressed(conditions)) {
    return { conditions, applied: false, types: [] };
  }
  const deactivatedBy = normalizeDamageTypeList(play.regenerationDeactivatedBy);
  const types = normalizeDamageTypeList(damageTypes).filter((type) => deactivatedBy.includes(type));
  if (!types.length) return { conditions, applied: false, types: [] };
  return {
    conditions: [
      ...conditions,
      { name: REGENERATION_SUPPRESSED_CONDITION, value: null, duration: null },
    ],
    applied: true,
    types,
  };
}

export function clearRegenerationSuppression(
  conditions: CharacterCondition[]
): CharacterCondition[] {
  if (!characterHasRegenerationSuppressed(conditions)) return conditions;
  return conditions.filter(
    (condition) => conditionBaseName(condition.name) !== "regeneration suppressed"
  );
}
