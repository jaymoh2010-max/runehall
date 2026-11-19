import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { CLASS_GRANTS, selectedClassGrants } from "../src/shared/classGrants";
import {
  casterTraditionFor,
  computeCharacter,
  emptyCharacterDraft,
  spellRepertoireLimits,
} from "../src/shared/rules";
import type { Ancestry, Background, ClassData, Feat, Heritage, Spell } from "../src/shared/types";

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
const spells = read<Spell>("spells.json");

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const druid = byName(classes, "Druid");
const bard = byName(classes, "Bard");
const wizard = byName(classes, "Wizard");
const cleric = byName(classes, "Cleric");
const sorcerer = byName(classes, "Sorcerer");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Class Grant Test");
  draft.ancestryId = human.id;
  draft.heritageId = byName(heritages, "Skilled Human").id;
  draft.backgroundId = warrior.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.featChoices[byName(heritages, "Skilled Human").id] = ["stealth"];
  return draft;
}

function chooseOption(draft: ReturnType<typeof draftFor>, classData: ClassData, optionId: string) {
  const group = classData.choiceGroups.find((entry) =>
    entry.options.some((option) => option.id === optionId)
  );
  if (!group) throw new Error(`Missing choice group for ${optionId}`);
  draft.classChoices[group.key] = [optionId];
}

describe("class-choice grants", () => {
  it("keeps every curated grant resolvable in the compendium", () => {
    for (const [optionId, grant] of Object.entries(CLASS_GRANTS)) {
      expect(optionId.startsWith("cf:")).toBe(true);
      for (const item of grant.feats ?? []) {
        expect(feats.some((feat) => feat.id === item.id && feat.name === item.name)).toBe(true);
      }
      for (const item of grant.spells ?? []) {
        const spell = spells.find((entry) => entry.id === item.id);
        expect(spell, `${item.name} (${item.id})`).toBeTruthy();
        expect(spell!.rank).toBe(item.rank);
        if (item.kind === "focus") expect(spell!.traits).toContain("focus");
      }
    }
  });

  it("grants the Druid order feat and focus spell without using a feat slot", () => {
    const draft = draftFor(druid);
    chooseOption(draft, druid, "cf:POBvoXifa9HaejAg");
    const context = contextForDraft(draft);
    const grants = selectedClassGrants(draft, druid);
    expect(grants.feats.map((feat) => feat.name)).toContain("Animal Companion");
    expect(grants.spells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Heal Animal", kind: "focus", rank: 1 }),
      ])
    );
    expect(context.feats["feat:f2Pl5dWEL9ZvEyI1"]?.name).toBe("Animal Companion");
    expect(context.spells["spell:Zmh4ynfnCtwKeAYl"]?.name).toBe("Heal Animal");

    const derived = computeCharacter(draft, context);
    expect(derived.grantedFeats.some((feat) => feat.name === "Animal Companion")).toBe(true);
    expect(derived.grantedSpells.some((spell) => spell.name === "Heal Animal")).toBe(true);
    expect(derived.selectedFeats.some((feat) => feat.name === "Animal Companion")).toBe(false);
    expect(derived.focusPointsMax).toBe(1);
  });

  it("keeps a Bard muse spell in the repertoire, not the focus pool", () => {
    const draft = draftFor(bard);
    chooseOption(draft, bard, "cf:4ripp6EfdVpS0d60");
    const grants = selectedClassGrants(draft, bard);
    expect(grants.feats.map((feat) => feat.name)).toContain("Bardic Lore");
    expect(grants.spells).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Sure Strike", kind: "repertoire" })])
    );
    expect(spellRepertoireLimits(bard, 1)).toEqual({ cantrips: 5, ranks: [2] });
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells.find((spell) => spell.name === "Sure Strike")?.kind).toBe(
      "repertoire"
    );
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants a Wizard school's initial focus spell", () => {
    const draft = draftFor(wizard);
    chooseOption(draft, wizard, "cf:E4GZDMn4DYk6qSEV");
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Force Bolt", kind: "focus", rank: 1 }),
      ])
    );
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants Cleric doctrine feats and only Cloistered Cleric's focus floor", () => {
    const cloistered = draftFor(cleric);
    chooseOption(cloistered, cleric, "cf:ZZzLMOUAtBVgV1DF");
    const cloisteredDerived = computeCharacter(cloistered, contextForDraft(cloistered));
    expect(cloisteredDerived.grantedFeats.map((feat) => feat.name)).toContain("Domain Initiate");
    expect(cloisteredDerived.focusPointsMax).toBe(1);

    const warpriest = draftFor(cleric);
    chooseOption(warpriest, cleric, "cf:0Aocw3igLwna9cjp");
    const warpriestDerived = computeCharacter(warpriest, contextForDraft(warpriest));
    expect(warpriestDerived.grantedFeats.map((feat) => feat.name)).toContain("Shield Block");
    expect(warpriestDerived.focusPointsMax).toBe(0);
  });

  it("grants a Sorcerer bloodline focus spell and derives its tradition", () => {
    const draft = draftFor(sorcerer);
    chooseOption(draft, sorcerer, "cf:3qqvnC2U8W26yae7");
    expect(casterTraditionFor(draft, sorcerer)).toBe("occult");
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Tentacular Limbs", kind: "focus", rank: 1 }),
      ])
    );
    expect(derived.focusPointsMax).toBe(1);
    expect(
      derived.validation.some((issue) => issue.message.includes("Choose your magical tradition"))
    ).toBe(false);
  });
});
