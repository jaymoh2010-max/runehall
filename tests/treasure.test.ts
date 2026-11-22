import { describe, expect, it } from "vitest";
import { replacementWealthGrantCp, startingWealthCp } from "../src/shared/rules";
import {
  countTreasureItemKinds,
  lootItemsValueCp,
  lootParcelValueCp,
  treasureBudgetGp,
  treasureItemKind,
  treasureItemMix,
  treasureItemTargets,
  TREASURE_CURRENCY_GP,
  TREASURE_TOTAL_GP,
} from "../src/shared/treasure";
import type { LootParcel } from "../src/shared/types";

const prices = new Map([
  ["item:sword", 1_500],
  ["item:potion", 400],
]);

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

  it("values items and coins together", () => {
    expect(
      lootItemsValueCp(
        [
          { itemId: "item:sword", name: "Sword", quantity: 2 },
          { itemId: "item:potion", name: "Potion", quantity: 3 },
        ],
        prices
      )
    ).toBe(4_200);
  });

  it("values a loot parcel using compendium prices", () => {
    const parcel = {
      items: [{ itemId: "item:sword", name: "Sword", quantity: 2 }],
      gp: 40,
      sp: 5,
      cp: 0,
    } satisfies Pick<LootParcel, "items" | "gp" | "sp" | "cp">;
    expect(lootParcelValueCp(parcel, prices)).toBe(7_050);
  });
});

describe("GM Core table 10-9 item mix", () => {
  const facts = new Map([
    ["item:sword", { level: 11, type: "weapon" }],
    ["item:armor", { level: 10, type: "armor" }],
    ["item:potion", { level: 11, type: "consumable", consumable: { category: "potion" } }],
    ["item:ammo", { level: 9, type: "ammo" }],
    ["item:gem", { level: 0, type: "treasure" }],
  ]);
  const prices = new Map([
    ["item:sword", 1_000],
    ["item:armor", 500],
    ["item:potion", 100],
    ["item:ammo", 20],
    ["item:gem", 50],
  ]);

  it("classifies permanent gear, consumables, and other treasure", () => {
    expect(treasureItemKind({ level: 1, type: "weapon" })).toBe("permanent");
    expect(treasureItemKind({ level: 1, type: "equipment" })).toBe("permanent");
    expect(treasureItemKind({ level: 1, type: "consumable" })).toBe("consumable");
    expect(treasureItemKind({ level: 1, type: "ammo" })).toBe("consumable");
    expect(treasureItemKind({ level: 1, type: "equipment", consumable: { category: "oil" } })).toBe(
      "consumable"
    );
    expect(treasureItemKind({ level: 5, type: "equipment", traits: ["wand"] })).toBe("consumable");
    expect(treasureItemKind({ level: 1, type: "weapon", traits: ["consumable"] })).toBe(
      "consumable"
    );
    expect(treasureItemKind({ level: 0, type: "treasure" })).toBe("other");
    expect(treasureItemKind(null)).toBe("other");
  });

  it("uses the table's item levels, including the level 1 and 20 rows", () => {
    expect(treasureItemTargets(1)).toEqual([
      { level: 2, permanent: 0, permanentTarget: 2, consumable: 0, consumableTarget: 2 },
      { level: 1, permanent: 0, permanentTarget: 2, consumable: 0, consumableTarget: 3 },
    ]);
    expect(treasureItemTargets(10)).toEqual([
      { level: 11, permanent: 0, permanentTarget: 2, consumable: 0, consumableTarget: 2 },
      { level: 10, permanent: 0, permanentTarget: 2, consumable: 0, consumableTarget: 2 },
      { level: 9, permanent: 0, permanentTarget: 0, consumable: 0, consumableTarget: 2 },
    ]);
    expect(treasureItemTargets(19)[0]).toMatchObject({
      level: 20,
      permanentTarget: 2,
      consumableTarget: 2,
    });
    expect(treasureItemTargets(20)).toEqual([
      { level: 20, permanent: 0, permanentTarget: 4, consumable: 0, consumableTarget: 4 },
      { level: 19, permanent: 0, permanentTarget: 0, consumable: 0, consumableTarget: 2 },
    ]);
  });

  it("counts copies by kind and compares them with the level bands", () => {
    const mix = treasureItemMix(
      10,
      [
        { itemId: "item:sword", quantity: 1 },
        { itemId: "item:armor", quantity: 1 },
        { itemId: "item:potion", quantity: 2 },
        { itemId: "item:ammo", quantity: 1 },
        { itemId: "item:gem", quantity: 3 },
      ],
      facts,
      prices
    );
    expect(mix.permanent).toBe(2);
    expect(mix.consumable).toBe(3);
    expect(mix.other).toBe(3);
    expect(mix.permanentValueCp).toBe(1_500);
    expect(mix.consumableValueCp).toBe(220);
    expect(mix.otherValueCp).toBe(150);
    expect(mix.levels.map((row) => [row.level, row.permanent, row.consumable])).toEqual([
      [11, 1, 2],
      [10, 1, 0],
      [9, 0, 1],
    ]);
    expect(mix.warnings.join(" ")).toContain("level 11 permanent 1/2");
    expect(mix.warnings.join(" ")).toContain("level 10 permanent 1/2");
    expect(mix.warnings.join(" ")).toContain("level 9 consumable 1/2");
  });

  it("flags items outside the bands and ids missing from the compendium", () => {
    const mix = treasureItemMix(
      5,
      [
        { itemId: "item:legendary", quantity: 1 },
        { itemId: "item:unknown", quantity: 2 },
      ],
      new Map([["item:legendary", { level: 15, type: "weapon" }]])
    );
    expect(mix.permanent).toBe(1);
    expect(mix.other).toBe(2);
    expect(mix.warnings.join(" ")).toContain("1 item falls outside");
    expect(mix.warnings.join(" ")).toContain("2 items could not be matched");
  });

  it("counts parcel contents for the loot list badges", () => {
    expect(
      countTreasureItemKinds(
        [
          { itemId: "item:sword", quantity: 2 },
          { itemId: "item:potion", quantity: 1 },
          { itemId: "item:gem", quantity: 4 },
          { itemId: "item:unknown", quantity: 1 },
        ],
        facts
      )
    ).toEqual({ permanent: 2, consumable: 1, other: 5 });
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
