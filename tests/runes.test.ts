import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  attachRuneIds,
  isHandwrapsOfMightyBlows,
  propertyRuneSlots,
  runeCategory,
  runeUsageForTarget,
  shieldRuneBonus,
  strikingDiceForRune,
} from "../src/shared/runes";
import type { Equipment } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const equipment = read<Equipment>("equipment.json");
const byName = (name: string) => {
  const item = equipment.find((entry) => entry.name === name);
  if (!item) throw new Error(`Missing equipment ${name}`);
  return item;
};

describe("rune helpers", () => {
  it("tracks mythic striking as five damage dice", () => {
    expect(strikingDiceForRune(byName("Mythic Striking"))).toBe(5);
    expect(strikingDiceForRune(byName("Striking (Major)"))).toBe(4);
    expect(strikingDiceForRune(byName("Striking (Greater)"))).toBe(3);
    expect(strikingDiceForRune(byName("Striking"))).toBe(2);
  });

  it("replaces fundamental runes but appends property runes", () => {
    const potency1 = byName("Weapon Potency (+1)");
    const potency2 = byName("Weapon Potency (+2)");
    const flaming = byName("Flaming");
    const map = Object.fromEntries([potency1, potency2, flaming].map((item) => [item.id, item]));
    const afterPotency = attachRuneIds([], potency1, map);
    const upgraded = attachRuneIds(afterPotency, potency2, map);
    expect(upgraded).toEqual([potency2.id]);
    const withProperty = attachRuneIds(upgraded, flaming, map);
    expect(withProperty).toEqual([potency2.id, flaming.id]);
    expect(propertyRuneSlots(withProperty, map)).toBe(2);
  });

  it("treats handwraps of mighty blows as a weapon rune target", () => {
    const handwraps = byName("Handwraps of Mighty Blows");
    expect(isHandwrapsOfMightyBlows(handwraps)).toBe(true);
    expect(runeUsageForTarget(handwraps)).toBe("etched-onto-a-weapon");
    expect(runeUsageForTarget(byName("Chain Mail"))).toBe("etched-onto-armor");
  });

  it("parses reinforcing rune durability and recognizes its category", () => {
    const rune = byName("Reinforcing Rune (Minor)");
    expect(runeCategory(rune)).toBe("shield");
    expect(shieldRuneBonus([rune.id], { [rune.id]: rune })).toMatchObject({
      hardness: 3,
      hp: 44,
      maxHardness: 8,
      maxHp: 64,
    });
  });
});
