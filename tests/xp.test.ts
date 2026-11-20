import { describe, expect, it } from "vitest";
import {
  ACCOMPLISHMENT_XP,
  consumeLevelXp,
  hazardXp,
  isAccomplishmentTier,
  normalizeAdvancementSpeed,
  normalizeXpAwardKind,
  XP_AWARD_KINDS,
  XP_PER_LEVEL,
  xpPerLevel,
  xpProgress,
} from "../src/shared/xp";

describe("PF2e XP advancement", () => {
  it("uses 1,000 XP per level at medium speed", () => {
    expect(XP_PER_LEVEL).toBe(1000);
    expect(xpPerLevel("medium")).toBe(1000);
  });

  it("supports fast and slow advancement speeds", () => {
    expect(xpPerLevel("fast")).toBe(800);
    expect(xpPerLevel("slow")).toBe(1200);
    expect(xpProgress(800, 1, "fast")).toMatchObject({ required: 800, ready: true });
    expect(xpProgress(800, 1, "slow")).toMatchObject({ required: 1200, ready: false });
    expect(consumeLevelXp(1000, "fast")).toBe(200);
    expect(consumeLevelXp(1250, "slow")).toBe(50);
    expect(normalizeAdvancementSpeed("fast")).toBe("fast");
    expect(normalizeAdvancementSpeed("slow")).toBe("slow");
    expect(normalizeAdvancementSpeed("nonsense")).toBe("medium");
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

describe("PF2e XP awards", () => {
  it("uses the level-difference table for complex hazards", () => {
    expect(hazardXp(10, 10)).toBe(40);
    expect(hazardXp(11, 10)).toBe(60);
    expect(hazardXp(12, 10)).toBe(80);
    expect(hazardXp(14, 10)).toBe(160);
  });

  it("makes simple hazards worth one fifth", () => {
    expect(hazardXp(10, 10, "simple")).toBe(8);
    expect(hazardXp(11, 10, "simple")).toBe(12);
    expect(hazardXp(6, 10, "simple")).toBe(2);
  });

  it("awards nothing for hazards far below the party", () => {
    expect(hazardXp(5, 10)).toBe(0);
    expect(hazardXp(5, 10, "simple")).toBe(0);
  });

  it("uses the official accomplishment tiers", () => {
    expect(ACCOMPLISHMENT_XP).toEqual({ minor: 10, moderate: 30, major: 80 });
    expect(isAccomplishmentTier("major")).toBe(true);
    expect(isAccomplishmentTier("exceptional")).toBe(false);
  });

  it("normalizes ledger award kinds", () => {
    expect(XP_AWARD_KINDS).toContain("hazard");
    expect(normalizeXpAwardKind("quest")).toBe("quest");
    expect(normalizeXpAwardKind("bogus")).toBe("other");
  });
});
