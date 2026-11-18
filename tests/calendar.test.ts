import { describe, expect, it } from "vitest";
import {
  daysInGolarionMonth,
  formatGolarionDate,
  isGolarionLeapYear,
  normalizeGolarionDate,
  shiftGolarionDate,
} from "../src/shared/calendar";

describe("Golarion calendar", () => {
  it("uses the Absalom Reckoning month lengths and leap day", () => {
    expect(daysInGolarionMonth(4726, 1)).toBe(31);
    expect(daysInGolarionMonth(4726, 2)).toBe(28);
    expect(daysInGolarionMonth(4724, 2)).toBe(29);
    expect(daysInGolarionMonth(4728, 2)).toBe(29);
    expect(isGolarionLeapYear(4728)).toBe(true);
    expect(isGolarionLeapYear(4727)).toBe(false);
  });

  it("rolls days across months, years, and leap day", () => {
    expect(shiftGolarionDate({ year: 4726, month: 2, day: 28 }, 1)).toEqual({
      year: 4726,
      month: 3,
      day: 1,
    });
    expect(shiftGolarionDate({ year: 4728, month: 2, day: 28 }, 1)).toEqual({
      year: 4728,
      month: 2,
      day: 29,
    });
    expect(shiftGolarionDate({ year: 4728, month: 2, day: 29 }, 1)).toEqual({
      year: 4728,
      month: 3,
      day: 1,
    });
    expect(shiftGolarionDate({ year: 4726, month: 12, day: 31 }, 1)).toEqual({
      year: 4727,
      month: 1,
      day: 1,
    });
    expect(shiftGolarionDate({ year: 4726, month: 1, day: 1 }, 31)).toEqual({
      year: 4726,
      month: 2,
      day: 1,
    });
    expect(shiftGolarionDate({ year: 4726, month: 1, day: 31 }, 31)).toEqual({
      year: 4726,
      month: 3,
      day: 3,
    });
  });

  it("moves backward across month and year boundaries", () => {
    expect(shiftGolarionDate({ year: 4726, month: 1, day: 1 }, -1)).toEqual({
      year: 4725,
      month: 12,
      day: 31,
    });
    expect(shiftGolarionDate({ year: 4728, month: 3, day: 1 }, -1)).toEqual({
      year: 4728,
      month: 2,
      day: 29,
    });
  });

  it("normalizes invalid dates and formats them", () => {
    expect(normalizeGolarionDate({ year: 4726, month: 2, day: 31 })).toEqual({
      year: 4726,
      month: 2,
      day: 28,
    });
    expect(normalizeGolarionDate(undefined)).toEqual({ year: 4726, month: 1, day: 1 });
    expect(formatGolarionDate({ year: 4726, month: 1, day: 1 })).toBe("1 Abadius, 4726 AR");
    expect(formatGolarionDate({ year: 4726, month: 12, day: 31 })).toBe("31 Kuthona, 4726 AR");
  });
});
