import { describe, expect, it } from "vitest";
import {
  searchEquipment,
  searchFeats,
  searchMonsters,
  searchSpells,
} from "../src/server/compendium";

describe("compendium search", () => {
  it("ranks an exact name match first", () => {
    expect(searchFeats({ q: "Toughness", limit: 5, includeLegacy: true }).items[0]?.name).toBe(
      "Toughness",
    );
    expect(searchMonsters({ q: "Goblin Warrior", limit: 5 }).items[0]?.name).toBe("Goblin Warrior");
  });

  it("filters recommended feats to common, non-playtest options", () => {
    const all = searchFeats({ limit: 200, includeLegacy: true });
    const recommended = searchFeats({ limit: 200, includeLegacy: true, recommended: true });
    expect(recommended.total).toBeLessThan(all.total);
    expect(recommended.items.every((feat) => feat.rarity === "common" && !feat.playtest)).toBe(true);
  });

  it("filters recommended spells and equipment to common options", () => {
    const spells = searchSpells({ limit: 200, includeLegacy: true, recommended: true });
    const items = searchEquipment({ limit: 200, includeLegacy: true, recommended: true });
    expect(spells.items.every((spell) => spell.rarity === "common" && !spell.playtest)).toBe(true);
    expect(items.items.every((item) => item.rarity === "common" && !item.playtest)).toBe(true);
  });
});
