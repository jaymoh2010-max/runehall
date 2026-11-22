import { describe, expect, it } from "vitest";
import {
  adjustMonsterDamage,
  applyMonsterTemplate,
  monsterDamageFormula,
  monsterTemplateFromName,
} from "../src/shared/monsterTemplates";
import type { Monster } from "../src/shared/types";

function goblin(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "mon:goblin",
    name: "Goblin Warrior",
    type: "monster",
    level: 1,
    rarity: "common",
    traits: ["goblin", "humanoid"],
    size: "sm",
    sizeCells: 1,
    hp: 20,
    ac: 16,
    fortitude: 5,
    reflex: 7,
    will: 3,
    perception: 4,
    speeds: { base: 25, other: [] },
    skills: {
      acrobatics: { base: 5 },
      athletics: 3,
      stealth: { mod: 8 },
    },
    immunities: [],
    weaknesses: [],
    resistances: [],
    attacks: [
      {
        name: "Dogslicer",
        type: "melee",
        bonus: 7,
        damage: "1d6+2 slashing",
        traits: ["agile"],
        range: null,
        effects: [],
      },
    ],
    abilities: [],
    blurb: "",
    description: "",
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
    ...overrides,
  } as Monster;
}

describe("monster templates", () => {
  it("raises an elite creature's stats, attacks, damage, and HP", () => {
    const elite = applyMonsterTemplate(goblin(), "elite");
    expect(elite.name).toContain("Elite");
    expect(elite.level).toBe(2);
    expect(elite.hp).toBe(31);
    expect(elite.ac).toBe(18);
    expect(elite.perception).toBe(6);
    expect(elite.attacks[0].bonus).toBe(9);
    expect(elite.attacks[0].damage).toBe("1d6+4 slashing");
    expect(elite.traits).toContain("elite");
  });

  it("lowers a weak creature's stats and never drops HP below one", () => {
    const weak = applyMonsterTemplate(goblin({ hp: 5 }), "weak");
    expect(weak.level).toBe(0);
    expect(weak.hp).toBe(1);
    expect(weak.ac).toBe(14);
    expect(weak.attacks[0].bonus).toBe(5);
    expect(weak.attacks[0].damage).toBe("1d6 slashing");
  });

  it("does not clone standard creatures", () => {
    const standard = goblin();
    expect(applyMonsterTemplate(standard, "standard")).toBe(standard);
  });

  it("adjusts flat damage and skill objects", () => {
    expect(adjustMonsterDamage("5 slashing", 2)).toBe("7 slashing");
    expect(adjustMonsterDamage("1d4", -2)).toBe("1d4-2");
    const elite = applyMonsterTemplate(goblin(), "elite");
    expect(elite.skills.acrobatics).toEqual({ base: 7 });
    expect(elite.skills.athletics).toBe(5);
    expect(elite.skills.stealth).toEqual({ mod: 10 });
  });

  it("recovers the template from the generated token name", () => {
    expect(monsterTemplateFromName("Goblin Warrior (Elite)")).toBe("elite");
    expect(monsterTemplateFromName("Goblin Warrior (Weak)")).toBe("weak");
    expect(monsterTemplateFromName("Goblin Warrior")).toBe("standard");
  });

  it("extracts the rollable damage formula", () => {
    expect(monsterDamageFormula("1d6+2 slashing")).toBe("1d6+2");
    expect(monsterDamageFormula("2d8 fire")).toBe("2d8");
    expect(monsterDamageFormula("5")).toBe("5");
  });
});
