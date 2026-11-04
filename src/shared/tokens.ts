import type { Token, TokenCondition } from "./types";

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

export function tokenConditionLabel(condition: TokenCondition): string {
  const value = condition.value && condition.value > 0 ? ` ${condition.value}` : "";
  const duration = condition.duration && condition.duration > 0 ? ` (${condition.duration}r)` : "";
  return `${condition.name}${value}${duration}`;
}

export function tokenConditionSummary(conditions: TokenCondition[]): string {
  return conditions.map(tokenConditionLabel).join(", ");
}

/**
 * Tick timed conditions at the end of a turn. Conditions without a duration
 * are left alone; a condition whose duration reaches zero is removed.
 */
export function tickTokenConditions(conditions: TokenCondition[]): TokenCondition[] {
  return conditions
    .map((condition) =>
      condition.duration !== null && condition.duration !== undefined && condition.duration > 0
        ? { ...condition, duration: condition.duration - 1 }
        : condition,
    )
    .filter(
      (condition) =>
        condition.duration === null ||
        condition.duration === undefined ||
        condition.duration > 0,
    );
}

/**
 * Aggregate HP for a token group. Only members with a defined maximum
 * contribute to the pool; members without HP still count toward the group
 * size shown at the table.
 */
export function groupHp(
  tokens: Pick<Token, "hpCurrent" | "hpMax">[],
): GroupHp {
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
