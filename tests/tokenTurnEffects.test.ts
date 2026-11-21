import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyTokenTurnEffects,
  normalizeTokenTurnEffects,
  tokenHasRegenerationSuppressed,
  tokenTurnEffectsFromMonster,
  tokenTurnHealing,
} from "../src/shared/tokenTurnEffects";
import type { Monster } from "../src/shared/types";

const monsters = JSON.parse(
  fs.readFileSync(path.resolve("data/compendium/monsters.json"), "utf8")
) as Monster[];

function monster(id: string): Monster {
  const found = monsters.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing test monster ${id}`);
  return found;
}

describe("token turn effect normalization", () => {
  it("fills defaults for older tokens", () => {
    expect(normalizeTokenTurnEffects(undefined)).toEqual(emptyTokenTurnEffects());
    expect(normalizeTokenTurnEffects({})).toEqual(emptyTokenTurnEffects());
  });

  it("clamps numbers and normalizes persistent damage", () => {
    const effects = normalizeTokenTurnEffects({
      fastHealing: -5,
      regeneration: 5000,
      regenerationDeactivatedBy: ["fire", "  ", "acid"],
      persistentDamage: [
        { id: "pd1", formula: "1d6", type: "fire", dc: 99, notes: "test" },
        { id: "pd1", formula: "1d8", type: "fire", dc: 15, notes: "duplicate" },
      ],
    });
    expect(effects.fastHealing).toBe(0);
    expect(effects.regeneration).toBe(1_000);
    expect(effects.regenerationDeactivatedBy).toEqual(["fire", "acid"]);
    expect(effects.persistentDamage).toHaveLength(1);
    expect(effects.persistentDamage[0].dc).toBe(30);
  });
});

describe("monster ability parsing", () => {
  it("reads a plain fast healing value", () => {
    const effects = tokenTurnEffectsFromMonster(monster("mon:pPQyoQHTxrE2U7px"));
    expect(effects.fastHealing).toBe(7);
    expect(effects.fastHealingActive).toBe(true);
    expect(effects.regeneration).toBe(0);
  });

  it("keeps conditional fast healing off by default", () => {
    const effects = tokenTurnEffectsFromMonster(monster("mon:MSm1im7lZA5i82rz"));
    expect(effects.fastHealing).toBe(2);
    expect(effects.fastHealingActive).toBe(false);
    expect(effects.fastHealingNote).toBe("In Open Air");
  });

  it("reads regeneration and deactivation types", () => {
    const trollhound = tokenTurnEffectsFromMonster(monster("mon:gTkvu3RRiDHNONzf"));
    expect(trollhound.regeneration).toBe(15);
    expect(trollhound.regenerationActive).toBe(true);
    expect(trollhound.regenerationDeactivatedBy).toEqual(["electricity", "fire"]);

    const mobogo = tokenTurnEffectsFromMonster(monster("mon:TQtISRsI3FI2ddBR"));
    expect(mobogo.regeneration).toBe(30);
    expect(mobogo.regenerationDeactivatedBy).toEqual(["acid", "cold", "fire"]);

    const phoenix = tokenTurnEffectsFromMonster(monster("mon:mQJL411e9Iz8dJoh"));
    expect(phoenix.regenerationDeactivatedBy).toEqual(["cold", "unholy"]);
  });

  it("handles regeneration with no deactivation clause", () => {
    const effects = tokenTurnEffectsFromMonster(monster("mon:D5bZbv6KOSyDqEmj"));
    expect(effects.regeneration).toBe(20);
    expect(effects.regenerationDeactivatedBy).toEqual([]);
  });

  it("does not invent values for named variants", () => {
    expect(tokenTurnEffectsFromMonster(monster("mon:Bkr0soTDhQq1qjWx")).regeneration).toBe(0);
    expect(tokenTurnEffectsFromMonster(monster("mon:XVEpt8dz9fMBXROb")).regeneration).toBe(0);
  });

  it("ignores spell and non-passive abilities", () => {
    const fake = {
      ...monster("mon:gTkvu3RRiDHNONzf"),
      abilities: [
        {
          name: "Regeneration 20",
          type: "spell",
          actions: null,
          actionType: "passive",
          traits: [],
          description: "",
        },
        {
          name: "Fast Healing 5",
          type: "action",
          actions: "1",
          actionType: "action",
          traits: [],
          description: "",
        },
      ],
    } as Monster;
    const effects = tokenTurnEffectsFromMonster(fake);
    expect(effects.regeneration).toBe(0);
    expect(effects.fastHealing).toBe(0);
  });
});

describe("token healing", () => {
  it("adds fast healing and regeneration, and respects suppression", () => {
    const effects = normalizeTokenTurnEffects({ fastHealing: 5, regeneration: 20 });
    expect(tokenTurnHealing(effects, [])).toBe(25);
    expect(
      tokenTurnHealing(effects, [{ name: "Regeneration Suppressed", value: null, duration: null }])
    ).toBe(5);
    expect(
      tokenHasRegenerationSuppressed([
        { name: "Regeneration Suppressed 2", value: null, duration: null },
      ])
    ).toBe(true);
  });

  it("ignores inactive effects", () => {
    const effects = normalizeTokenTurnEffects({
      fastHealing: 5,
      fastHealingActive: false,
      regeneration: 20,
      regenerationActive: false,
    });
    expect(tokenTurnHealing(effects, [])).toBe(0);
  });
});
