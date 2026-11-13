import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationForFeat } from "../src/shared/automation";
import {
  FEAT_EFFECTS,
  collectFeatChoiceEffects,
  collectFeatEffects,
  featChoice,
  mergeEffects,
} from "../src/shared/effects";
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
const incredibleInitiative = byName(feats, "Incredible Initiative");
const untrainedImprovisation = byName(feats, "Untrained Improvisation");
const cannyAcumen = byName(feats, "Canny Acumen");
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

  it("applies Incredible Initiative as a separate initiative bonus", () => {
    const baseline = computeCharacter(fighterDraft(), context({}));
    const applied = computeCharacter(
      fighterDraft(),
      context({ [incredibleInitiative.id]: incredibleInitiative })
    );
    expect(applied.initiative).toBe(applied.perception + 2);
    expect(applied.initiative).toBe(baseline.initiative + 2);
    expect(applied.perception).toBe(baseline.perception);
  });

  it("applies Untrained Improvisation to untrained skill checks", () => {
    const baselineDraft = fighterDraft();
    baselineDraft.level = 5;
    const appliedDraft = fighterDraft();
    appliedDraft.level = 5;
    const baseline = computeCharacter(baselineDraft, context({}));
    const applied = computeCharacter(
      appliedDraft,
      context({ [untrainedImprovisation.id]: untrainedImprovisation })
    );
    const baselineArcana = baseline.skills.find((skill) => skill.id === "arcana");
    const appliedArcana = applied.skills.find((skill) => skill.id === "arcana");
    expect(baselineArcana?.rank).toBe(0);
    expect(appliedArcana?.rank).toBe(0);
    expect(appliedArcana?.mod).toBe((baselineArcana?.mod ?? 0) + Math.floor(5 / 2));
    expect(applied.initiative).toBe(baseline.initiative);
  });

  it("labels the new curated feats as fully automated", () => {
    expect(automationForFeat(incredibleInitiative).level).toBe("full");
    expect(automationForFeat(untrainedImprovisation).level).toBe("full");
  });

  it("applies a choice-driven feat to the chosen proficiency", () => {
    expect(featChoice(cannyAcumen.id)?.options.map((option) => option.id)).toContain("will");
    expect(collectFeatChoiceEffects({ [cannyAcumen.id]: ["will"] }, [cannyAcumen.id], 1)).toEqual({
      proficiencyRanks: { will: 2 },
    });

    const draft = fighterDraft();
    draft.featChoices[cannyAcumen.id] = ["will"];
    const applied = computeCharacter(draft, context({ [cannyAcumen.id]: cannyAcumen }));
    expect(applied.prof.will).toBe(2);
    expect(applied.saves.will).toBeGreaterThan(
      computeCharacter(fighterDraft(), context({})).saves.will
    );
  });

  it("raises a choice-driven proficiency to master at 17th level", () => {
    const draft = fighterDraft();
    draft.level = 17;
    draft.featChoices[cannyAcumen.id] = ["will"];
    const applied = computeCharacter(draft, context({ [cannyAcumen.id]: cannyAcumen }));
    expect(applied.prof.will).toBe(3);
  });

  it("warns when a choice-driven feat has no choice", () => {
    const derived = computeCharacter(fighterDraft(), context({ [cannyAcumen.id]: cannyAcumen }));
    expect(
      derived.validation.some(
        (validation) => validation.step === "feats" && validation.message.includes("Canny Acumen")
      )
    ).toBe(true);
    expect(automationForFeat(cannyAcumen).level).toBe("full");
  });
});
