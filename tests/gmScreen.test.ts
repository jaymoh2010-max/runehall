import { describe, expect, it } from "vitest";
import {
  DC_ADJUSTMENTS,
  LEVEL_DCS,
  SIMPLE_DCS,
  adjustDc,
  dcForLevel,
} from "../src/shared/gmScreen";

describe("PF2e level DCs", () => {
  it("uses the standard level-based DC table", () => {
    expect(dcForLevel(0)).toBe(14);
    expect(dcForLevel(1)).toBe(15);
    expect(dcForLevel(10)).toBe(27);
    expect(dcForLevel(20)).toBe(40);
    expect(dcForLevel(25)).toBe(50);
    expect(LEVEL_DCS).toHaveLength(26);
  });

  it("clamps levels outside the table", () => {
    expect(dcForLevel(-5)).toBe(14);
    expect(dcForLevel(99)).toBe(50);
  });
});

describe("simple DCs and adjustments", () => {
  it("exposes the five proficiency DCs", () => {
    expect(SIMPLE_DCS.map((entry) => entry.dc)).toEqual([10, 15, 20, 30, 40]);
  });

  it("applies the standard difficulty adjustments", () => {
    expect(DC_ADJUSTMENTS.map((entry) => entry.value)).toEqual([-2, 0, 2, 5, 10]);
    expect(adjustDc(20, "easy")).toBe(18);
    expect(adjustDc(20, "normal")).toBe(20);
    expect(adjustDc(20, "hard")).toBe(22);
    expect(adjustDc(20, "veryHard")).toBe(25);
    expect(adjustDc(20, "incrediblyHard")).toBe(30);
    expect(adjustDc(1, "easy")).toBe(1);
  });
});
