import { describe, expect, it } from "vitest";
import { getDegreeOfSuccess, rollFormula, validateFormula } from "../src/shared/dice";

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("dice engine", () => {
  it("rolls dice and adds constants", () => {
    const result = rollFormula("2d6+3", { rng: sequence([0, 0.5]) });
    expect(result.total).toBe(1 + 4 + 3);
    expect(result.terms[0].results).toEqual([1, 4]);
    expect(result.breakdown).toContain("2d6");
  });

  it("supports parentheses and multiplication", () => {
    const result = rollFormula("2*(1d8+2)", { rng: () => 0.5 });
    expect(result.total).toBe(2 * (5 + 2));
  });

  it("keeps the highest die and uses it for natural 20 checks", () => {
    const result = rollFormula("2d20kh1", {
      rng: sequence([0.1, 0.99]),
      dc: 15,
    });
    expect(result.d20).toBe(20);
    expect(result.total).toBe(20);
    expect(result.degree).toBe("critical-success");
  });

  it("supports the lowest-die notation for misfortune", () => {
    const result = rollFormula("2d20kl1", { rng: sequence([0.9, 0.05]) });
    expect(result.d20).toBe(2);
    expect(result.total).toBe(2);
  });

  it("applies PF2e degrees with natural 20 and natural 1 adjustments", () => {
    expect(getDegreeOfSuccess(20, 15, 20)).toBe("critical-success");
    expect(getDegreeOfSuccess(15, 15, 15)).toBe("success");
    expect(getDegreeOfSuccess(14, 15, 14)).toBe("failure");
    expect(getDegreeOfSuccess(1, 15, 1)).toBe("critical-failure");
    expect(getDegreeOfSuccess(25, 15, 10)).toBe("critical-success");
    expect(getDegreeOfSuccess(4, 15, 10)).toBe("critical-failure");
  });

  it("rejects malformed formulas", () => {
    expect(validateFormula("1d20+").ok).toBe(false);
    expect(validateFormula("hello").ok).toBe(false);
    expect(() => rollFormula("1d20+")).toThrow();
  });
});
