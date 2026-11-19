import { describe, expect, it } from "vitest";
import {
  conditionBaseName,
  conditionNumericValue,
  conditionsFromSheet,
  groupHp,
  normalizeTokenConditions,
  parseConditionEntry,
  sheetConditionsFromToken,
  syncLifeConditions,
  tickTokenConditions,
  tokenConditionLabel,
} from "../src/shared/tokens";

describe("token group HP", () => {
  it("sums current and maximum HP across members", () => {
    expect(
      groupHp([
        { hpCurrent: 4, hpMax: 6 },
        { hpCurrent: 2, hpMax: 6 },
        { hpCurrent: null, hpMax: 10 },
      ])
    ).toEqual({ count: 3, current: 16, max: 22, percent: (16 / 22) * 100 });
  });

  it("ignores members without HP but still counts them", () => {
    expect(
      groupHp([
        { hpCurrent: 5, hpMax: 10 },
        { hpCurrent: 3, hpMax: null },
      ])
    ).toEqual({
      count: 2,
      current: 5,
      max: 10,
      percent: 50,
    });
  });

  it("returns a null percentage when no member has HP", () => {
    expect(groupHp([{ hpCurrent: null, hpMax: null }])).toEqual({
      count: 1,
      current: 0,
      max: 0,
      percent: null,
    });
  });

  it("clamps members above or below their maximum", () => {
    expect(
      groupHp([
        { hpCurrent: 20, hpMax: 10 },
        { hpCurrent: -5, hpMax: 10 },
      ])
    ).toEqual({
      count: 2,
      current: 10,
      max: 20,
      percent: 50,
    });
  });
});

describe("token conditions", () => {
  it("normalizes legacy string conditions and structured values", () => {
    expect(
      normalizeTokenConditions(["Frightened", { name: "Clumsy", value: 2, duration: 3 }, null])
    ).toEqual([
      { name: "Frightened", value: null, duration: null },
      { name: "Clumsy", value: 2, duration: 3 },
    ]);
  });

  it("formats condition values and durations", () => {
    expect(tokenConditionLabel({ name: "Frightened", value: 2, duration: 3 })).toBe(
      "Frightened 2 (3r)"
    );
    expect(tokenConditionLabel({ name: "Prone" })).toBe("Prone");
    expect(tokenConditionLabel({ name: "Clumsy", value: 0, duration: null })).toBe("Clumsy");
  });

  it("ticks timed conditions and removes expired ones", () => {
    expect(
      tickTokenConditions([
        { name: "Clumsy", duration: 2 },
        { name: "Drained", duration: 1 },
        { name: "Prone", duration: null },
        { name: "Frightened", value: 2, duration: 0 },
      ])
    ).toEqual([
      { name: "Clumsy", duration: 1 },
      { name: "Prone", duration: null },
    ]);
  });

  it("reduces frightened by one at the end of the turn and removes it at 0", () => {
    expect(tickTokenConditions([{ name: "Frightened", value: 2, duration: null }])).toEqual([
      { name: "Frightened", value: 1, duration: null },
    ]);
    expect(tickTokenConditions([{ name: "Frightened", value: 1, duration: null }])).toEqual([]);
  });
});

describe("condition input parsing", () => {
  it("lifts a trailing number into the value and normalizes the name", () => {
    expect(parseConditionEntry({ name: "Frightened 2" })).toEqual({
      name: "Frightened",
      value: 2,
      duration: null,
    });
    expect(parseConditionEntry({ name: " Clumsy ", value: 1, duration: 3 })).toEqual({
      name: "Clumsy",
      value: 1,
      duration: 3,
    });
  });

  it("matches legacy trailing-value names during lifecycle updates", () => {
    expect(conditionBaseName("Drained 2")).toBe("drained");
    expect(conditionNumericValue({ name: "Drained 2" })).toBe(2);
    expect(conditionNumericValue({ name: "Drained", value: 3 })).toBe(3);
    expect(
      tickTokenConditions([
        { name: "Frightened 2", value: null, duration: null },
        { name: "Clumsy 1", value: null, duration: 1 },
        { name: "Prone", value: null, duration: null },
      ])
    ).toEqual([
      { name: "Frightened", value: 1, duration: null },
      { name: "Prone", value: null, duration: null },
    ]);
  });
});

describe("sheet and token condition sharing", () => {
  it("round-trips values, durations, and legacy strings", () => {
    const sheet = [
      { name: "Frightened", value: 2, duration: 3 },
      { name: "Prone", value: null, duration: null },
    ];
    const token = conditionsFromSheet(sheet);
    expect(token).toEqual(sheet);
    expect(sheetConditionsFromToken(token)).toEqual(sheet);
    expect(conditionsFromSheet([{ name: " Clumsy ", value: 1 }])).toEqual([
      { name: "Clumsy", value: 1, duration: null },
    ]);
  });
});

describe("life condition sync", () => {
  it("mirrors dying and unconscious without dropping table conditions", () => {
    expect(
      syncLifeConditions(
        [
          { name: "Frightened", value: 1, duration: 2 },
          { name: "Dying", value: 3, duration: null },
        ],
        [
          { name: "Frightened", value: 1, duration: null },
          { name: "Dying", value: 2, duration: null },
          { name: "Unconscious", value: null, duration: null },
        ]
      )
    ).toEqual([
      { name: "Frightened", value: 1, duration: 2 },
      { name: "Dying", value: 2, duration: null },
      { name: "Unconscious", value: null, duration: null },
    ]);
  });
});
