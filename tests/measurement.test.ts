import { describe, expect, it } from "vitest";
import { measureGridDistance } from "../src/shared/measurement";

describe("PF2e grid measurement", () => {
  it("measures straight lines at five feet per square", () => {
    const measurement = measureGridDistance(4 * 70, 0, 70);
    expect(measurement).toMatchObject({ squares: 4, feet: 20, diagonals: 0, straight: 4 });
    expect(measurement.usesDiagonals).toBe(false);
  });

  it("alternates diagonal costs at 5 and 10 feet", () => {
    expect(measureGridDistance(70, 70, 70).feet).toBe(5);
    expect(measureGridDistance(2 * 70, 2 * 70, 70).feet).toBe(15);
    expect(measureGridDistance(3 * 70, 3 * 70, 70).feet).toBe(20);
    expect(measureGridDistance(4 * 70, 4 * 70, 70).feet).toBe(30);
  });

  it("adds straight steps to diagonal costs", () => {
    const measurement = measureGridDistance(3 * 70, 70, 70);
    expect(measurement).toMatchObject({ squares: 3, feet: 15, diagonals: 1, straight: 2 });
  });

  it("supports a uniform-diagonal table variant", () => {
    expect(measureGridDistance(4 * 70, 4 * 70, 70, { uniformDiagonals: true }).feet).toBe(20);
  });

  it("can continue a diagonal count from earlier movement", () => {
    // The first diagonal in the turn costs 5, the second 10, the third 5.
    expect(measureGridDistance(70, 70, 70, { diagonalStart: 1 }).feet).toBe(10);
    expect(measureGridDistance(70, 70, 70, { diagonalStart: 2 }).feet).toBe(5);
  });

  it("is symmetric and ignores direction", () => {
    expect(measureGridDistance(-3 * 70, -70, 70)).toEqual(measureGridDistance(3 * 70, 70, 70));
  });

  it("rounds a freehand ruler to the nearest square", () => {
    expect(measureGridDistance(0.4 * 70, 0, 70).squares).toBe(0);
    expect(measureGridDistance(0.6 * 70, 0, 70).squares).toBe(1);
    expect(measureGridDistance(2.4 * 70, 2.4 * 70, 70).feet).toBe(15);
  });

  it("handles an empty or invalid ruler", () => {
    expect(measureGridDistance(0, 0, 70)).toMatchObject({ squares: 0, feet: 0 });
    expect(measureGridDistance(Number.NaN, 70, 70).squares).toBe(1);
    expect(measureGridDistance(70, 0, 0).squares).toBe(70);
  });
});
