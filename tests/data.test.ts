import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  Ancestry,
  Background,
  ClassData,
  Deity,
  Equipment,
  Feat,
  Heritage,
  Monster,
  RitualData,
  Spell,
  Hazard,
  Vehicle,
  FamiliarAbility,
  BoonCurse,
  TraitEntry,
  Affliction,
} from "../src/shared/types";
import type { DomainEntry } from "../src/shared/domains";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const manifest = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "manifest.json"), "utf8")
) as { count: Record<string, number> };
const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const feats = read<Feat>("feats.json");
const spells = read<Spell>("spells.json");
const equipment = read<Equipment>("equipment.json");
const deities = read<Deity>("deities.json");
const domains = read<DomainEntry>("domains.json");
const monsters = read<Monster>("monsters.json");
const classFeatures = read<{ name: string; description: string }>("classFeatures.json");
const actions = read<{ name: string; description: string }>("actions.json");
const hazards = read<Hazard>("hazards.json");
const vehicles = read<Vehicle>("vehicles.json");
const familiarAbilities = read<FamiliarAbility>("familiarAbilities.json");
const boonsAndCurses = read<BoonCurse>("boonsAndCurses.json");
const traits = read<TraitEntry>("traits.json");
const afflictions = read<Affliction>("afflictions.json");
const ritualChecks = JSON.parse(
  fs.readFileSync(path.resolve("data", "compendium", "ritualData.json"), "utf8")
) as Record<string, RitualData>;

const byName = <T extends { name: string }>(items: T[], name: string): T => {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};

describe("compendium data", () => {
  it("matches the manifest counts and has no duplicate ids", () => {
    const files: [string, { id: string }[]][] = [
      ["ancestries", ancestries],
      ["heritages", heritages],
      ["backgrounds", backgrounds],
      ["classes", classes],
      ["feats", feats],
      ["spells", spells],
      ["equipment", equipment],
      ["deities", deities],
      ["domains", domains],
      ["monsters", monsters],
      ["hazards", hazards],
      ["vehicles", vehicles],
      ["familiarAbilities", familiarAbilities],
      ["boonsAndCurses", boonsAndCurses],
      ["traits", traits],
      ["afflictions", afflictions],
    ];
    for (const [key, items] of files) {
      expect(manifest.count[key], `${key} manifest count`).toBe(items.length);
      expect(new Set(items.map((item) => item.id)).size, `${key} ids`).toBe(items.length);
    }
  });

  it("covers every equipment category and subtype used by the item database", () => {
    const types = [...new Set(equipment.map((item) => item.type))].sort();
    expect(types).toEqual([
      "ammo",
      "armor",
      "backpack",
      "consumable",
      "equipment",
      "kit",
      "shield",
      "treasure",
      "weapon",
    ]);

    for (const item of equipment) {
      expect(item.name.trim().length, "equipment name").toBeGreaterThan(0);
      expect(item.price.cpTotal, `${item.name} price`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(item.bulk), `${item.name} bulk`).toBe(true);
      if (item.type === "weapon") expect(item.weapon?.category, `${item.name} weapon`).toBeTruthy();
      if (item.type === "armor") expect(item.armor?.category, `${item.name} armor`).toBeTruthy();
      if (item.type === "shield") expect(item.shield, `${item.name} shield`).toBeTruthy();
      if (item.type === "consumable") {
        expect(item.consumable?.category, `${item.name} consumable`).toBeTruthy();
      }
    }

    const weaponCategories = [
      ...new Set(equipment.flatMap((item) => (item.weapon ? [item.weapon.category] : []))),
    ].sort();
    expect(weaponCategories).toEqual(["advanced", "martial", "simple", "unarmed"]);

    const armorCategories = [
      ...new Set(equipment.flatMap((item) => (item.armor ? [item.armor.category] : []))),
    ].sort();
    expect(armorCategories).toEqual([
      "heavy",
      "heavy-barding",
      "light",
      "light-barding",
      "medium",
      "unarmored",
    ]);

    const consumableCategories = [
      ...new Set(equipment.flatMap((item) => (item.consumable ? [item.consumable.category] : []))),
    ].sort();
    expect(consumableCategories).toEqual([
      "catalyst",
      "drug",
      "elixir",
      "fulu",
      "gadget",
      "mutagen",
      "oil",
      "other",
      "poison",
      "potion",
      "scroll",
      "snare",
      "talisman",
      "toolkit",
      "wand",
    ]);

    const traits = new Set(equipment.flatMap((item) => item.traits));
    for (const trait of [
      "alchemical",
      "artifact",
      "grimoire",
      "invested",
      "magical",
      "spellheart",
      "staff",
      "talisman",
      "tattoo",
      "wand",
    ]) {
      expect(traits.has(trait), `${trait} items`).toBe(true);
    }
    expect(
      equipment.filter((item) => item.usage.startsWith("etched-onto")).length,
      "etched runes"
    ).toBeGreaterThan(100);
  });

  it("keeps spell damage formulas and heightening data", () => {
    const fireball = byName(spells, "Fireball");
    expect(fireball.rank).toBe(3);
    expect(fireball.traditions.sort()).toEqual(["arcane", "primal"]);
    expect(fireball.defense).toEqual({ save: "reflex", basic: true });
    expect(fireball.damage).toEqual([{ formula: "6d6", type: "fire" }]);
    expect(fireball.heightening?.damage).toEqual([{ formula: "2d6", type: "fire" }]);
    expect(fireball.damageText).toContain("6d6");

    const electricArc = byName(spells, "Electric Arc");
    expect(electricArc.damage).toEqual([{ formula: "2d4", type: "electricity" }]);
    const heal = byName(spells, "Heal");
    expect(heal.damage).toEqual([{ formula: "1d8", type: "vitality" }]);

    const damaged = spells.filter((spell) => spell.damage?.length);
    expect(damaged.length).toBeGreaterThan(500);
    for (const spell of damaged) {
      for (const part of spell.damage ?? []) {
        expect(part.formula.trim().length, `${spell.name} damage formula`).toBeGreaterThan(0);
        expect(part.formula, `${spell.name} unresolved formula`).not.toContain("@");
        expect(part.type, `${spell.name} damage type`).not.toBe("");
      }
    }
  });

  it("restores ritual and embedded equipment rules text", () => {
    for (const name of ["Open the Wall of Ghosts", "Mindscape Shift", "Transmigrate"]) {
      const ritual = byName(spells, name);
      expect(ritual.ritual, `${name} should be marked as a ritual`).toBe(true);
      expect(ritual.description.length, `${name} description`).toBeGreaterThan(100);
    }

    for (const name of ["Horn of Plenty", "Amulet Implement", "Thousand-League Sandals"]) {
      const item = byName(equipment, name);
      expect(item.description.length, `${name} embedded description`).toBeGreaterThan(40);
    }

    const gmItem = byName(equipment, "Alisendra's Fan");
    expect(gmItem.gmDescription).toBe(true);
    expect(gmItem.description.length).toBeGreaterThan(100);
  });

  it("includes structured ritual checks for the rituals that have them", () => {
    const createUndead = byName(spells, "Create Undead");
    expect(ritualChecks[createUndead.id]).toMatchObject({
      primaryCheck: expect.stringContaining("Arcana"),
      secondaryCasters: 1,
      secondaryChecks: "Religion",
    });
    const resurrect = byName(spells, "Resurrect");
    expect(ritualChecks[resurrect.id]).toMatchObject({
      primaryCheck: "Religion (expert)",
      secondaryCasters: 2,
      secondaryChecks: "Medicine, Society",
    });

    const spellById = new Map(spells.map((spell) => [spell.id, spell]));
    for (const [id, entry] of Object.entries(ritualChecks)) {
      const spell = spellById.get(id);
      expect(spell, id).toBeDefined();
      expect(spell!.ritual, id).toBe(true);
      expect(entry.primaryCheck.trim().length, id).toBeGreaterThan(0);
      expect(Number.isInteger(entry.secondaryCasters), id).toBe(true);
      expect(entry.secondaryCasters, id).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(ritualChecks).length).toBeGreaterThan(150);
  });

  it("normalizes deity domains, alternate domains, and skill choices", () => {
    const abadar = byName(deities, "Abadar");
    expect(abadar.domains).toEqual(["cities", "earth", "travel", "wealth"]);
    expect(abadar.alternateDomains).toEqual(["creation", "duty", "metal", "toil"]);
    expect(abadar.skill).toEqual(["society"]);
    expect(abadar.weapons).toEqual(["crossbow"]);
    expect(abadar.font.sort()).toEqual(["harm", "heal"]);
    // Deity spell lists are resolved to local spell ids and names.
    expect(abadar.spells["1"]).toMatchObject({
      id: expect.stringMatching(/^spell:/),
      name: "Illusory Object",
    });
    expect(JSON.stringify(abadar.spells)).not.toContain("Compendium.pf2e");
    expect(byName(deities, "Dammar").spells["5"]?.name).toBe("Flammable Fumes");
    expect(byName(deities, "Inna").spells["4"]?.name).toBe("Creation");
    expect(byName(deities, "Tolte Coatl").spells["8"]?.name).toBe("Quandary");

    const shelyn = byName(deities, "Shelyn");
    expect(shelyn.skill).toEqual(["crafting", "performance"]);
    const heiFeng = byName(deities, "Hei Feng");
    expect(heiFeng.sanctificationNote).toMatch(/tengu/i);
    expect(heiFeng.sanctification).toMatchObject({ modal: "can", what: ["unholy", "holy"] });

    const skillIds = new Set([
      "acrobatics",
      "arcana",
      "athletics",
      "crafting",
      "deception",
      "diplomacy",
      "intimidation",
      "medicine",
      "nature",
      "occultism",
      "performance",
      "religion",
      "society",
      "stealth",
      "survival",
      "thievery",
    ]);
    for (const deity of deities) {
      expect(Array.isArray(deity.skill), `${deity.name} skill`).toBe(true);
      expect(Array.isArray(deity.domains), `${deity.name} domains`).toBe(true);
      for (const skill of deity.skill) {
        expect(skillIds.has(skill), `${deity.name} skill ${skill}`).toBe(true);
      }
    }
    for (const background of backgrounds) {
      for (const skill of background.trainedSkills) {
        expect(skillIds.has(skill), `${background.name} skill ${skill}`).toBe(true);
      }
      for (const choice of background.skillChoices) {
        for (const skill of choice.options) {
          expect(skillIds.has(skill), `${background.name} choice ${skill}`).toBe(true);
        }
      }
      for (const choice of background.loreChoices) {
        for (const lore of choice.options) {
          expect(lore.toLowerCase(), `${background.name} Lore option`).toContain("lore");
        }
      }
    }
    const air = byName(domains, "Air");
    expect(air.id).toBe("domain:air");
    expect(air.domainSpell.name).toBe("Pushing Gust");
    expect(air.advancedDomainSpell.name).toBe("Disperse into Air");
    expect(air.deities).toContain("Gozreh");
    expect(JSON.stringify(air)).not.toContain("Compendium.pf2e");
    expect(byName(domains, "Nothingness").aliases).toContain("void");
    for (const domain of domains) {
      expect(domain.id.startsWith("domain:"), domain.name).toBe(true);
      expect(domain.description.length, domain.name).toBeGreaterThan(0);
    }

    for (const cls of classes) {
      for (const group of cls.choiceGroups) {
        for (const option of group.options) {
          for (const skill of option.trainedSkills ?? []) {
            expect(skillIds.has(skill), `${cls.name}/${option.name} skill ${skill}`).toBe(true);
          }
        }
      }
    }
  });

  it("marks versatile heritages so every ancestry can select them", () => {
    const versatile = heritages.filter((heritage) => heritage.versatile);
    expect(versatile.length).toBeGreaterThanOrEqual(17);
    const aiuvarin = byName(heritages, "Aiuvarin");
    expect(aiuvarin.versatile).toBe(true);
    expect(aiuvarin.ancestry).toBe("");

    const ancestryNames = new Set(ancestries.map((ancestry) => ancestry.name.toLowerCase()));
    for (const heritage of heritages) {
      if (heritage.versatile) continue;
      expect(ancestryNames.has(heritage.ancestry.toLowerCase()), heritage.name).toBe(true);
    }
  });

  it("uses official ancestry values", () => {
    const dwarf = byName(ancestries, "Dwarf");
    expect(dwarf.hp).toBe(10);
    expect(dwarf.speed).toBe(20);
    expect(dwarf.vision).toBe("darkvision");
    expect(
      dwarf.boosts
        .filter((boost) => boost.fixed)
        .flatMap((boost) => boost.from)
        .sort()
    ).toEqual(["con", "wis"]);
    expect(dwarf.flaws).toEqual(["cha"]);

    const elf = byName(ancestries, "Elf");
    expect(elf.hp).toBe(6);
    expect(elf.speed).toBe(30);
    expect(elf.vision).toBe("lowLight");
    expect(elf.flaws).toEqual(["con"]);

    const merfolk = byName(ancestries, "Merfolk");
    expect(merfolk.otherSpeeds).toContainEqual({ type: "swim", value: 25 });
    const awakened = byName(ancestries, "Awakened Animal");
    expect(awakened.speed).toBe(0);
    expect(awakened.speedNote).toMatch(/heritage/i);
    expect(awakened.sizeChoices).toEqual(["tiny", "sm", "med", "lg"]);
    expect(awakened.hpBySize).toMatchObject({ tiny: 6, sm: 6, med: 8, lg: 10 });
    expect(byName(heritages, "Climbing Animal").speeds).toMatchObject({
      base: 20,
      other: [{ type: "climb", value: 20 }],
    });
    expect(byName(heritages, "Running Animal").speeds).toMatchObject({ base: 30 });
    const minotaur = byName(ancestries, "Minotaur");
    expect(minotaur.features.map((feature) => feature.name)).toContain("Horns (Minotaur)");

    expect(
      ancestries.every((ancestry) => ["normal", "lowLight", "darkvision"].includes(ancestry.vision))
    ).toBe(true);
  });

  it("uses official class chassis values", () => {
    const expected: Record<
      string,
      { hp: number; key: string[]; perception: number; saves: [number, number, number] }
    > = {
      Alchemist: { hp: 8, key: ["int"], perception: 1, saves: [2, 2, 1] },
      Barbarian: { hp: 12, key: ["str"], perception: 2, saves: [2, 1, 2] },
      Cleric: { hp: 8, key: ["wis"], perception: 1, saves: [1, 1, 2] },
      Fighter: { hp: 10, key: ["dex", "str"], perception: 2, saves: [2, 2, 1] },
      Monk: { hp: 10, key: ["dex", "str"], perception: 1, saves: [2, 2, 2] },
      Necromancer: { hp: 8, key: ["int"], perception: 1, saves: [2, 1, 1] },
      Wizard: { hp: 6, key: ["int"], perception: 1, saves: [1, 1, 2] },
    };
    for (const [name, values] of Object.entries(expected)) {
      const cls = byName(classes, name);
      expect(cls.hp, `${name} hp`).toBe(values.hp);
      expect(cls.keyAbility, `${name} key ability`).toEqual(values.key);
      expect(cls.perception, `${name} perception`).toBe(values.perception);
      expect(
        [cls.savingThrows.fortitude, cls.savingThrows.reflex, cls.savingThrows.will],
        `${name} saves`
      ).toEqual(values.saves);
    }

    const cleric = byName(classes, "Cleric");
    expect(cleric.trainedSkills).toMatchObject({ value: ["religion"], additional: 2 });
    expect(cleric.choiceGroups[0].options.map((option) => option.name).sort()).toEqual([
      "Battle Creed",
      "Cloistered Cleric",
      "Warpriest",
    ]);

    const fighter = byName(classes, "Fighter");
    expect(fighter.skillChoices).toEqual([
      {
        prompt: "Choose Acrobatics or Athletics",
        options: ["acrobatics", "athletics"],
        count: 1,
      },
    ]);
    expect(byName(classes, "Runesmith").skillChoices?.[0].options).toEqual([
      "arcana",
      "nature",
      "occultism",
      "religion",
    ]);

    const psychic = byName(classes, "Psychic");
    expect(psychic.keyAbility).toEqual(["int", "cha"]);

    const inventor = byName(classes, "Inventor");
    expect(
      inventor.features.find((feature) => feature.name === "Expert Overdrive")?.skillRanks
    ).toEqual({
      crafting: 2,
    });
    expect(
      inventor.features.find((feature) => feature.name === "Master Overdrive")?.skillRanks
    ).toEqual({
      crafting: 3,
    });

    const warpriest = cleric.choiceGroups[0].options.find((option) => option.name === "Warpriest")!;
    expect(
      warpriest.grantedFeatures?.some((feature) => feature.name === "First Doctrine (Warpriest)")
    ).toBe(true);
    expect(
      warpriest.grantedFeatures?.find((feature) => feature.name === "First Doctrine (Warpriest)")
        ?.proficiencies
    ).toMatchObject({ fortitude: { rank: 2 }, light: { rank: 1 }, medium: { rank: 1 } });
  });

  it("includes subclass-granted skill training", () => {
    const rogue = byName(classes, "Rogue");
    const thief = rogue.choiceGroups[0].options.find((option) => option.name === "Thief")!;
    expect(thief.trainedSkills).toContain("thievery");

    const druid = byName(classes, "Druid");
    const animal = druid.choiceGroups[0].options.find((option) => option.name === "Animal Order")!;
    expect(animal.trainedSkills).toContain("athletics");

    const investigator = byName(classes, "Investigator");
    const forensic = investigator.choiceGroups[0].options.find(
      (option) => option.name === "Forensic Medicine Methodology"
    )!;
    expect(forensic.trainedSkills).toContain("medicine");
  });

  it("captures background skill choices", () => {
    const hermit = byName(backgrounds, "Hermit");
    expect(hermit.skillChoices).toEqual([
      { prompt: "Select a skill.", options: ["nature", "occultism"], count: 1 },
    ]);

    const acolyte = byName(backgrounds, "Acolyte");
    expect(acolyte.trainedSkills).toEqual(["religion"]);
    expect(acolyte.lore).toEqual(["Scribing Lore"]);
    expect(acolyte.grantedFeats[0].name).toBe("Student of the Canon");

    const antiThrune = byName(backgrounds, "Anti-Thrune Saboteur");
    expect(antiThrune.featChoices[0].options.map((option) => option.name).sort()).toEqual([
      "Dirty Trick",
      "Lengthy Diversion",
    ]);

    const timeTraveler = byName(backgrounds, "Time Traveler");
    expect(timeTraveler.loreChoices).toEqual([
      { prompt: "Choose three Lore skills from your old time", options: [], count: 3 },
    ]);
    const concordance = byName(backgrounds, "Concordance Researcher");
    expect(concordance.loreChoices[0]).toMatchObject({ count: 4 });
    expect(concordance.loreChoices[0].options).toContain("Plane of Air Lore");

    const intentionallyEmpty = new Set([
      "Amnesiac",
      "Discarded Duplicate",
      "Harrow-Chosen",
      "Shielded Fortune",
    ]);
    for (const background of backgrounds) {
      const hasData =
        background.trainedSkills.length > 0 ||
        background.skillChoices.length > 0 ||
        background.lore.length > 0 ||
        background.loreChoices.length > 0;
      if (!hasData) {
        expect(
          intentionallyEmpty.has(background.name),
          `${background.name} has skill/Lore data`
        ).toBe(true);
      }
      for (const choice of background.loreChoices) {
        expect(choice.count, `${background.name} Lore choice count`).toBeGreaterThan(0);
      }
    }
  });

  it("uses official equipment values", () => {
    const longsword = byName(equipment, "Longsword");
    expect(longsword.price.cpTotal).toBe(100);
    expect(longsword.bulk).toBe(1);
    expect(longsword.weapon).toMatchObject({
      category: "martial",
      damage: { dice: 1, die: "d8", type: "slashing" },
    });

    const chainMail = byName(equipment, "Chain Mail");
    expect(chainMail.armor).toMatchObject({
      category: "medium",
      acBonus: 4,
      dexCap: 1,
      checkPenalty: -2,
      speedPenalty: -5,
      strength: 3,
    });

    const fullPlate = byName(equipment, "Full Plate");
    expect(fullPlate.armor).toMatchObject({
      category: "heavy",
      acBonus: 6,
      dexCap: 0,
      checkPenalty: -3,
      speedPenalty: -10,
      strength: 4,
    });
  });

  it("expands Foundry inline macros into readable text", () => {
    const textItems = [
      ...ancestries,
      ...backgrounds,
      ...classes,
      ...classFeatures,
      ...feats,
      ...spells,
      ...equipment,
      ...deities,
      ...actions,
    ];
    for (const item of textItems) {
      const description = "description" in item ? String(item.description ?? "") : "";
      expect(description, `${item.name} inline macro`).not.toContain("[[/");
      expect(description, `${item.name} UUID macro`).not.toContain("@UUID");
      expect(description, `${item.name} @Damage macro`).not.toContain("@Damage[");
      expect(description, `${item.name} @Check macro`).not.toContain("@Check[");
      expect(description, `${item.name} level macro`).not.toMatch(/\.(level|rank)\b/);
      expect(description, `${item.name} doubled check`).not.toMatch(/\bcheck\s+check\b/i);
    }

    const venom = byName(feats, "Disorienting Venom");
    expect(venom.description).toContain("Fortitude save");
    const party = byName(feats, "Keep the Party Going");
    expect(party.description).toContain("Performance check");
    expect(party.description).not.toContain("@self.level");
    const meltdown = byName(classFeatures, "Energetic Meltdown");
    expect(meltdown.description).toContain("damage equal to your level");
    const stimulator = byName(equipment, "Electromuscular Stimulator");
    expect(stimulator.description).toContain("Crafting check");
  });

  it("uses official bestiary values", () => {
    const goblin = byName(monsters, "Goblin Warrior");
    expect(goblin).toMatchObject({
      level: -1,
      hp: 6,
      ac: 16,
      fortitude: 5,
      reflex: 7,
      will: 3,
      perception: 2,
    });

    const zombie = byName(monsters, "Zombie Shambler");
    expect(zombie).toMatchObject({
      level: -1,
      hp: 20,
      ac: 12,
      fortitude: 6,
      reflex: 0,
      will: 2,
      perception: 0,
    });

    // Values confirmed against the Monster Core 2 entries; the Foundry export
    // had a shield HP value in place of the creature's HP and several drifted
    // statblocks.
    expect(byName(monsters, "Totum Font")).toMatchObject({ hp: 325 });
    expect(byName(monsters, "Adlet")).toMatchObject({ level: 9 });
    expect(byName(monsters, "Zebub")).toMatchObject({ hp: 45 });
    expect(byName(monsters, "Oread Guard")).toMatchObject({
      ac: 17,
      fortitude: 7,
      hp: 20,
      perception: 7,
      reflex: 6,
      will: 5,
    });
  });

  it("includes reference hazards, vehicles, familiars, and boons/curses", () => {
    expect(byName(hazards, "Armageddon Orb")).toMatchObject({
      level: 23,
      complexity: "simple",
    });
    expect(byName(vehicles, "Airship")).toMatchObject({
      level: 12,
      ac: 28,
      hp: 210,
      priceGp: 6000,
    });
    expect(byName(familiarAbilities, "Absorb Familiar").description).toContain("mark");
    expect(byName(boonsAndCurses, "Abadar - Major Boon")).toMatchObject({
      category: "boon",
      deity: "Abadar",
      tier: "major",
    });
  });

  it("includes the trait glossary and afflictions", () => {
    expect(byName(traits, "Aberration").description).toContain("beyond the planes");
    expect(byName(traits, "Abjuration").group).toContain("School");
    expect(byName(afflictions, "Bog Rot")).toMatchObject({
      category: "disease",
      level: 0,
      savingThrow: "DC 13 Fortitude",
      onset: "1 day",
    });
    expect(byName(afflictions, "Bog Rot").stages.length).toBeGreaterThan(1);
  });
});
