import { describe, expect, it } from "vitest";
import { conditionModifiers } from "../src/shared/conditions";
import type { CharacterCondition } from "../src/shared/types";

const condition = (name: string, value: number | null = null): CharacterCondition => ({
  name,
  value,
  duration: null,
});

describe("condition modifiers", () => {
  it("returns zeroes when no conditions are active", () => {
    const result = conditionModifiers([], { level: 5 });
    expect(result.ac).toBe(0);
    expect(result.perception).toBe(0);
    expect(result.allChecks).toBe(0);
    expect(result.maxHp).toBe(0);
    expect(result.speed).toBe(0);
    expect(result.incapacitated).toBe(false);
  });

  it("applies frightened to checks, DCs including AC, saves, and Perception", () => {
    const result = conditionModifiers([condition("Frightened", 2)], { level: 5 });
    expect(result.allChecks).toBe(-2);
    expect(result.checks.str).toBe(-2);
    expect(result.checks.wis).toBe(-2);
    expect(result.saves.fortitude).toBe(-2);
    expect(result.perception).toBe(-2);
    expect(result.ac).toBe(-2);
  });

  it("does not stack frightened and sickened status penalties", () => {
    const result = conditionModifiers([condition("Frightened", 1), condition("Sickened", 3)], {
      level: 5,
    });
    expect(result.allChecks).toBe(-3);
    expect(result.saves.reflex).toBe(-3);
  });

  it("applies clumsy to AC, Reflex, and Dexterity checks", () => {
    const result = conditionModifiers([condition("Clumsy", 2)], { level: 5 });
    expect(result.ac).toBe(-2);
    expect(result.saves.reflex).toBe(-2);
    expect(result.checks.dex).toBe(-2);
    expect(result.checks.str).toBe(0);
  });

  it("stacks a status AC penalty with the off-guard circumstance penalty", () => {
    const result = conditionModifiers([condition("Clumsy", 1), condition("Off-Guard")], {
      level: 5,
    });
    expect(result.ac).toBe(-3);
  });

  it("applies fatigued to AC and all saves", () => {
    const result = conditionModifiers([condition("Fatigued")], { level: 5 });
    expect(result.ac).toBe(-1);
    expect(result.saves.fortitude).toBe(-1);
    expect(result.saves.reflex).toBe(-1);
    expect(result.saves.will).toBe(-1);
  });

  it("reduces max HP and Fortitude for drained", () => {
    const result = conditionModifiers([condition("Drained", 2)], { level: 5 });
    expect(result.maxHp).toBe(-10);
    expect(result.saves.fortitude).toBe(-2);
    expect(result.checks.con).toBe(-2);
  });

  it("applies prone to AC and attack rolls", () => {
    const result = conditionModifiers([condition("Prone")], { level: 5 });
    expect(result.ac).toBe(-2);
    expect(result.attackCircumstance).toBe(-2);
  });

  it("applies blinded to Perception only", () => {
    const result = conditionModifiers([condition("Blinded")], { level: 5 });
    expect(result.perception).toBe(-4);
    expect(result.saves.will).toBe(0);
  });

  it("treats unconscious as AC/Reflex/Perception penalties plus incapacitation", () => {
    const result = conditionModifiers([condition("Unconscious")], { level: 5 });
    expect(result.ac).toBe(-6);
    expect(result.saves.reflex).toBe(-4);
    expect(result.perception).toBe(-4);
    expect(result.incapacitated).toBe(true);
  });

  it("treats encumbered as clumsy 1 with a Speed penalty", () => {
    const result = conditionModifiers([condition("Encumbered")], { level: 5 });
    expect(result.ac).toBe(-1);
    expect(result.checks.dex).toBe(-1);
    expect(result.speed).toBe(-10);
  });

  it("parses a trailing value from imported condition names", () => {
    const result = conditionModifiers([condition("Frightened 2")], { level: 5 });
    expect(result.allChecks).toBe(-2);
  });

  it("exposes dying, wounded, doomed, and notes", () => {
    const result = conditionModifiers(
      [condition("Dying", 2), condition("Wounded", 1), condition("Doomed", 1)],
      { level: 5 }
    );
    expect(result.dying).toBe(2);
    expect(result.wounded).toBe(1);
    expect(result.doomed).toBe(1);
    expect(result.incapacitated).toBe(true);
    expect(result.notes.some((note) => note.startsWith("Dying 2:"))).toBe(true);
    expect(result.notes.some((note) => note.startsWith("Wounded 1:"))).toBe(true);
  });
});
