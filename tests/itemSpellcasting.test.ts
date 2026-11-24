import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flexibleWandRank,
  isMagicWand,
  isSpellScroll,
  scrollSpellRank,
  specificWandSpell,
  staffSpells,
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

describe("specific wands", () => {
  it("extracts fixed spells and their cast ranks", () => {
    const fireballs = equipment.find(
      (entry) => entry.name === "Wand of Smoldering Fireballs (3rd-Rank Spell)"
    )!;
    expect(specificWandSpell(fireballs)).toEqual({ name: "Fireball", rank: 3 });

    const darkness = equipment.find(
      (entry) => entry.name === "Wand of Hopeless Night (4th-Rank Spell)"
    )!;
    expect(specificWandSpell(darkness)).toEqual({ name: "Darkness", rank: 4 });

    const chokingMist = equipment.find(
      (entry) => entry.name === "Wand of Choking Mist (4th-Rank)"
    )!;
    expect(specificWandSpell(chokingMist)).toEqual({ name: "Cinder Swarm", rank: 4 });

    const arboreal = equipment.find((entry) => entry.name === "Arboreal Wand (Rank 2)")!;
    expect(specificWandSpell(arboreal)).toEqual({ name: "Heal", rank: 2 });

    const splintered = equipment.find(
      (entry) => entry.name === "Wand Of Splintered Sorrows (Rank 2)"
    )!;
    expect(specificWandSpell(splintered)).toEqual({ name: "Splinter Volley", rank: 2 });

    const acid = equipment.find((entry) => entry.name === "Wand of Noisome Acid (2nd-Rank)")!;
    expect(specificWandSpell(acid)).toEqual({ name: "Acid Grip", rank: 2 });
  });

  it("leaves flexible and ambiguous wands manual", () => {
    const widening = equipment.find((entry) => entry.name === "Wand of Widening (1st-Rank Spell)")!;
    expect(specificWandSpell(widening)).toBeNull();

    const generic = equipment.find((entry) => entry.name === "Magic Wand (1st-Rank Spell)")!;
    expect(specificWandSpell(generic)).toBeNull();

    const cane = equipment.find((entry) => entry.name === "Wand Cane")!;
    expect(specificWandSpell(cane)).toBeNull();

    expect(specificWandSpell(null)).toBeNull();
  });

  it("returns a null rank when the name and prose do not state one", () => {
    const caustic = equipment.find((entry) => entry.name === "Wand of Caustic Effluence")!;
    expect(specificWandSpell(caustic)).toEqual({ name: "Grease", rank: null });
  });
});

describe("flexible wands", () => {
  it("recognizes wands that cast a chosen spell at a listed rank", () => {
    const cases: [string, number][] = [
      ["Wand of Continuation (3rd-Rank Spell)", 3],
      ["Wand of Hybrid Form (2nd-rank)", 2],
      ["Wand of Legerdemain (1st-rank)", 1],
      ["Wand of Mercy (9th-rank)", 9],
      ["Wand of Reaching (5th-Rank)", 5],
      ["Wand of Widening (1st-Rank Spell)", 1],
    ];
    for (const [name, rank] of cases) {
      const item = equipment.find((entry) => entry.name === name)!;
      expect(item, name).toBeTruthy();
      expect(flexibleWandRank(item), name).toBe(rank);
      expect(specificWandSpell(item), name).toBeNull();
    }
  });

  it("recognizes trait-restricted Cyrusian wands as flexible", () => {
    const cyrusian = equipment.find((entry) => entry.name === "Cyrusian Wand (1st-Rank Spell)")!;
    expect(flexibleWandRank(cyrusian)).toBe(1);
    expect(specificWandSpell(cyrusian)).toBeNull();
  });

  it("does not treat fixed or generic wands as flexible", () => {
    const fireballs = equipment.find(
      (entry) => entry.name === "Wand of Smoldering Fireballs (3rd-Rank Spell)"
    )!;
    expect(flexibleWandRank(fireballs)).toBeNull();

    const generic = equipment.find((entry) => entry.name === "Magic Wand (1st-Rank Spell)")!;
    expect(flexibleWandRank(generic)).toBeNull();

    const cane = equipment.find((entry) => entry.name === "Wand Cane")!;
    expect(flexibleWandRank(cane)).toBeNull();
    expect(flexibleWandRank(null)).toBeNull();
  });
});

describe("staff spell lists", () => {
  it("reads cantrips and ranked spells from a staff", () => {
    const healing = equipment.find((entry) => entry.name === "Staff of Healing")!;
    expect(staffSpells(healing)).toEqual([
      { name: "Stabilize", rank: 0 },
      { name: "Heal", rank: 1 },
    ]);

    const fire = equipment.find((entry) => entry.name === "Staff of Fire")!;
    expect(staffSpells(fire)).toEqual([
      { name: "Ignition", rank: 0 },
      { name: "Breathe Fire", rank: 1 },
    ]);
  });

  it("splits multiple spells listed at one rank", () => {
    const wanderer = equipment.find((entry) => entry.name === "Wanderer’s Staff")!;
    expect(staffSpells(wanderer)).toEqual([
      { name: "Know the Way", rank: 0 },
      { name: "Alarm", rank: 1 },
      { name: "Breadcrumbs", rank: 1 },
      { name: "Create Food", rank: 2 },
      { name: "Environmental Endurance", rank: 2 },
      { name: "Marvelous Mount", rank: 2 },
    ]);
  });

  it("returns no list for non-staff items or staves without embedded spells", () => {
    const sword = equipment.find((entry) => entry.name === "Longsword")!;
    expect(staffSpells(sword)).toEqual([]);
    const listless = equipment.find((entry) => entry.name === "Bounty's Light")!;
    expect(staffSpells(listless)).toEqual([]);
    expect(staffSpells(null)).toEqual([]);
  });
});
