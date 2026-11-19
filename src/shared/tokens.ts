import type { CharacterCondition, Token, TokenCondition } from "./types";

export interface GroupHp {
  count: number;
  current: number;
  max: number;
  percent: number | null;
}

export function normalizeTokenCondition(value: unknown): TokenCondition | null {
  if (typeof value === "string") {
    const name = value.trim().slice(0, 60);
    return name ? { name, value: null, duration: null } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 60) : "";
  if (!name) return null;
  const numeric = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input) ? Math.max(0, Math.round(input)) : null;
  return {
    name,
    value: numeric(record.value),
    duration: numeric(record.duration),
  };
}

export function normalizeTokenConditions(value: unknown): TokenCondition[] {
  if (!Array.isArray(value)) return [];
  const conditions: TokenCondition[] = [];
  for (const entry of value.slice(0, 20)) {
    const condition = normalizeTokenCondition(entry);
    if (condition) conditions.push(condition);
  }
  return conditions;
}

/** Character-sheet conditions and table-token conditions share one shape. */
export function conditionsFromSheet(conditions: CharacterCondition[]): TokenCondition[] {
  return normalizeTokenConditions(conditions);
}

/** Mirror a token condition edit back onto the linked character sheet. */
export function sheetConditionsFromToken(conditions: TokenCondition[]): CharacterCondition[] {
  return normalizeTokenConditions(conditions);
}

/** Strip a legacy trailing value such as "Drained 2" while preserving case. */
export function conditionNameWithoutValue(value: string): string {
  return value
    .trim()
    .replace(/\s+\d+$/, "")
    .trim();
}

/** Normalize a condition name for matching, including legacy "Drained 2" names. */
export function conditionBaseName(value: string): string {
  return conditionNameWithoutValue(value).toLowerCase();
}

/** Read a condition value from the explicit field or a legacy trailing number. */
export function conditionNumericValue(condition: {
  name: string;
  value?: number | null;
}): number | null {
  if (typeof condition.value === "number" && Number.isFinite(condition.value)) {
    return Math.max(0, Math.round(condition.value));
  }
  const trailing = condition.name.trim().match(/\s+(\d+)$/);
  return trailing ? Number(trailing[1]) : null;
}

/** Parse the sheet/token condition inputs, lifting a trailing number into the value. */
export function parseConditionEntry(input: {
  name: string;
  value?: number | null;
  duration?: number | null;
}): TokenCondition | null {
  const raw = input.name.trim();
  if (!raw) return null;
  const trailing = raw.match(/^(.*?)\s+(\d+)$/);
  const name = conditionNameWithoutValue(trailing?.[1] ?? raw).slice(0, 60);
  if (!name) return null;
  const explicitValue =
    typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;
  const trailingValue = trailing ? Number(trailing[2]) : null;
  return normalizeTokenCondition({
    name,
    value: explicitValue ?? trailingValue,
    duration: input.duration ?? null,
  });
}

const LIFE_CONDITIONS = new Set(["dying", "unconscious", "dead", "wounded"]);

/**
 * Mirror the sheet's life-state conditions onto a linked token without
 * discarding table-only conditions (Frightened, Off-Guard, and so on).
 */
export function syncLifeConditions(
  tokenConditions: TokenCondition[],
  sheetConditions: CharacterCondition[]
): TokenCondition[] {
  const kept = tokenConditions.filter(
    (condition) => !LIFE_CONDITIONS.has(conditionBaseName(condition.name))
  );
  const life = sheetConditions
    .filter((condition) => LIFE_CONDITIONS.has(conditionBaseName(condition.name)))
    .map((condition) => ({
      name: conditionNameWithoutValue(condition.name),
      value: conditionNumericValue(condition),
      duration: null,
    }));
  return [...kept, ...life];
}

export function conditionLabel(condition: {
  name: string;
  value?: number | null;
  duration?: number | null;
}): string {
  const value = condition.value && condition.value > 0 ? ` ${condition.value}` : "";
  const duration = condition.duration && condition.duration > 0 ? ` (${condition.duration}r)` : "";
  return `${condition.name}${value}${duration}`;
}

export function tokenConditionLabel(condition: TokenCondition): string {
  return conditionLabel(condition);
}

export function tokenConditionSummary(conditions: TokenCondition[]): string {
  return conditions.map(tokenConditionLabel).join(", ");
}

/**
 * Tick conditions at the end of a turn. Timed conditions lose a round, and
 * Frightened also loses one point of value (PF2e reduces frightened by 1 at
 * the end of each of the affected creature's turns).
 */
export function tickTokenConditions(conditions: TokenCondition[]): TokenCondition[] {
  const next: TokenCondition[] = [];
  for (const condition of conditions) {
    const name = conditionBaseName(condition.name);
    const value = conditionNumericValue(condition);
    const updated = { ...condition, name: conditionNameWithoutValue(condition.name) };
    if (name === "frightened" && value !== null && value > 0) {
      updated.value = value - 1;
    }
    if (typeof condition.duration === "number" && condition.duration > 0) {
      updated.duration = condition.duration - 1;
    }
    if (
      (typeof updated.duration === "number" && updated.duration <= 0) ||
      (name === "frightened" && typeof updated.value === "number" && updated.value <= 0)
    ) {
      continue;
    }
    next.push(updated);
  }
  return next;
}

/**
 * Aggregate HP for a token group. Only members with a defined maximum
 * contribute to the pool; members without HP still count toward the group
 * size shown at the table.
 */
export function groupHp(tokens: Pick<Token, "hpCurrent" | "hpMax">[]): GroupHp {
  let current = 0;
  let max = 0;
  for (const token of tokens) {
    if (token.hpMax === null) continue;
    max += Math.max(0, token.hpMax);
    current += Math.max(0, Math.min(token.hpMax, token.hpCurrent ?? token.hpMax));
  }
  return {
    count: tokens.length,
    current,
    max,
    percent: max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : null,
  };
}
