import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  availableRuneItems,
  detachRuneToInventory,
  etchRuneFromInventory,
} from "../src/shared/runeLifecycle";
import type { CharacterEquipment, Equipment } from "../src/shared/types";

function rune(id: string, name: string, usage: string): Equipment {
  return {
    id,
    name,
    type: "equipment",
    level: 1,
    price: { gp: 1, sp: 0, cp: 0, cpTotal: 100 },
    bulk: 0,
    rarity: "common",
    traits: [],
    usage,
    description: "",
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
  } as Equipment;
}

const sword = {
  id: "item:sword",
  name: "Longsword",
  type: "weapon",
  level: 0,
  price: { gp: 1, sp: 0, cp: 0, cpTotal: 100 },
  bulk: 1,
  rarity: "common",
  traits: [],
  usage: "held-in-one-hand",
  description: "",
  weapon: {
    category: "martial",
    group: "sword",
    damage: { dice: 1, die: "d8", type: "slashing" },
    range: null,
    reload: null,
    hands: 1,
    bonus: 0,
  },
  source: "Test",
  license: "ORC",
  remaster: true,
  playtest: false,
} as Equipment;

const potencyOne = rune("item:potency-1", "+1 Weapon Potency", "etched-onto-a-weapon");
const potencyTwo = rune("item:potency-2", "+2 Weapon Potency", "etched-onto-a-weapon");
const flaming = rune("item:flaming", "Flaming", "etched-onto-a-weapon");
const frost = rune("item:frost", "Frost", "etched-onto-a-weapon");
const armorRune = rune("item:armor", "+1 Armor Potency", "etched-onto-armor");

const equipment: Record<string, Equipment> = {
  [sword.id]: sword,
  [potencyOne.id]: potencyOne,
  [potencyTwo.id]: potencyTwo,
  [flaming.id]: flaming,
  [frost.id]: frost,
  [armorRune.id]: armorRune,
};

function entry(itemId: string, runes: string[] = []): CharacterEquipment {
  return { itemId, quantity: 1, equipped: false, invested: false, runes };
}

function draftWith(equipmentEntries: CharacterEquipment[]) {
  const draft = emptyCharacterDraft("Rune Test");
  draft.equipment = equipmentEntries;
  return draft;
}

describe("equipment rune lifecycle", () => {
  it("lists matching rune items that are not already etched", () => {
    const draft = draftWith([
      entry(sword.id, [potencyOne.id]),
      entry(potencyOne.id),
      entry(potencyTwo.id),
      entry(flaming.id),
      entry(armorRune.id),
    ]);
    expect(availableRuneItems(draft, sword.id, equipment).map((item) => item.itemId)).toEqual([
      potencyTwo.id,
      flaming.id,
    ]);
  });

  it("consumes the rune item and returns a replaced fundamental rune", () => {
    const draft = draftWith([entry(sword.id, [potencyOne.id]), entry(potencyTwo.id)]);
    const result = etchRuneFromInventory(draft, sword.id, potencyTwo.id, equipment);
    expect(result.error).toBeNull();
    expect(result.draft.equipment.find((item) => item.itemId === sword.id)?.runes).toEqual([
      potencyTwo.id,
    ]);
    expect(result.draft.equipment.find((item) => item.itemId === potencyTwo.id)).toBeUndefined();
    expect(result.draft.equipment.find((item) => item.itemId === potencyOne.id)?.quantity).toBe(1);
  });

  it("blocks property runes when the potency slots are full", () => {
    const draft = draftWith([entry(sword.id, [potencyOne.id, flaming.id]), entry(frost.id)]);
    const result = etchRuneFromInventory(draft, sword.id, frost.id, equipment);
    expect(result.error).toContain("property rune");
    expect(result.draft).toBe(draft);
  });

  it("blocks a lower potency rune that would strand property runes", () => {
    const draft = draftWith([
      entry(sword.id, [potencyTwo.id, flaming.id, frost.id]),
      entry(potencyOne.id),
    ]);
    const result = etchRuneFromInventory(draft, sword.id, potencyOne.id, equipment);
    expect(result.error).toContain("too few property rune slots");
  });

  it("detaches a rune back into the pack", () => {
    const draft = draftWith([entry(sword.id, [potencyTwo.id, flaming.id])]);
    const result = detachRuneToInventory(draft, sword.id, flaming.id);
    expect(result.error).toBeNull();
    expect(result.draft.equipment.find((item) => item.itemId === sword.id)?.runes).toEqual([
      potencyTwo.id,
    ]);
    expect(result.draft.equipment.find((item) => item.itemId === flaming.id)?.quantity).toBe(1);
  });
});
