import { describe, expect, it } from "vitest";
import { resetItemUses } from "../src/shared/itemActivation";
import {
  addItemToDraft,
  ammoKindForAmmo,
  ammoKindForWeapon,
  consumeAttackItem,
  mergeEquipmentEntries,
} from "../src/shared/inventory";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";
import type { CharacterEquipment, DerivedAttack, Equipment } from "../src/shared/types";

function equipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "item:test",
    name: "Test Item",
    type: "equipment",
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
  };
}

function attack(overrides: Partial<DerivedAttack> = {}): DerivedAttack {
  return {
    id: "weapon:test",
    name: "Test weapon",
    sourceItemId: "item:test",
    attackBonus: 5,
    attackFormula: "1d20+5",
    damageFormula: "1d8+2",
    damageType: "slashing",
    traits: [],
    hands: 1,
    ranged: false,
    notes: "",
    ...overrides,
  };
}

describe("limited-use stack merging", () => {
  it("pools daily charges instead of dropping one item's tracker", () => {
    const existing: CharacterEquipment = {
      itemId: "item:wand",
      quantity: 1,
      equipped: false,
      usesKind: "daily",
      usesMax: 1,
      usesUsed: 1,
    };
    const incoming: CharacterEquipment = {
      itemId: "item:wand",
      quantity: 1,
      equipped: false,
      usesKind: "daily",
      usesMax: 1,
      usesUsed: 0,
    };
    expect(mergeEquipmentEntries(existing, incoming)).toMatchObject({
      quantity: 2,
      usesKind: "daily",
      usesMax: 2,
      usesUsed: 1,
    });
  });

  it("pools remaining uses for multi-use consumables", () => {
    const existing: CharacterEquipment = {
      itemId: "item:deck",
      quantity: 2,
      equipped: false,
      usesKind: "consumable",
      usesMax: 3,
      usesUsed: 1,
    };
    const incoming: CharacterEquipment = {
      itemId: "item:deck",
      quantity: 1,
      equipped: false,
      usesKind: "consumable",
      usesMax: 3,
      usesUsed: 2,
    };
    expect(mergeEquipmentEntries(existing, incoming)).toMatchObject({
      quantity: 1,
      usesKind: "consumable",
      usesMax: 6,
      usesUsed: 0,
    });
  });

  it("uses the pooled policy through addItemToDraft", () => {
    const draft = emptyCharacterDraft("Inventory Test");
    draft.equipment = [
      {
        itemId: "item:wand",
        quantity: 1,
        equipped: false,
        usesKind: "daily",
        usesMax: 1,
        usesUsed: 1,
      },
    ];
    const next = addItemToDraft(draft, {
      itemId: "item:wand",
      quantity: 1,
      equipped: false,
      usesKind: "daily",
      usesMax: 1,
      usesUsed: 0,
    });
    expect(next.equipment[0]).toMatchObject({
      quantity: 2,
      usesMax: 2,
      usesUsed: 1,
    });
  });

  it("pools duplicate entries during normalization", () => {
    const raw = emptyCharacterDraft("Normalized");
    raw.equipment = [
      {
        itemId: "item:wand",
        quantity: 1,
        equipped: false,
        usesKind: "daily",
        usesMax: 1,
        usesUsed: 1,
      },
      {
        itemId: "item:wand",
        quantity: 1,
        equipped: false,
        usesKind: "daily",
        usesMax: 1,
        usesUsed: 0,
      },
    ];
    const normalized = normalizeCharacterDraft(raw);
    expect(normalized.equipment).toHaveLength(1);
    expect(normalized.equipment[0]).toMatchObject({ quantity: 2, usesMax: 2, usesUsed: 1 });
  });
});

describe("attack consumption", () => {
  it("spends one bomb and removes the stack when it is empty", () => {
    const draft = emptyCharacterDraft("Bomb Test");
    draft.equipment = [{ itemId: "item:bomb", quantity: 2, equipped: true }];
    const bomb = attack({ name: "Bomb", sourceItemId: "item:bomb", consumesSource: true });
    const first = consumeAttackItem(draft, bomb);
    expect(first.blocked).toBeNull();
    expect(first.note).toContain("Bomb");
    expect(first.draft.equipment[0].quantity).toBe(1);
    const second = consumeAttackItem(first.draft, bomb);
    expect(second.draft.equipment).toHaveLength(0);
    expect(consumeAttackItem(second.draft, bomb).blocked).toContain("No Bomb left");
  });

  it("spends one selected ammunition when the attack uses one", () => {
    const draft = emptyCharacterDraft("Ammo Test");
    draft.equipment = [{ itemId: "item:arrows", quantity: 2, equipped: false }];
    const bow = attack({
      name: "Longbow",
      sourceItemId: "item:bow",
      ranged: true,
      ammoKind: "arrows",
    });
    const result = consumeAttackItem(draft, bow, "item:arrows");
    expect(result.blocked).toBeNull();
    expect(result.draft.equipment[0].quantity).toBe(1);
    expect(consumeAttackItem(draft, bow).draft).toBe(draft);
  });
});

describe("ammunition categories", () => {
  it("classifies bows, crossbows, slings, and firearms", () => {
    expect(ammoKindForWeapon(equipment({ weapon: { group: "bow" } as never }))).toBe("arrows");
    expect(ammoKindForWeapon(equipment({ weapon: { group: "crossbow" } as never }))).toBe("bolts");
    expect(ammoKindForWeapon(equipment({ weapon: { group: "sling" } as never }))).toBe("sling");
    expect(ammoKindForWeapon(equipment({ weapon: { group: "firearm" } as never }))).toBe("firearm");
  });

  it("classifies common ammunition names", () => {
    expect(ammoKindForAmmo(equipment({ name: "Arrows" }))).toBe("arrows");
    expect(ammoKindForAmmo(equipment({ name: "Bolts" }))).toBe("bolts");
    expect(ammoKindForAmmo(equipment({ name: "Sling Bullets" }))).toBe("sling");
    expect(ammoKindForAmmo(equipment({ name: "Firearm Ammunition" }))).toBe("firearm");
  });
});

describe("staff daily reset", () => {
  it("drops extra expended-slot charges and returns to the base pool", () => {
    const draft = emptyCharacterDraft("Staff Test");
    draft.equipment = [
      {
        itemId: "item:staff",
        quantity: 1,
        equipped: true,
        usesKind: "charges",
        usesMax: 5,
        usesUsed: 4,
        staffBaseCharges: 3,
      },
    ];
    const reset = resetItemUses(draft);
    expect(reset.equipment[0]).toMatchObject({
      usesKind: "charges",
      usesMax: 3,
      usesUsed: 3,
      staffBaseCharges: 3,
    });
  });
});
