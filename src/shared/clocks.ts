export const CLOCK_SEGMENT_OPTIONS = [4, 6, 8, 10, 12] as const;

export function normalizeClockSegments(value: unknown): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 4;
  return Math.max(1, Math.min(12, number));
}

export function normalizeClockFilled(value: unknown, segments: number): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(normalizeClockSegments(segments), number));
}

export function clockIsComplete(filled: number, segments: number): boolean {
  return segments > 0 && filled >= segments;
}

export function clockPercent(filled: number, segments: number): number {
  if (segments <= 0) return 0;
  return Math.max(0, Math.min(100, (filled / segments) * 100));
}
