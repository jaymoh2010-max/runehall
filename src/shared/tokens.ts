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
    (condition) => !LIFE_CONDITIONS.has(condition.name.trim().toLowerCase())
  );
  const life = sheetConditions
    .filter((condition) => LIFE_CONDITIONS.has(condition.name.trim().toLowerCase()))
    .map((condition) => ({
      name: condition.name,
      value: condition.value ?? null,
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
    const name = condition.name.trim().toLowerCase();
    const updated = { ...condition };
    if (name === "frightened" && typeof condition.value === "number" && condition.value > 0) {
      updated.value = condition.value - 1;
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
