import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationForFeat } from "../src/shared/automation";
import { FEAT_EFFECTS, collectFeatEffects, mergeEffects } from "../src/shared/effects";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type { Ancestry, Background, CharacterContext, ClassData, Feat } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const feats = read<Feat>("feats.json");
const ancestries = read<Ancestry>("ancestries.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");

const byName = <T extends { name: string }>(items: T[], name: string): T => {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};

const toughness = byName(feats, "Toughness");
const fleet = byName(feats, "Fleet");
const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const fighter = byName(classes, "Fighter");

function fighterDraft() {
  const draft = emptyCharacterDraft("Effects Fighter");
  draft.ancestryId = human.id;
  draft.backgroundId = warrior.id;
  draft.classId = fighter.id;
  draft.keyAbility = "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.skills.trained = ["athletics", "acrobatics"];
  return draft;
}

function context(featMap: Record<string, Feat>): CharacterContext {
  return {
    ancestry: human,
    background: warrior,
    classData: fighter,
    feats: featMap,
    spells: {},
    equipment: {},
  };
}

describe("curated feat effects", () => {
  it("merges numeric and list modifiers", () => {
    expect(mergeEffects([{ hpPerLevel: 1 }, { speed: 5 }, { senses: ["darkvision"] }])).toEqual({
      hpPerLevel: 1,
      speed: 5,
      senses: ["darkvision"],
    });
  });

  it("collects modifiers from feat ids", () => {
    expect(collectFeatEffects([toughness.id, fleet.id])).toEqual({
      hpPerLevel: 1,
      speed: 5,
    });
  });

  it("keeps the curated ids in sync with the current compendium", () => {
    expect(FEAT_EFFECTS[toughness.id]).toEqual({ hpPerLevel: 1 });
    expect(FEAT_EFFECTS[fleet.id]).toEqual({ speed: 5 });
  });

  it("labels curated feats as fully automated", () => {
    expect(automationForFeat(toughness).level).toBe("full");
    expect(automationForFeat(fleet).level).toBe("full");
  });

  it("applies Toughness HP and Fleet speed to the derived sheet", () => {
    const baseline = computeCharacter(fighterDraft(), context({}));
    const applied = computeCharacter(
      fighterDraft(),
      context({ [toughness.id]: toughness, [fleet.id]: fleet })
    );
    expect(applied.maxHp).toBe(baseline.maxHp + 1);
    expect(applied.speed).toBe(baseline.speed + 5);
  });
});
