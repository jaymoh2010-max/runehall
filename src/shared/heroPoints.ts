export const MAX_HERO_POINTS = 3;
export const SESSION_HERO_POINTS = 1;

export function clampHeroPoints(value: unknown, fallback = SESSION_HERO_POINTS): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(MAX_HERO_POINTS, Math.floor(number)));
}

export function grantHeroPoints(
  current: number,
  amount: number
): { value: number; gained: number; capped: number } {
  const before = clampHeroPoints(current);
  const requested = Math.max(0, Math.floor(Number(amount) || 0));
  const value = Math.min(MAX_HERO_POINTS, before + requested);
  return {
    value,
    gained: value - before,
    capped: Math.max(0, requested - (value - before)),
  };
}

export function resetHeroPoints(value: unknown = SESSION_HERO_POINTS): number {
  return clampHeroPoints(value);
}
