import { describe, expect, it } from "vitest";
import {
  PARTY_SIZE_PRESETS,
  classifyEncounter,
  combatantXp,
  creatureXp,
  encounterAwardXp,
  encounterBudget,
  encounterBudgetThresholds,
  encounterWaveSummaries,
  partyDefaults,
} from "../src/shared/encounters";
import { isXpMode, normalizeXpMode } from "../src/shared/content";

describe("PF2e encounter XP", () => {
  it("uses the official creature XP table", () => {
    expect(creatureXp(5, 5)).toBe(40);
    expect(creatureXp(4, 5)).toBe(30);
    expect(creatureXp(3, 5)).toBe(20);
    expect(creatureXp(2, 5)).toBe(15);
    expect(creatureXp(1, 5)).toBe(10);
    expect(creatureXp(6, 5)).toBe(60);
    expect(creatureXp(7, 5)).toBe(80);
    expect(creatureXp(8, 5)).toBe(120);
    expect(creatureXp(9, 5)).toBe(160);
  });

  it("clamps creatures far outside the listed range", () => {
    expect(creatureXp(1, 20)).toBe(10);
    expect(creatureXp(20, 1)).toBe(160);
  });

  it("multiplies XP by the number of creatures", () => {
    expect(combatantXp({ level: 3, count: 4 }, 5)).toBe(80);
    expect(encounterAwardXp([{ level: 5, count: 2 }, { level: 3, count: 3 }], 5)).toBe(140);
  });
});

describe("PF2e encounter budgets", () => {
  it("uses the four-character baseline", () => {
    expect(encounterBudgetThresholds(4)).toEqual({
      trivial: 40,
      low: 60,
      moderate: 80,
      severe: 120,
      extreme: 160,
    });
  });

  it("adjusts the budget for larger and smaller parties", () => {
    expect(encounterBudgetThresholds(6)).toEqual({
      trivial: 60,
      low: 100,
      moderate: 120,
      severe: 180,
      extreme: 240,
    });
    expect(encounterBudgetThresholds(2)).toEqual({
      trivial: 20,
      low: 20,
      moderate: 40,
      severe: 60,
      extreme: 80,
    });
  });

  it("classifies encounters against the adjusted budget", () => {
    expect(classifyEncounter(40, 4)).toBe("trivial");
    expect(classifyEncounter(60, 4)).toBe("low");
    expect(classifyEncounter(80, 4)).toBe("moderate");
    expect(classifyEncounter(120, 4)).toBe("severe");
    expect(classifyEncounter(160, 4)).toBe("extreme");
    expect(classifyEncounter(200, 4)).toBe("beyond");
    expect(classifyEncounter(80, 6)).toBe("low");
  });

  it("reports the award and the next threshold", () => {
    const budget = encounterBudget([{ level: 5, count: 2 }], 5, 4);
    expect(budget.awardXp).toBe(80);
    expect(budget.difficulty).toBe("moderate");
    expect(budget.nextThreshold).toBe(120);
  });

  it("shows no next threshold beyond extreme", () => {
    const budget = encounterBudget([{ level: 5, count: 5 }], 5, 4);
    expect(budget.awardXp).toBe(200);
    expect(budget.difficulty).toBe("beyond");
    expect(budget.nextThreshold).toBeNull();
  });
});

describe("encounter waves", () => {
  it("groups combatants into sorted waves and totals creatures", () => {
    expect(
      encounterWaveSummaries([
        { wave: 2, count: 3 },
        { wave: 1, count: 2 },
        { wave: 2, count: 1 },
        { wave: 1, count: 4 },
      ]),
    ).toEqual([
      { wave: 1, combatants: 2, creatures: 6 },
      { wave: 2, combatants: 2, creatures: 4 },
    ]);
  });

  it("normalizes missing or invalid wave values to wave one", () => {
    expect(
      encounterWaveSummaries([
        { wave: 0, count: 1 },
        { wave: Number.NaN, count: 0 },
      ]),
    ).toEqual([{ wave: 1, combatants: 2, creatures: 2 }]);
  });

  it("offers common party-size presets", () => {
    expect(PARTY_SIZE_PRESETS).toEqual([3, 4, 5, 6]);
  });
});

describe("party defaults", () => {
  it("averages finished characters and counts incomplete ones", () => {
    expect(partyDefaults([1, 3, 5])).toEqual({
      partyLevel: 3,
      partySize: 3,
      completed: 3,
      incomplete: 0,
    });
    expect(partyDefaults([4, null, 6])).toEqual({
      partyLevel: 5,
      partySize: 3,
      completed: 2,
      incomplete: 1,
    });
  });

  it("falls back to level 1 with no finished characters", () => {
    expect(partyDefaults([null, null])).toEqual({
      partyLevel: 1,
      partySize: 2,
      completed: 0,
      incomplete: 2,
    });
  });

  it("uses a four-character planning default for an empty campaign", () => {
    expect(partyDefaults([])).toEqual({
      partyLevel: 1,
      partySize: 4,
      completed: 0,
      incomplete: 0,
    });
  });
});

describe("campaign XP mode", () => {
  it("accepts milestone and xp only", () => {
    expect(isXpMode("milestone")).toBe(true);
    expect(isXpMode("xp")).toBe(true);
    expect(isXpMode("automatic")).toBe(false);
    expect(normalizeXpMode("xp")).toBe("xp");
    expect(normalizeXpMode("nonsense")).toBe("milestone");
  });
});
