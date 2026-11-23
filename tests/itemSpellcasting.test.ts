import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMagicWand,
  isSpellScroll,
  scrollSpellRank,
  wandSpellRank,
} from "../src/shared/itemSpellcasting";
import type { Equipment } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const equipment = read<Equipment>("equipment.json");

describe("scroll spellcasting", () => {
  it("recognizes generic scrolls and their ranks", () => {
    for (const rank of [1, 3, 5, 10]) {
      const label = `${rank}${rank === 1 ? "st" : rank === 3 ? "rd" : "th"}-rank Spell`;
      const item = equipment.find((entry) => entry.name === `Scroll of ${label}`)!;
      expect(item, label).toBeTruthy();
      expect(isSpellScroll(item)).toBe(true);
      expect(scrollSpellRank(item)).toBe(rank);
    }
  });

  it("falls back to the scroll's item level when the name is unusual", () => {
    expect(
      scrollSpellRank({
        name: "Old Scroll",
        traits: ["scroll"],
        level: 7,
      })
    ).toBe(4);
  });

  it("ignores non-scroll items", () => {
    const sword = equipment.find((entry) => entry.name === "Longsword")!;
    expect(isSpellScroll(sword)).toBe(false);
    expect(scrollSpellRank(sword)).toBeNull();
    expect(scrollSpellRank(null)).toBeNull();
  });
});

describe("wand spellcasting", () => {
  it("recognizes generic Magic Wands and their ranks", () => {
    for (const rank of [1, 3, 5, 9]) {
      const label = `${rank}${rank === 1 ? "st" : rank === 3 ? "rd" : "th"}-Rank Spell`;
      const item = equipment.find((entry) => entry.name === `Magic Wand (${label})`)!;
      expect(item, label).toBeTruthy();
      expect(isMagicWand(item)).toBe(true);
      expect(wandSpellRank(item)).toBe(rank);
    }
  });

  it("leaves specific wands and other items to manual resolution", () => {
    const specific = equipment.find((entry) => entry.name === "Wand of Caustic Effluence")!;
    expect(isMagicWand(specific)).toBe(false);
    expect(wandSpellRank(specific)).toBeNull();

    const sword = equipment.find((entry) => entry.name === "Longsword")!;
    expect(isMagicWand(sword)).toBe(false);
    expect(wandSpellRank(sword)).toBeNull();
    expect(wandSpellRank(null)).toBeNull();
  });
});
