import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  HERITAGE_MECHANICS,
  heritageChosenFeatId,
  heritageFeatTraits,
  heritageLanguageOptions,
  heritageNotes,
  heritageSenseList,
} from "../src/shared/heritage";
import {
  computeCharacter,
  emptyCharacterDraft,
  grantedTrainedSkills,
  normalizeCharacterDraft,
} from "../src/shared/rules";
import type { Ancestry, Background, ClassData, Feat, Heritage } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const feats = read<Feat>("feats.json");

const human = byName(ancestries, "Human");
const elf = byName(ancestries, "Elf");
const warrior = byName(backgrounds, "Warrior");
const fighter = byName(classes, "Fighter");
const wizard = byName(classes, "Wizard");
const skilledHuman = byName(heritages, "Skilled Human");
const versatileHuman = byName(heritages, "Versatile Human");
const ancientElf = byName(heritages, "Ancient Elf");
const aiuvarin = byName(heritages, "Aiuvarin");
const nephilim = byName(heritages, "Nephilim");
const dragonblood = byName(heritages, "Dragonblood");
const toughness = byName(feats, "Toughness");
const fighterDedication = byName(feats, "Fighter Dedication");

function draftFor(ancestry: Ancestry, heritage: Heritage, klass = fighter) {
  const draft = emptyCharacterDraft("Heritage Test");
  draft.ancestryId = ancestry.id;
  draft.heritageId = heritage.id;
  draft.backgroundId = warrior.id;
  draft.classId = klass.id;
  draft.keyAbility = "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  return draft;
}

describe("heritage mechanics", () => {
  it("keeps the curated table in sync with the compendium", () => {
    for (const [id, mechanics] of Object.entries(HERITAGE_MECHANICS)) {
      expect(byName(heritages, mechanics.name).id).toBe(id);
    }
  });

  it("trains the Skilled Human choice and upgrades it at level 5", () => {
    const draft = draftFor(human, skilledHuman);
    draft.featChoices[skilledHuman.id] = ["stealth"];
    const context = contextForDraft(draft);
    expect(grantedTrainedSkills(draft, context).has("stealth")).toBe(true);
    const levelOne = computeCharacter(draft, context);
    expect(levelOne.skills.find((skill) => skill.id === "stealth")?.rank).toBe(1);

    draft.level = 5;
    const levelFive = computeCharacter(draft, contextForDraft(draft));
    expect(levelFive.skills.find((skill) => skill.id === "stealth")?.rank).toBe(2);

    const missing = draftFor(human, skilledHuman);
    expect(
      computeCharacter(missing, contextForDraft(missing)).validation.some(
        (issue) => issue.step === "skills" && issue.message.includes("Skilled Human")
      )
    ).toBe(true);
  });

  it("grants a Versatile Human general feat without using a feat slot", () => {
    const draft = draftFor(human, versatileHuman);
    draft.featChoices[versatileHuman.id] = [toughness.id];
    const context = contextForDraft(draft);
    expect(context.feats[toughness.id]?.name).toBe("Toughness");
    const derived = computeCharacter(draft, context);
    expect(derived.grantedFeats.some((feat) => feat.id === toughness.id)).toBe(true);
    expect(derived.selectedFeats.some((feat) => feat.id === toughness.id)).toBe(false);
    expect(derived.maxHp).toBe(
      computeCharacter(
        draftFor(human, versatileHuman),
        contextForDraft(draftFor(human, versatileHuman))
      ).maxHp + 1
    );

    const missing = draftFor(human, versatileHuman);
    expect(
      computeCharacter(missing, contextForDraft(missing)).validation.some(
        (issue) => issue.step === "feats" && issue.message.includes("Versatile Human")
      )
    ).toBe(true);
  });

  it("grants an Ancient Elf dedication from another class", () => {
    const draft = draftFor(elf, ancientElf, wizard);
    draft.keyAbility = "int";
    draft.featChoices[ancientElf.id] = [fighterDedication.id];
    const context = contextForDraft(draft);
    expect(heritageChosenFeatId(draft, ancientElf)).toBe(fighterDedication.id);
    expect(context.feats[fighterDedication.id]?.name).toBe("Fighter Dedication");
    const derived = computeCharacter(draft, context);
    expect(derived.grantedFeats.some((feat) => feat.id === fighterDedication.id)).toBe(true);
    expect(
      derived.validation.some((issue) => issue.message.includes("not available to Wizard"))
    ).toBe(false);
    expect(
      derived.validation.some((issue) => issue.message.includes("not a valid Ancient Elf choice"))
    ).toBe(false);
  });

  it("adds versatile heritage traits and vision without duplicating ancestry senses", () => {
    expect(heritageFeatTraits(aiuvarin, human)).toEqual(
      expect.arrayContaining(["human", "humanoid", "aiuvarin", "elf"])
    );
    expect(heritageSenseList(aiuvarin, human)).toEqual(["lowLight"]);
    expect(heritageSenseList(nephilim, human)).toEqual(["lowLight"]);
    expect(heritageSenseList(nephilim, elf)).toEqual(["darkvision"]);

    const derived = computeCharacter(
      draftFor(human, aiuvarin),
      contextForDraft(draftFor(human, aiuvarin))
    );
    expect(derived.senses).toContain("lowLight");
  });

  it("keeps Dragonblood's tracking notes and language option without granting low-light vision", () => {
    expect(heritageSenseList(dragonblood, human)).toEqual([]);
    expect(heritageLanguageOptions(dragonblood)).toContain("draconic");
    expect(heritageNotes(dragonblood).some((note) => note.includes("fear effect"))).toBe(true);
  });

  it("rejects a non-versatile heritage from the wrong ancestry", () => {
    const draft = draftFor(elf, skilledHuman);
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some(
        (issue) => issue.step === "heritage" && issue.message.includes("not available to Elf")
      )
    ).toBe(true);
  });

  it("preserves heritage choices through draft normalization", () => {
    const draft = normalizeCharacterDraft({
      ...draftFor(human, skilledHuman),
      featChoices: { [skilledHuman.id]: ["stealth"] },
    });
    expect(draft.featChoices[skilledHuman.id]).toEqual(["stealth"]);
  });
});
