import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automationForEquipment } from "../src/shared/automation";
import { ITEM_EFFECTS, collectItemEffects, mergeEffects } from "../src/shared/effects";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type {
  Ancestry,
  Background,
  CharacterContext,
  ClassData,
  Equipment,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const ancestries = read<Ancestry>("ancestries.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const equipment = read<Equipment>("equipment.json");

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const fighter = byName(classes, "Fighter");
const healerGloves = byName(equipment, "Healer's Gloves");
const demonMask = byName(equipment, "Demon Mask");

function fighterDraft(trainedSkills: string[], worn: Equipment[] = []) {
  const draft = emptyCharacterDraft("Items Fighter");
  draft.ancestryId = human.id;
  draft.backgroundId = warrior.id;
  draft.classId = fighter.id;
  draft.keyAbility = "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.skills.trained = trainedSkills;
  draft.equipment = worn.map((item) => ({ itemId: item.id, quantity: 1, equipped: true }));
  return draft;
}

function context(items: Equipment[]): CharacterContext {
  return {
    ancestry: human,
    background: warrior,
    classData: fighter,
    feats: {},
    spells: {},
    equipment: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}

function skillMod(derived: ReturnType<typeof computeCharacter>, id: string): number {
  const skill = derived.skills.find((entry) => entry.id === id);
  if (!skill) throw new Error(`Missing skill ${id}`);
  return skill.mod;
}

describe("curated item effects", () => {
  it("takes the highest item bonus per skill", () => {
    expect(
      mergeEffects([
        { skillItemBonus: { medicine: 1 } },
        { skillItemBonus: { medicine: 2, crafting: 1 } },
      ])
    ).toEqual({ skillItemBonus: { medicine: 2, crafting: 1 } });
  });

  it("keeps curated ids in sync with the current compendium", () => {
    expect(ITEM_EFFECTS[healerGloves.id]).toEqual({ skillItemBonus: { medicine: 1 } });
    expect(ITEM_EFFECTS[demonMask.id]).toEqual({ skillItemBonus: { intimidation: 1 } });
  });

  it("labels curated items as partly automated", () => {
    expect(automationForEquipment(healerGloves).level).toBe("partial");
  });

  it("applies an equipped skill item's bonus to the sheet", () => {
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([healerGloves]));
    const withGloves = computeCharacter(
      fighterDraft(["medicine"], [healerGloves]),
      context([healerGloves])
    );
    expect(skillMod(withGloves, "medicine")).toBe(skillMod(baseline, "medicine") + 1);
  });

  it("ignores unequipped items", () => {
    const draft = fighterDraft(["medicine"]);
    draft.equipment = [{ itemId: healerGloves.id, quantity: 1, equipped: false }];
    const baseline = computeCharacter(fighterDraft(["medicine"]), context([healerGloves]));
    const unequipped = computeCharacter(draft, context([healerGloves]));
    expect(skillMod(unequipped, "medicine")).toBe(skillMod(baseline, "medicine"));
  });
});
