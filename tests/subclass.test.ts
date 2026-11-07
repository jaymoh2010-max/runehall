import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type { Ancestry, Background, CharacterContext, ClassData } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const human = byName(read<Ancestry>("ancestries.json"), "Human");
const warrior = byName(read<Background>("backgrounds.json"), "Warrior");
const summoner = byName(read<ClassData>("classes.json"), "Summoner");
const eidolonGroup = summoner.choiceGroups.find((group) => group.tag === "summoner-eidolon");
const aberrant = eidolonGroup?.options.find((option) => option.name === "Aberrant Eidolon");

function summonerDraft() {
  const draft = emptyCharacterDraft("Summoner");
  draft.ancestryId = human.id;
  draft.backgroundId = warrior.id;
  draft.classId = summoner.id;
  draft.keyAbility = "cha";
  draft.boosts.ancestry = ["cha", "dex"];
  draft.boosts.background = ["cha", "con"];
  draft.boosts.free = ["cha", "dex", "con", "wis"];
  if (eidolonGroup && aberrant) draft.classChoices[eidolonGroup.key] = [aberrant.id];
  return draft;
}

const context: CharacterContext = {
  ancestry: human,
  background: warrior,
  classData: summoner,
  feats: {},
  spells: {},
  equipment: {},
};

describe("subclass structured effects", () => {
  it("merges eidolon-granted languages into the sheet", () => {
    if (!eidolonGroup || !aberrant) throw new Error("Summoner eidolon data missing");
    const derived = computeCharacter(summonerDraft(), context);
    expect(derived.languages).toContain("Aklo");
  });
});
