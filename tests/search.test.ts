import { describe, expect, it } from "vitest";
import {
  actions,
  ancestries,
  backgrounds,
  classFeatures,
  classes,
  conditions,
  deities,
  domains,
  equipment,
  feats,
  globalSearch,
  heritages,
  lookupItem,
  monsters,
  searchEquipment,
  searchFeats,
  searchMonsters,
  searchSpells,
  spells,
} from "../src/server/compendium";
import { compendiumKindFromId } from "../src/shared/compendium";

describe("compendium search", () => {
  it("ranks an exact name match first", () => {
    expect(searchFeats({ q: "Toughness", limit: 5, includeLegacy: true }).items[0]?.name).toBe(
      "Toughness"
    );
    expect(searchMonsters({ q: "Goblin Warrior", limit: 5 }).items[0]?.name).toBe("Goblin Warrior");
  });

  it("filters recommended feats to common, non-playtest options", () => {
    const all = searchFeats({ limit: 200, includeLegacy: true });
    const recommended = searchFeats({ limit: 200, includeLegacy: true, recommended: true });
    expect(recommended.total).toBeLessThan(all.total);
    expect(recommended.items.every((feat) => feat.rarity === "common" && !feat.playtest)).toBe(
      true
    );
  });

  it("filters recommended spells and equipment to common options", () => {
    const spells = searchSpells({ limit: 200, includeLegacy: true, recommended: true });
    const items = searchEquipment({ limit: 200, includeLegacy: true, recommended: true });
    expect(spells.items.every((spell) => spell.rarity === "common" && !spell.playtest)).toBe(true);
    expect(items.items.every((item) => item.rarity === "common" && !item.playtest)).toBe(true);
  });

  it("filters equipment by category and subcategory", () => {
    const martial = searchEquipment({
      type: ["weapon"],
      subcategory: ["martial"],
      limit: 200,
      includeLegacy: true,
    });
    expect(martial.total).toBeGreaterThan(0);
    expect(
      martial.items.every((item) => item.type === "weapon" && item.weapon?.category === "martial")
    ).toBe(true);

    const potions = searchEquipment({
      type: ["consumable"],
      subcategory: ["potion"],
      limit: 200,
      includeLegacy: true,
    });
    expect(potions.total).toBeGreaterThan(0);
    expect(
      potions.items.every(
        (item) => item.type === "consumable" && item.consumable?.category === "potion"
      )
    ).toBe(true);

    const lightOrMedium = searchEquipment({
      type: ["armor"],
      subcategory: ["light", "medium"],
      limit: 200,
      includeLegacy: true,
    });
    expect(lightOrMedium.total).toBeGreaterThan(0);
    expect(
      lightOrMedium.items.every(
        (item) =>
          item.type === "armor" &&
          (item.armor?.category === "light" || item.armor?.category === "medium")
      )
    ).toBe(true);

    const runes = searchEquipment({
      runeOnly: true,
      limit: 200,
      includeLegacy: true,
    });
    expect(runes.total).toBeGreaterThan(100);
    expect(runes.items.every((item) => item.usage.startsWith("etched-onto"))).toBe(true);
  });

  it("searches every compendium category from one query", () => {
    const cases: [string, string][] = [
      ["Dwarf", "ancestry"],
      ["Aiuvarin", "heritage"],
      ["Acolyte", "background"],
      ["Wizard", "class"],
      ["Arcane Spellcasting", "classFeature"],
      ["Toughness", "feat"],
      ["Fireball", "spell"],
      ["Longsword", "equipment"],
      ["Abadar", "deity"],
      ["Air", "domain"],
      ["Frightened", "condition"],
      ["A Challenge for Heroes", "action"],
      ["Goblin Warrior", "monster"],
    ];
    for (const [query, kind] of cases) {
      const result = globalSearch(query, 60);
      expect(
        result.counts[kind as keyof typeof result.counts],
        `${query} should reach ${kind}`
      ).toBeGreaterThan(0);
      expect(
        result.items.some((item) => item.kind === kind),
        `${query} should return a ${kind}`
      ).toBe(true);
    }
  });

  it("ranks exact global matches first and resolves every result id", () => {
    const result = globalSearch("Fireball", 30);
    expect(result.items[0]).toMatchObject({ name: "Fireball", kind: "spell" });
    expect(result.items.every((item) => compendiumKindFromId(item.id) === item.kind)).toBe(true);
    for (const item of result.items) {
      expect(lookupItem(item.id), `${item.name} should resolve`).toBeTruthy();
    }
  });

  it("filters global search by kind and returns plain-text summaries", () => {
    const result = globalSearch("fire", 40, ["spell", "equipment"]);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.kind === "spell" || item.kind === "equipment")).toBe(
      true
    );
    expect(
      result.items.every((item) => !item.summary.includes("<") && !item.summary.includes("&nbsp;"))
    ).toBe(true);
    expect(globalSearch("", 10)).toEqual({ items: [], total: 0, counts: {} });
  });

  it("does not let one huge category crowd out the rest of a broad query", () => {
    const result = globalSearch("fire", 60);
    expect(result.items.length).toBeLessThanOrEqual(60);
    const kinds = new Set(result.items.map((item) => item.kind));
    expect(kinds.size).toBeGreaterThan(3);
  });

  it("resolves every compendium id through the shared lookup", () => {
    const groups = [
      ancestries,
      heritages,
      backgrounds,
      classes,
      classFeatures,
      feats,
      spells,
      equipment,
      deities,
      domains,
      conditions,
      actions,
      monsters,
    ];
    for (const group of groups) {
      for (const item of group) {
        expect(lookupItem(item.id), `${item.name} (${item.id}) should resolve`).toBe(item);
      }
    }
  });
});
