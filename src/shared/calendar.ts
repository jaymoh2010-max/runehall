export interface GolarionDate {
  year: number;
  month: number;
  day: number;
}

export const GOLARION_MONTHS = [
  "Abadius",
  "Calistril",
  "Pharast",
  "Gozran",
  "Desnus",
  "Sarenith",
  "Erastus",
  "Arodus",
  "Rova",
  "Lamashan",
  "Neth",
  "Kuthona",
] as const;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const DEFAULT_GOLARION_DATE: GolarionDate = { year: 4726, month: 1, day: 1 };

export function isGolarionLeapYear(year: number): boolean {
  return Math.max(1, Math.round(year)) % 4 === 0;
}

export function daysInGolarionMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2 && isGolarionLeapYear(year)) return 29;
  return MONTH_DAYS[month - 1];
}

export function normalizeGolarionDate(value: unknown): GolarionDate {
  if (!value || typeof value !== "object") return { ...DEFAULT_GOLARION_DATE };
  const record = value as Record<string, unknown>;
  const year = Math.max(1, Math.min(9999, Math.round(Number(record.year) || 1)));
  const month = Math.max(1, Math.min(12, Math.round(Number(record.month) || 1)));
  const day = Math.max(
    1,
    Math.min(daysInGolarionMonth(year, month), Math.round(Number(record.day) || 1))
  );
  return { year, month, day };
}

export function formatGolarionDate(value: unknown): string {
  const date = normalizeGolarionDate(value);
  return `${date.day} ${GOLARION_MONTHS[date.month - 1]}, ${date.year} AR`;
}

/** Moves a date forward or backward by whole days. */
export function shiftGolarionDate(value: unknown, delta: number): GolarionDate {
  const date = normalizeGolarionDate(value);
  let remaining = Math.round(Number.isFinite(delta) ? delta : 0);
  while (remaining > 0) {
    const monthDays = daysInGolarionMonth(date.year, date.month);
    if (date.day < monthDays) {
      date.day += 1;
    } else if (date.month < 12) {
      date.month += 1;
      date.day = 1;
    } else {
      date.year += 1;
      date.month = 1;
      date.day = 1;
    }
    remaining -= 1;
  }
  while (remaining < 0) {
    if (date.day > 1) {
      date.day -= 1;
    } else if (date.month > 1) {
      date.month -= 1;
      date.day = daysInGolarionMonth(date.year, date.month);
    } else if (date.year > 1) {
      date.year -= 1;
      date.month = 12;
      date.day = daysInGolarionMonth(date.year, 12);
    } else {
      break;
    }
    remaining += 1;
  }
  return date;
}
