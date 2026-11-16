import { describe, expect, it } from "vitest";
import { applyGridMovement, emptyMovement } from "../src/shared/movement";

describe("PF2e turn movement", () => {
  it("starts with no movement or diagonal steps", () => {
    expect(emptyMovement()).toEqual({ movementUsed: 0, diagonalSteps: 0 });
  });

  it("accumulates straight movement at five feet per square", () => {
    const update = applyGridMovement(emptyMovement(), 2 * 70, 0, 70);
    expect(update).toMatchObject({ movementUsed: 10, diagonalSteps: 0, overSpeed: false });
  });

  it("carries the 5/10 diagonal count across separate moves", () => {
    const first = applyGridMovement(emptyMovement(), 2 * 70, 2 * 70, 70);
    expect(first).toMatchObject({ movementUsed: 15, diagonalSteps: 2 });

    const second = applyGridMovement(first, 70, 70, 70);
    expect(second).toMatchObject({ movementUsed: 20, diagonalSteps: 3 });

    const third = applyGridMovement(second, 70, 70, 70);
    expect(third).toMatchObject({ movementUsed: 30, diagonalSteps: 4 });
  });

  it("adds straight steps without disturbing diagonal parity", () => {
    const first = applyGridMovement(emptyMovement(), 70, 70, 70);
    const second = applyGridMovement(first, 3 * 70, 0, 70);
    const third = applyGridMovement(second, 70, 70, 70);
    expect(third).toMatchObject({ movementUsed: 30, diagonalSteps: 2 });
  });

  it("flags movement past the supplied Speed", () => {
    expect(applyGridMovement(emptyMovement(), 2 * 70, 0, 70, 5).overSpeed).toBe(true);
    expect(applyGridMovement(emptyMovement(), 2 * 70, 0, 70, 10).overSpeed).toBe(false);
    expect(applyGridMovement(emptyMovement(), 2 * 70, 0, 70, 25).overSpeed).toBe(false);
  });

  it("rounds a freehand move to the nearest grid squares", () => {
    const update = applyGridMovement(emptyMovement(), 0.4 * 70, 0, 70);
    expect(update.movementUsed).toBe(0);
  });
});
