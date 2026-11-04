import { describe, expect, it } from "vitest";
import {
  applyLootToDraft,
  lootCopper,
  lootIsEmpty,
  lootItemCount,
  normalizeLootItems,
} from "../src/shared/loot";
import { emptyCharacterDraft } from "../src/shared/rules";
import type { LootParcel } from "../src/shared/types";

function parcel(overrides: Partial<LootParcel> = {}): LootParcel {
  return {
    id: "loot_test",
    campaignId: "camp_test",
    name: "Test parcel",
    description: "",
    items: [],
    gp: 0,
    sp: 0,
    cp: 0,
    status: "open",
    distributedTo: null,
    distributedToName: null,
    distributedAt: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("loot normalization", () => {
  it("rejects malformed rows and deduplicates by item id", () => {
    const items = normalizeLootItems([
      { itemId: "item:a", name: "Longsword", quantity: 1 },
      { itemId: "item:a", name: "Longsword", quantity: 2 },
      { itemId: "", name: "Bad", quantity: 1 },
      null,
      { itemId: "item:b", quantity: "3" },
    ]);
    expect(items).toEqual([
      { itemId: "item:a", name: "Longsword", quantity: 3 },
      { itemId: "item:b", name: "item:b", quantity: 3 },
    ]);
  });

  it("clamps quantities into a legal range", () => {
    expect(normalizeLootItems([{ itemId: "item:a", quantity: 0 }])[0].quantity).toBe(1);
    expect(normalizeLootItems([{ itemId: "item:a", quantity: 50_000 }])[0].quantity).toBe(9999);
  });
});

describe("loot totals", () => {
  it("converts coins to copper and counts item quantities", () => {
    const value = parcel({
      gp: 2,
      sp: 3,
      cp: 4,
      items: [{ itemId: "item:a", name: "Potion", quantity: 2 }],
    });
    expect(lootCopper(value)).toBe(234);
    expect(lootItemCount(value)).toBe(2);
    expect(lootIsEmpty(value)).toBe(false);
    expect(lootIsEmpty(parcel())).toBe(true);
  });
});

describe("applying loot to a character", () => {
  it("merges equipment and adds coins without mutating the original draft", () => {
    const draft = emptyCharacterDraft("Loot Test");
    const value = parcel({
      gp: 1,
      sp: 2,
      cp: 3,
      items: [
        { itemId: "item:sword", name: "Longsword", quantity: 1 },
        { itemId: "item:potion", name: "Potion", quantity: 2 },
      ],
    });
    const updated = applyLootToDraft(draft, value, new Set(["item:sword"]));
    expect(updated.equipment).toHaveLength(2);
    expect(updated.equipment[0]).toMatchObject({ itemId: "item:sword", quantity: 1, equipped: true });
    expect(updated.equipment[1]).toMatchObject({ itemId: "item:potion", quantity: 2, equipped: false });
    expect(updated.currency).toEqual({ gp: 1, sp: 2, cp: 3 });
    expect(draft.equipment).toHaveLength(0);
    expect(draft.currency).toEqual({ gp: 0, sp: 0, cp: 0 });
  });

  it("increments existing stacks instead of duplicating item ids", () => {
    const draft = emptyCharacterDraft("Loot Test");
    draft.equipment.push({ itemId: "item:potion", quantity: 1, equipped: false });
    const value = parcel({
      items: [{ itemId: "item:potion", name: "Potion", quantity: 3 }],
    });
    const updated = applyLootToDraft(draft, value);
    expect(updated.equipment).toEqual([{ itemId: "item:potion", quantity: 4, equipped: false }]);
  });
});
