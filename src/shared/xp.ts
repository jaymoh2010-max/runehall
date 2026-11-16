/** PF2e characters advance one level per 1,000 XP. */
export const XP_PER_LEVEL = 1000;

export interface XpProgress {
  xp: number;
  required: number | null;
  percent: number;
  ready: boolean;
}

export function xpProgress(xp: number, level: number): XpProgress {
  const current = Math.max(0, Math.round(Number.isFinite(xp) ? xp : 0));
  if (level >= 20) {
    return { xp: current, required: null, percent: 100, ready: false };
  }
  return {
    xp: current,
    required: XP_PER_LEVEL,
    percent: Math.max(0, Math.min(100, (current / XP_PER_LEVEL) * 100)),
    ready: current >= XP_PER_LEVEL,
  };
}

/**
 * Spend one level's worth of XP. The GM can still advance a character early;
 * extra XP is preserved and a shortfall simply floors at zero.
 */
export function consumeLevelXp(xp: number): number {
  return Math.max(0, Math.round(Number.isFinite(xp) ? xp : 0) - XP_PER_LEVEL);
}
