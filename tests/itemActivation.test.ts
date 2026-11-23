import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  INVESTED_LIMIT,
  activateItemOnDraft,
  investedCount,
  itemHealingFormula,
  itemUseInfo,
  resetItemUses,
  setItemInvested,
} from "../src/shared/itemActivation";
import type { CharacterEquipment, Equipment } from "../src/shared/types";

function item(overrides: Partial<Equipment> & Record<string, unknown>): Equipment {
  return {
    id: "item:test",
    name: "Test Item",
    type: "consumable",
    level: 1,
    price: { gp: 1, sp: 0, cp: 0, cpTotal: 100 },
    bulk: 0,
    rarity: "common",
    traits: [],
    usage: "held-in-one-hand",
    description: "",
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
    ...overrides,
  } as Equipment;
}

function draftWith(equipment: CharacterEquipment[]) {
  const draft = emptyCharacterDraft("Item Test");
  draft.equipment = equipment;
  return draft;
}

describe("item activation descriptions", () => {
  it("extracts healing formulas from the PF2e prose forms", () => {
    expect(itemHealingFormula("You regain (2d8+5)[healing] Hit Points.")).toBe("2d8+5");
    expect(itemHealingFormula("restore (2d6 + 7)[vitality,healing] Hit Points")).toBe("2d6+7");
    expect(itemHealingFormula("regain 3d6 Hit Points")).toBe("3d6");
    expect(itemHealingFormula("The bomb deals 2d6 fire damage.")).toBeNull();
  });

  it("classifies consumables, wands, per-day items, staves, and plain gear", () => {
    const potion = item({
      name: "Healing Potion (Lesser)",
      traits: ["consumable", "healing", "potion"],
      consumable: { category: "potion", uses: 1, duration: "" },
      description: "You regain (2d8+5)[healing] Hit Points.",
    });
    expect(itemUseInfo(potion)).toMatchObject({
      kind: "consumable",
      label: "Use",
      healingFormula: "2d8+5",
    });

    const wand = item({
      name: "Wand of Heal (1st)",
      type: "equipment",
      traits: ["magical", "wand"],
      description:
        "<p><strong>Activate</strong> Cast a Spell</p><p><strong>Frequency</strong> once per day</p>",
    });
    expect(itemUseInfo(wand)).toMatchObject({
      kind: "charged",
      label: "Activate",
      usesMax: 1,
      frequency: "once per day",
    });

    const genericWand = item({
      name: "Magic Wand (1st-Rank Spell)",
      type: "consumable",
      traits: ["magical", "wand"],
      consumable: { category: "wand", uses: 1, duration: "" },
      description:
        "<p><strong>Activate</strong> Cast a Spell</p><p><strong>Frequency</strong> once per day</p>",
    });
    expect(itemUseInfo(genericWand)).toMatchObject({
      kind: "charged",
      usesMax: 1,
      frequency: "once per day",
    });

    const gloves = item({
      name: "Healer's Gloves",
      type: "equipment",
      traits: ["invested", "magical"],
      description:
        "<p><strong>Activate—Healer's Touch</strong> A (manipulate)</p><p><strong>Frequency</strong> once per day</p><p>restore (2d6+7)[vitality,healing] Hit Points.</p>",
    });
    expect(itemUseInfo(gloves)).toMatchObject({
      kind: "charged",
      usesMax: 1,
      healingFormula: "2d6+7",
    });

    const staff = item({
      name: "Staff of Healing",
      type: "equipment",
      traits: ["magical", "staff"],
      description:
        "<p><strong>Activate</strong> Cast a Spell</p><p>You expend charges from the staff.</p>",
    });
    expect(itemUseInfo(staff)).toMatchObject({ kind: "activate", usesMax: 0 });

    expect(
      itemUseInfo(item({ name: "Rope", type: "equipment", description: "50 feet." }))
    ).toBeNull();
  });
});

describe("using and activating items", () => {
  it("spends one consumable from a stack and returns its healing formula", () => {
    const potion = item({
      name: "Healing Potion",
      traits: ["consumable", "healing"],
      description: "You regain (2d8+5)[healing] Hit Points.",
    });
    const draft = draftWith([{ itemId: potion.id, quantity: 2, equipped: false }]);
    const result = activateItemOnDraft(draft, potion.id, potion);
    expect(result.blocked).toBeNull();
    expect(result.consumed).toBe(true);
    expect(result.healingFormula).toBe("2d8+5");
    expect(result.draft.equipment[0].quantity).toBe(1);

    const last = activateItemOnDraft(result.draft, potion.id, potion);
    expect(last.draft.equipment).toHaveLength(0);
  });

  it("tracks one daily charge on a wand and blocks a second use", () => {
    const wand = item({
      name: "Wand of Heal",
      type: "equipment",
      traits: ["magical", "wand"],
      description:
        "<p><strong>Activate</strong> Cast a Spell</p><p><strong>Frequency</strong> once per day</p>",
    });
    const draft = draftWith([{ itemId: wand.id, quantity: 1, equipped: true }]);
    const first = activateItemOnDraft(draft, wand.id, wand);
    expect(first.usedCharge).toBe(true);
    expect(first.draft.equipment[0].usesUsed).toBe(1);
    expect(first.draft.equipment[0].usesMax).toBe(1);

    const second = activateItemOnDraft(first.draft, wand.id, wand);
    expect(second.blocked).toContain("no uses left");
    expect(second.draft.equipment[0].usesUsed).toBe(1);
  });

  it("surfaces free activations without consuming a charge", () => {
    const cloak = item({
      name: "Cloak of Elvenkind",
      type: "equipment",
      traits: ["invested", "magical"],
      description: "<p><strong>Activate</strong> Interact</p><p>The cloak muffles your sounds.</p>",
    });
    const draft = draftWith([{ itemId: cloak.id, quantity: 1, equipped: true }]);
    const result = activateItemOnDraft(draft, cloak.id, cloak);
    expect(result.usedCharge).toBe(false);
    expect(result.consumed).toBe(false);
    expect(result.draft.equipment[0].usesUsed ?? 0).toBe(0);
    expect(result.notes.join(" ")).toContain("Resolve its rules text");
  });

  it("resets daily uses after a rest or daily preparation", () => {
    const draft = draftWith([
      { itemId: "item:wand", quantity: 1, equipped: true, usesUsed: 1, usesMax: 1 },
      { itemId: "item:rope", quantity: 1, equipped: false },
    ]);
    const reset = resetItemUses(draft);
    expect(reset.equipment[0].usesUsed).toBe(0);
    expect(reset).not.toBe(draft);
  });
});

describe("invested items", () => {
  it("counts invested entries and enforces the ten-item limit", () => {
    const equipment: CharacterEquipment[] = [];
    for (let index = 0; index < INVESTED_LIMIT; index += 1) {
      equipment.push({
        itemId: `item:invested-${index}`,
        quantity: 1,
        equipped: true,
        invested: true,
      });
    }
    equipment.push({ itemId: "item:extra", quantity: 1, equipped: true });
    const draft = draftWith(equipment);
    expect(investedCount(draft)).toBe(INVESTED_LIMIT);
    const blocked = setItemInvested(draft, "item:extra", true);
    expect(blocked.blocked).toContain("at most");
    expect(blocked.draft).toBe(draft);
  });

  it("invests and uninvests an item below the limit", () => {
    const draft = draftWith([{ itemId: "item:ring", quantity: 1, equipped: true }]);
    const invested = setItemInvested(draft, "item:ring", true);
    expect(invested.blocked).toBeNull();
    expect(invested.draft.equipment[0].invested).toBe(true);
    const removed = setItemInvested(invested.draft, "item:ring", false);
    expect(removed.draft.equipment[0].invested).toBe(false);
  });
});
