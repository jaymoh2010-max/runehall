import { describe, expect, it } from "vitest";
import type { Equipment, Feat } from "../src/shared/types";
import { automationForEquipment, automationForFeat } from "../src/shared/automation";

function feat(overrides: Partial<Feat>): Feat {
  return {
    id: "feat:test",
    name: "Test Feat",
    type: "feat",
    category: "general",
    level: 1,
    rarity: "common",
    traits: [],
    actionType: null,
    actions: null,
    prerequisites: [],
    description: "",
    source: "Test",
    ...overrides,
  } as Feat;
}

function item(overrides: Partial<Equipment>): Equipment {
  return {
    id: "item:test",
    name: "Test Item",
    type: "equipment",
    level: 0,
    price: { gp: 1, sp: 0, cp: 0, cpTotal: 100 },
    bulk: 1,
    rarity: "common",
    traits: [],
    usage: "held",
    description: "",
    source: "Test",
    ...overrides,
  } as Equipment;
}

describe("automation labels", () => {
  it("marks feat text effects as manual", () => {
    expect(automationForFeat(feat({ description: "You gain a +1 circumstance bonus to saves." })).level).toBe(
      "manual",
    );
  });

  it("marks pure flavor feats as full", () => {
    expect(automationForFeat(feat({ description: "You have a knack for local gossip." })).level).toBe("full");
  });

  it("marks base gear as full, magic gear as partial, and other items as manual", () => {
    expect(
      automationForEquipment(
        item({ weapon: { category: "martial", damage: { dice: 1, die: "d8", type: "slashing" } } as Equipment["weapon"] }),
      ).level,
    ).toBe("full");
    expect(
      automationForEquipment(
        item({
          level: 4,
          traits: ["magical"],
          weapon: { category: "martial", damage: { dice: 1, die: "d8", type: "slashing" } } as Equipment["weapon"],
        }),
      ).level,
    ).toBe("partial");
    expect(automationForEquipment(item({ type: "consumable", level: 1 })).level).toBe("manual");
  });
});
