import { describe, expect, it } from "vitest";
import {
  clockIsComplete,
  clockPercent,
  normalizeClockFilled,
  normalizeClockSegments,
} from "../src/shared/clocks";

describe("campaign clocks", () => {
  it("clamps clock sizes to the supported range", () => {
    expect(normalizeClockSegments(4)).toBe(4);
    expect(normalizeClockSegments("8")).toBe(8);
    expect(normalizeClockSegments(99)).toBe(12);
    expect(normalizeClockSegments(0)).toBe(1);
    expect(normalizeClockSegments("nonsense")).toBe(4);
  });

  it("keeps filled segments inside the clock", () => {
    expect(normalizeClockFilled(3, 6)).toBe(3);
    expect(normalizeClockFilled(-2, 6)).toBe(0);
    expect(normalizeClockFilled(9, 6)).toBe(6);
    expect(normalizeClockFilled("2", 6)).toBe(2);
  });

  it("reports completion and progress", () => {
    expect(clockIsComplete(6, 6)).toBe(true);
    expect(clockIsComplete(5, 6)).toBe(false);
    expect(clockPercent(3, 6)).toBe(50);
    expect(clockPercent(6, 6)).toBe(100);
  });
});
