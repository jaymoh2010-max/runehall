import type { Token } from "./types";

export interface GroupHp {
  count: number;
  current: number;
  max: number;
  percent: number | null;
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
