import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyBackgroundGrantOverrides } from "../src/shared/backgroundGrants";
import { backgrounds as serverBackgrounds } from "../src/server/compendium";
import { SKILLS } from "../src/shared/types";
import type { Background, Feat } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const backgrounds = read<Background>("backgrounds.json");
const feats = read<Feat>("feats.json");
const featById = new Map(feats.map((feat) => [feat.id, feat]));
const skillIds = new Set(SKILLS.map((skill) => skill.id));

function byName(name: string): Background {
  const found = backgrounds.find((background) => background.name === name);
  if (!found) throw new Error(`Missing background ${name}`);
  return found;
}

function applied(name: string): Background {
  return applyBackgroundGrantOverrides(byName(name))!;
}

const changedNames = backgrounds
  .filter((background) => applyBackgroundGrantOverrides(background) !== background)
  .map((background) => background.name)
  .sort();

describe("background grant overrides", () => {
  it("only patches the backgrounds whose grants still exist in prose", () => {
    expect(changedNames).toEqual(
      [
        "Beast Seeker",
        "Brastlewark Student",
        "Conservator",
        "Dedicated Delver",
        "Dreams of Vengeance",
        "Glory Hound",
        "Historical Reenactor",
        "Lost Loved One",
        "Obari Wanderer",
        "Sense of Belonging",
        "The Hunted",
        "Total Power",
        "Wanderlust",
        "Wish for Riches",
      ].sort()
    );
  });

  it("adds missing skill choices without replacing existing feat choices", () => {
    const beast = applied("Beast Seeker");
    expect(beast.skillChoices).toEqual([
      {
        prompt: "Choose Athletics or Thievery",
        options: ["athletics", "thievery"],
        count: 1,
      },
    ]);
    expect(beast.lore).toEqual(["Legendary Beast Lore"]);
    expect(beast.grantedFeats).toEqual([]);
    expect(beast.featChoices[0]?.options.map((feat) => feat.name)).toEqual([
      "Titan Wrestler",
      "Dirty Trick",
    ]);

    for (const [name, expected] of [
      ["Glory Hound", ["intimidation", "performance"]],
      ["Historical Reenactor", ["performance", "society"]],
      ["Obari Wanderer", ["acrobatics", "survival"]],
      ["Dedicated Delver", ["athletics", "survival"]],
    ] as const) {
      expect(applied(name).skillChoices[0]?.options).toEqual(expected);
    }
  });

  it("turns conditional starting feats into structured feat choices", () => {
    for (const [name, feats] of [
      ["Dedicated Delver", ["Combat Climber", "Terrain Expertise"]],
      ["Brastlewark Student", ["Recognize Spell", "Crafter's Appraisal"]],
      ["Conservator", ["Quick Repair", "Assurance"]],
      ["The Hunted", ["Terrain Expertise", "Terrain Stalker"]],
    ] as const) {
      const background = applied(name);
      expect(background.grantedFeats).toEqual([]);
      expect(background.featChoices[0]?.options.map((feat) => feat.name)).toEqual(feats);
    }
  });

  it("keeps fixed feats alongside deviant feat choices", () => {
    const dreams = applied("Dreams of Vengeance");
    expect(dreams.grantedFeats.map((feat) => feat.name)).toEqual(["Titan Wrestler"]);
    expect(dreams.featChoices[0]?.options.map((feat) => feat.name)).toEqual([
      "Blasting Beams",
      "Titan Swing",
    ]);

    const lost = applied("Lost Loved One");
    expect(lost.grantedFeats.map((feat) => feat.name)).toEqual(["Multilingual"]);
    expect(lost.featChoices[0]?.options.map((feat) => feat.name)).toEqual([
      "Draining Touch",
      "Ghostly Grasp (Deviant)",
    ]);
  });

  it("references real skills and feats without duplicating fixed grants", () => {
    for (const name of changedNames) {
      const background = applied(name);
      expect(new Set(background.trainedSkills).size).toBe(background.trainedSkills.length);
      expect(new Set(background.lore).size).toBe(background.lore.length);
      for (const group of background.skillChoices) {
        expect(group.options.length).toBeGreaterThanOrEqual(group.count);
        for (const skill of group.options) expect(skillIds.has(skill)).toBe(true);
      }
      for (const granted of background.grantedFeats) {
        expect(granted.id && featById.has(granted.id)).toBe(true);
      }
      for (const group of background.featChoices) {
        expect(group.options.length).toBeGreaterThanOrEqual(group.count);
        for (const option of group.options) {
          expect(featById.has(option.id)).toBe(true);
          expect(featById.get(option.id)?.name).toBe(option.name);
        }
      }
    }
  });

  it("serves resolved backgrounds from the server compendium", () => {
    const glory = serverBackgrounds.find((background) => background.id === "bg:Lue29rc3ZDt64iyL");
    expect(glory?.skillChoices[0]?.options).toEqual(["intimidation", "performance"]);
    const delver = serverBackgrounds.find((background) => background.id === "bg:a57iBUZBQtXWZc36");
    expect(delver?.grantedFeats).toEqual([]);
    expect(delver?.featChoices).toHaveLength(1);
  });
});
