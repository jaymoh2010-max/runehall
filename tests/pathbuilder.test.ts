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
  Spell,
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
const cleric = byName(read<ClassData>("classes.json"), "Cleric");
const scholar = byName(read<Background>("backgrounds.json"), "Scholar");
const feats = read<Feat>("feats.json");
const equipment = read<Equipment>("equipment.json");
const spells = read<Spell>("spells.json");
const toughness = byName(feats, "Toughness");
const fleet = byName(feats, "Fleet");
const naturalAmbition = byName(feats, "Natural Ambition");
const reachSpell = byName(feats, "Reach Spell");
const doubleSlice = byName(feats, "Double Slice");
const longsword = byName(equipment, "Longsword");
const hideArmor = byName(equipment, "Hide Armor");
const steelShield = byName(equipment, "Steel Shield");
const backpack = byName(equipment, "Backpack");
const weaponPotency1 = byName(equipment, "Weapon Potency (+1)");
const strikingGreater = byName(equipment, "Striking (Greater)");
const flaming = byName(equipment, "Flaming");
const armorPotency1 = byName(equipment, "Armor Potency (+1)");
const resilient = byName(equipment, "Resilient");
const reinforcingMinor = byName(equipment, "Reinforcing Rune (Minor)");
const heal = byName(spells, "Heal");

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

  it("reconstructs class choices and background skill picks", () => {
    const { draft } = importPathbuilder({
      ...build,
      class: "Cleric",
      background: "Scholar",
      specials: ["Cloistered Cleric"],
      proficiencies: { ...build.proficiencies, arcana: 2 },
      feats: [],
      lores: [["Academia Lore", 2]],
    });
    const doctrine = cleric.choiceGroups.find((group) => group.tag === "cleric-doctrine");
    const cloistered = doctrine?.options.find((option) => option.name === "Cloistered Cleric");
    expect(doctrine).toBeDefined();
    expect(cloistered).toBeDefined();
    expect(draft.classChoices[doctrine!.key]).toEqual([cloistered!.id]);
    expect(draft.skills.background).toContain("arcana");
    expect(draft.skills.lore).toContain("Academia Lore");
    expect(draft.backgroundId).toBe(scholar.id);
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

  it("preserves prepared-slot duplicates and warns about spellbooks", () => {
    const { draft, report } = importPathbuilder({
      ...build,
      spellCasters: [
        {
          name: "Wizard",
          magicTradition: "arcane",
          spellcastingType: "prepared",
          spells: [{ spellLevel: 1, list: ["Heal", "Heal"] }],
        },
      ],
    });
    expect(draft.spells.prepared.filter((id) => id === heal.id)).toHaveLength(2);
    expect(draft.spells.known.filter((id) => id === heal.id)).toHaveLength(1);
    expect(report.warnings.join(" ")).toContain("prepared list");
  });

  it("routes focus-only casters to the focus list", () => {
    const { draft } = importPathbuilder({
      ...build,
      spellCasters: [
        {
          name: "Focus Spells",
          magicTradition: "focus",
          spellcastingType: "",
          spells: [{ spellLevel: 1, list: ["Heal"] }],
        },
      ],
    });
    expect(draft.spells.focus).toContain(heal.id);
    expect(draft.spells.known).not.toContain(heal.id);
  });

  it("maps weapon, armor, and shield runes", () => {
    const { draft, report } = importPathbuilder({
      ...build,
      weapons: [{ name: "Longsword", qty: 1, pot: 1, str: "greater", runes: ["Flaming"] }],
      armor: [
        { name: "Hide", qty: 1, pot: 1, res: "resilient", worn: true, runes: [] },
        {
          name: "Steel Shield",
          qty: 1,
          prof: "shield",
          worn: true,
          runes: ["Reinforcing (Minor)"],
        },
      ],
    });
    const sword = draft.equipment.find((entry) => entry.itemId === longsword.id);
    expect(sword?.runes).toEqual(
      expect.arrayContaining([weaponPotency1.id, strikingGreater.id, flaming.id])
    );
    const armor = draft.equipment.find((entry) => entry.itemId === hideArmor.id);
    expect(armor?.runes).toEqual(expect.arrayContaining([armorPotency1.id, resilient.id]));
    const shield = draft.equipment.find((entry) => entry.itemId === steelShield.id);
    expect(shield?.runes).toContain(reinforcingMinor.id);
    expect(report.unmatched).toEqual([]);
  });

  it("imports familiars and pets as companions", () => {
    const { draft, report } = importPathbuilder({
      ...build,
      familiars: [{ type: "Familiar", name: "Mote", abilities: ["Familiar Focus"] }],
      pets: [{ type: "Animal Companion", name: "Bear", level: 5 }],
    });
    expect(draft.companions.map((companion) => companion.name)).toEqual(["Mote", "Bear"]);
    expect(draft.companions[0].kind).toBe("familiar");
    expect(draft.companions[1].kind).toBe("animal");
    expect(report.matched.companion).toBe(2);
    expect(report.warnings.join(" ")).toContain("companions");
  });

  it("warns about unsupported dual-class and per-day slot differences", () => {
    const { report } = importPathbuilder({
      ...build,
      class: "Wizard",
      dualClass: "Fighter",
      spellCasters: [
        {
          name: "Wizard",
          magicTradition: "arcane",
          spellcastingType: "prepared",
          perDay: [9, 9, 9],
          spells: [],
        },
      ],
    });
    expect(report.warnings.join(" ")).toContain("Dual-class (Fighter)");
    expect(report.warnings.join(" ")).toContain("per-day slots");
  });
});
