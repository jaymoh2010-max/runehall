import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importPathbuilder } from "../src/server/pathbuilder";
import type {
  Ancestry,
  Background,
  ClassData,
  Equipment,
  Feat,
  Heritage,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const human = byName(read<Ancestry>("ancestries.json"), "Human");
const versatileHuman = byName(read<Heritage>("heritages.json"), "Versatile Human");
const warrior = byName(read<Background>("backgrounds.json"), "Warrior");
const fighter = byName(read<ClassData>("classes.json"), "Fighter");
const feats = read<Feat>("feats.json");
const equipment = read<Equipment>("equipment.json");
const toughness = byName(feats, "Toughness");
const fleet = byName(feats, "Fleet");
const naturalAmbition = byName(feats, "Natural Ambition");
const reachSpell = byName(feats, "Reach Spell");
const doubleSlice = byName(feats, "Double Slice");
const longsword = byName(equipment, "Longsword");
const hideArmor = byName(equipment, "Hide Armor");
const backpack = byName(equipment, "Backpack");

const build = {
  name: "Imported Hero",
  class: "Fighter",
  level: 5,
  ancestry: "Human",
  heritage: "Versatile Human",
  background: "Warrior",
  deity: "Not set",
  keyability: "str",
  languages: ["Common", "Dwarven"],
  abilities: {
    str: 19,
    dex: 16,
    con: 16,
    int: 10,
    wis: 12,
    cha: 8,
    breakdown: {
      ancestryFree: ["Str", "Dex"],
      ancestryBoosts: [],
      ancestryFlaws: [],
      backgroundBoosts: ["Str", "Con"],
      classBoosts: ["Str"],
      mapLevelledBoosts: {
        "1": ["Str", "Dex", "Con", "Wis"],
        "5": ["Str", "Con", "Wis", "Dex"],
      },
    },
  },
  proficiencies: {
    perception: 4,
    fortitude: 4,
    reflex: 2,
    will: 2,
    athletics: 4,
    acrobatics: 2,
    crafting: 2,
  },
  feats: [
    ["Toughness", null, "General Feat", 1],
    ["Fleet", null, "General Feat", 3],
    ["Shield Block", null, "Awarded Feat", 1],
    ["Natural Ambition", null, "Ancestry Feat", 1, "Human Feat 1", "parentChoice", null],
    ["Reach Spell", null, "Class Feat", 1, "Natural Ambition Class Feat", "childChoice", null],
    ["Double Slice", null, "Class Feat", 1],
  ],
  lores: [["Warfare", 2]],
  equipment: [["Backpack", 1, "Invested"]],
  weapons: [{ name: "Longsword", qty: 1, pot: 0 }],
  armor: [{ name: "Hide", qty: 1, pot: 0, res: "", worn: true }],
  money: { gp: 10, sp: 5, cp: 0, pp: 1 },
  spellCasters: [],
  focus: {},
};

describe("Pathbuilder import", () => {
  it("maps core identity, boosts, feats, skills, gear, and money", () => {
    const { draft, report } = importPathbuilder(build);
    expect(draft.name).toBe("Imported Hero");
    expect(draft.level).toBe(5);
    expect(draft.ancestryId).toBe(human.id);
    expect(draft.heritageId).toBe(versatileHuman.id);
    expect(draft.backgroundId).toBe(warrior.id);
    expect(draft.classId).toBe(fighter.id);
    expect(draft.keyAbility).toBe("str");
    expect(draft.boosts.ancestry).toEqual(["str", "dex"]);
    expect(draft.boosts.background).toEqual(["str", "con"]);
    expect(draft.boosts.free).toEqual(["str", "dex", "con", "wis"]);
    expect(draft.boosts.levels["5"]).toEqual(["str", "con", "wis", "dex"]);

    expect(draft.feats.general["1"]).toBe(toughness.id);
    expect(draft.feats.general["3"]).toBe(fleet.id);
    expect(draft.feats.class["1"]).toBe(doubleSlice.id);
    expect(draft.featChoices[naturalAmbition.id]).toEqual([reachSpell.id]);

    expect(draft.skills.trained).toEqual(expect.arrayContaining(["athletics", "acrobatics"]));
    expect(draft.skills.lore).toContain("Warfare");

    expect(draft.equipment.find((entry) => entry.itemId === longsword.id)?.equipped).toBe(true);
    expect(draft.equipment.find((entry) => entry.itemId === hideArmor.id)?.equipped).toBe(true);
    expect(draft.equipment.find((entry) => entry.itemId === backpack.id)?.invested).toBe(true);
    expect(draft.currency).toEqual({ gp: 20, sp: 5, cp: 0 });

    expect(report.unmatched).toEqual([]);
    expect(report.matched.feat).toBeGreaterThanOrEqual(4);
    expect(report.warnings.join(" ")).toContain("awarded feat");
  });

  it("reports names that cannot be matched instead of guessing", () => {
    const { report } = importPathbuilder({
      ...build,
      ancestry: "Unknown Ancestry",
      feats: [["Imaginary Feat", null, "General Feat", 1]],
      equipment: [["Imaginary Item", 1]],
      spellCasters: [
        {
          name: "Test",
          magicTradition: "arcane",
          spellcastingType: "spontaneous",
          spells: [{ spellLevel: 1, list: ["Imaginary Spell"] }],
        },
      ],
    });
    expect(report.unmatched).toEqual(
      expect.arrayContaining([
        "Ancestry: Unknown Ancestry",
        "Feat: Imaginary Feat",
        "Equipment: Imaginary Item",
        "Spell: Imaginary Spell",
      ])
    );
  });

  it("maps spells and focus spells by name", () => {
    const { draft, report } = importPathbuilder({
      ...build,
      spellCasters: [
        {
          name: "Wizard",
          magicTradition: "arcane",
          spellcastingType: "prepared",
          spells: [
            { spellLevel: 0, list: ["Light"] },
            { spellLevel: 1, list: ["Heal"] },
          ],
        },
      ],
      focus: { arcane: { int: { focusSpells: ["Fireball"] } } },
    });
    expect(draft.spells.tradition).toBe("arcane");
    expect(draft.spells.cantrips).toContain("spell:WBmvzNDfpwka3qT4");
    expect(draft.spells.known).toContain("spell:rfZpqmj0AIIdkVIs");
    expect(draft.spells.prepared).toContain("spell:rfZpqmj0AIIdkVIs");
    expect(draft.spells.focus).toContain("spell:sxQZ6yqTn0czJxVd");
    expect(report.unmatched).toEqual([]);
  });
});
