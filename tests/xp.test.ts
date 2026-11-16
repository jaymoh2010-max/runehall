import { describe, expect, it } from "vitest";
import { consumeLevelXp, XP_PER_LEVEL, xpProgress } from "../src/shared/xp";

describe("PF2e XP advancement", () => {
  it("uses 1,000 XP per level", () => {
    expect(XP_PER_LEVEL).toBe(1000);
  });

  it("reports progress toward the next level", () => {
    expect(xpProgress(0, 1)).toMatchObject({ required: 1000, percent: 0, ready: false });
    expect(xpProgress(450, 3)).toMatchObject({ required: 1000, percent: 45, ready: false });
    expect(xpProgress(1000, 4)).toMatchObject({ required: 1000, percent: 100, ready: true });
  });

  it("shows no next level at level 20", () => {
    expect(xpProgress(500, 20)).toMatchObject({ required: null, percent: 100, ready: false });
  });

  it("consumes one level of XP and preserves the excess", () => {
    expect(consumeLevelXp(1250)).toBe(250);
    expect(consumeLevelXp(1000)).toBe(0);
  });

  it("allows a GM to advance early without negative XP", () => {
    expect(consumeLevelXp(200)).toBe(0);
    expect(consumeLevelXp(0)).toBe(0);
  });

  it("sanitizes invalid values", () => {
    expect(xpProgress(-50, 1).xp).toBe(0);
    expect(xpProgress(Number.NaN, 1).xp).toBe(0);
    expect(consumeLevelXp(Number.NaN)).toBe(0);
  });
});
