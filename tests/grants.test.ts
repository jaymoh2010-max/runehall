import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { automationForFeat } from "../src/shared/automation";
import { featGrant } from "../src/shared/effects";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type { Ancestry, Background, ClassData, Feat } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const feats = read<Feat>("feats.json");
const ancestries = read<Ancestry>("ancestries.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const fighter = byName(classes, "Fighter");
const ancestralParagon = byName(feats, "Ancestral Paragon");
const naturalAmbition = byName(feats, "Natural Ambition");
const toughness = byName(feats, "Toughness");

function draft() {
  const character = emptyCharacterDraft("Granted Feat");
  character.ancestryId = human.id;
  character.backgroundId = warrior.id;
  character.classId = fighter.id;
  character.level = 3;
  character.keyAbility = "str";
  character.boosts.ancestry = ["str", "dex"];
  character.boosts.background = ["str", "con"];
  character.boosts.free = ["str", "dex", "con", "wis"];
  character.feats.general["3"] = ancestralParagon.id;
  return character;
}

describe("granted feats", () => {
  it("resolves a chosen granted feat into the context", () => {
    const character = draft();
    character.featChoices[ancestralParagon.id] = [naturalAmbition.id];
    const context = contextForDraft(character);
    expect(context.feats[naturalAmbition.id]?.name).toBe("Natural Ambition");
    expect(context.feats[ancestralParagon.id]?.name).toBe("Ancestral Paragon");
    const derived = computeCharacter(character, context);
    expect(derived.grantedFeats.some((feat) => feat.id === naturalAmbition.id)).toBe(true);
    expect(automationForFeat(ancestralParagon).level).toBe("full");
  });

  it("ignores a granted feat outside the allowed pool", () => {
    const character = draft();
    character.featChoices[ancestralParagon.id] = [toughness.id];
    const context = contextForDraft(character);
    expect(context.feats[toughness.id]).toBeUndefined();
  });

  it("warns when the granted feat choice is missing", () => {
    const character = draft();
    const derived = computeCharacter(character, contextForDraft(character));
    expect(
      derived.validation.some(
        (issue) => issue.step === "feats" && issue.message.includes("Ancestral Paragon")
      )
    ).toBe(true);
  });

  it("exposes the grant definition", () => {
    expect(featGrant(ancestralParagon.id)?.category).toBe("ancestry");
    expect(featGrant(ancestralParagon.id)?.level).toBe(1);
  });

  it("puts a background starting feat into the character context", () => {
    const martialDisciple = byName(backgrounds, "Martial Disciple");
    const catFall = byName(feats, "Cat Fall");
    const character = draft();
    character.backgroundId = martialDisciple.id;
    character.backgroundFeat = catFall.id;
    const context = contextForDraft(character);
    expect(context.feats[catFall.id]?.name).toBe("Cat Fall");
    const derived = computeCharacter(character, context);
    expect(derived.grantedFeats.some((feat) => feat.id === catFall.id)).toBe(true);
  });
});
