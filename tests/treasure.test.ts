import { describe, expect, it } from "vitest";
import { replacementWealthGrantCp, startingWealthCp } from "../src/shared/rules";
import { treasureBudgetGp, TREASURE_CURRENCY_GP, TREASURE_TOTAL_GP } from "../src/shared/treasure";

describe("GM Core treasure by level", () => {
  it("encodes the party budget and coin columns", () => {
    expect(TREASURE_TOTAL_GP).toHaveLength(20);
    expect(TREASURE_CURRENCY_GP).toHaveLength(20);
    expect(treasureBudgetGp(1)).toEqual({ level: 1, totalGp: 175, currencyGp: 40 });
    expect(treasureBudgetGp(10)).toEqual({ level: 10, totalGp: 8_000, currencyGp: 2_000 });
    expect(treasureBudgetGp(14)).toEqual({ level: 14, totalGp: 36_500, currencyGp: 9_000 });
    expect(treasureBudgetGp(20)).toEqual({ level: 20, totalGp: 490_000, currencyGp: 140_000 });
  });

  it("clamps invalid levels", () => {
    expect(treasureBudgetGp(0).level).toBe(1);
    expect(treasureBudgetGp(99).level).toBe(20);
  });

  it("scales the budget for larger parties", () => {
    expect(treasureBudgetGp(1, 5).totalGp).toBe(219);
    expect(treasureBudgetGp(1, 6).totalGp).toBe(263);
  });
});

describe("GM Core table 10-10 new-character wealth", () => {
  it("uses the remastered lump-sum values", () => {
    expect(startingWealthCp(1)).toBe(1_500);
    expect(startingWealthCp(2)).toBe(3_000);
    expect(startingWealthCp(6)).toBe(45_000);
    expect(startingWealthCp(10)).toBe(230_000);
    expect(startingWealthCp(13)).toBe(640_000);
    expect(startingWealthCp(20)).toBe(11_200_000);
  });

  it("grants only the difference to the level benchmark", () => {
    expect(replacementWealthGrantCp(10, 1_000)).toBe(229_000);
    expect(replacementWealthGrantCp(10, 230_000)).toBe(0);
    expect(replacementWealthGrantCp(10, 500_000)).toBe(0);
  });
});
