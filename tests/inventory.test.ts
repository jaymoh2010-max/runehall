import { describe, expect, it } from "vitest";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";
import {
  addCurrency,
  addItemToDraft,
  currencyToCp,
  customItemToEquipment,
  removeItemQuantity,
  spendCurrency,
  splitCurrencyEvenly,
} from "../src/shared/inventory";
import type { CharacterEquipment } from "../src/shared/types";

function draftWith(equipment: CharacterEquipment[], currency = { gp: 0, sp: 0, cp: 0 }) {
  return { ...emptyCharacterDraft("Ledger Test"), equipment, currency };
}

describe("character inventory", () => {
  it("splits a stack without moving its runes", () => {
    const source = draftWith([
      { itemId: "longsword", quantity: 3, equipped: true, runes: ["rune_striking"] },
    ]);
    const result = removeItemQuantity(source, "longsword", 1);
    expect(result.moved).toEqual({
      itemId: "longsword",
      quantity: 1,
      equipped: false,
      invested: false,
      runes: [],
    });
    expect(result.draft.equipment).toEqual([
      { itemId: "longsword", quantity: 2, equipped: true, runes: ["rune_striking"] },
    ]);
  });

  it("moves runes when the whole stack leaves", () => {
    const source = draftWith([
      { itemId: "longsword", quantity: 1, equipped: true, runes: ["rune_striking"] },
    ]);
    const result = removeItemQuantity(source, "longsword", 1);
    expect(result.moved?.runes).toEqual(["rune_striking"]);
    expect(result.draft.equipment).toEqual([]);
  });

  it("merges transferred items into an existing stack without equipping them", () => {
    const target = draftWith([{ itemId: "potion", quantity: 1, equipped: false }]);
    const next = addItemToDraft(target, {
      itemId: "potion",
      quantity: 2,
      equipped: true,
      runes: ["rune_a"],
    });
    expect(next.equipment).toEqual([
      { itemId: "potion", quantity: 3, equipped: false, runes: ["rune_a"] },
    ]);
  });

  it("adds new stacks unequipped", () => {
    const target = draftWith([]);
    const next = addItemToDraft(target, {
      itemId: "shield",
      quantity: 2,
      equipped: true,
      runes: ["rune_a"],
    });
    expect(next.equipment).toEqual([
      { itemId: "shield", quantity: 2, equipped: false, invested: false, runes: ["rune_a"] },
    ]);
  });
});

describe("character currency", () => {
  it("converts between coin denominations", () => {
    expect(currencyToCp({ gp: 2, sp: 3, cp: 4 })).toBe(234);
    expect(spendCurrency({ gp: 2, sp: 3, cp: 4 }, 100)).toEqual({ gp: 1, sp: 3, cp: 4 });
    expect(addCurrency({ gp: 0, sp: 9, cp: 9 }, 1)).toEqual({ gp: 1, sp: 0, cp: 0 });
  });

  it("refuses to spend more than the purse holds", () => {
    expect(spendCurrency({ gp: 0, sp: 1, cp: 0 }, 11)).toBeNull();
    expect(spendCurrency({ gp: 0, sp: 1, cp: 0 }, 10)).toEqual({ gp: 0, sp: 0, cp: 0 });
  });

  it("splits party awards without losing or creating copper", () => {
    expect(splitCurrencyEvenly(1000, 4)).toEqual([250, 250, 250, 250]);
    expect(splitCurrencyEvenly(1001, 4)).toEqual([251, 250, 250, 250]);
    expect(splitCurrencyEvenly(2, 4)).toEqual([1, 1, 0, 0]);
    expect(splitCurrencyEvenly(1000, 4).reduce((sum, part) => sum + part, 0)).toBe(1000);
  });

  it("represents custom inventory items as harmless equipment entries", () => {
    const item = customItemToEquipment({
      id: "custom:keepsake",
      name: "Family keepsake",
      description: "A brass compass with a scratched lid.",
    });
    expect(item).toMatchObject({
      id: "custom:keepsake",
      name: "Family keepsake",
      type: "custom",
      level: 0,
      price: { cpTotal: 0 },
      bulk: 0,
      description: "A brass compass with a scratched lid.",
    });
  });

  it("keeps only valid, unique custom item definitions", () => {
    const draft = normalizeCharacterDraft(
      {
        customItems: [
          { id: "custom:compass", name: "Compass", description: "Brass and glass." },
          { id: "feat:not-custom", name: "Impostor", description: "" },
          { id: "custom:compass", name: "Duplicate", description: "" },
          { id: "custom:blank", name: "   ", description: "No name" },
        ],
      },
      "Custom Items"
    );
    expect(draft.customItems).toEqual([
      { id: "custom:compass", name: "Compass", description: "Brass and glass." },
    ]);
  });
});
