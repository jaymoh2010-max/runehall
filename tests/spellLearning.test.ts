import { describe, expect, it } from "vitest";
import { learnSpellCostCp, learnSpellDc } from "../src/shared/spellLearning";

describe("Learn a Spell", () => {
  it("uses the rank-based check DCs", () => {
    expect(learnSpellDc(0)).toBe(15);
    expect(learnSpellDc(1)).toBe(15);
    expect(learnSpellDc(2)).toBe(18);
    expect(learnSpellDc(4)).toBe(23);
    expect(learnSpellDc(7)).toBe(31);
    expect(learnSpellDc(10)).toBe(41);
    expect(learnSpellDc(99)).toBe(41);
  });

  it("prices common, uncommon, rare, and unique spells by rank", () => {
    expect(learnSpellCostCp({ rank: 1, rarity: "common" })).toBe(100);
    expect(learnSpellCostCp({ rank: 2, rarity: "uncommon" })).toBe(400);
    expect(learnSpellCostCp({ rank: 3, rarity: "rare" })).toBe(1500);
    expect(learnSpellCostCp({ rank: 4, rarity: "unique" })).toBe(4000);
    expect(learnSpellCostCp({ rank: 0, rarity: "common" })).toBe(100);
  });
});
