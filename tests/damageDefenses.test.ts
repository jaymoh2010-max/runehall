import { describe, expect, it } from "vitest";
import { applyDamageDefenses } from "../src/shared/damageDefenses";

describe("monster damage defenses", () => {
  it("applies resistance, weakness, and immunity by type", () => {
    expect(
      applyDamageDefenses({
        amount: 12,
        damageType: "fire",
        resistances: [{ type: "fire", value: 5 }],
      })
    ).toEqual({ amount: 7, notes: ["Resistance 5 to fire"] });

    expect(
      applyDamageDefenses({
        amount: 12,
        damageType: "cold",
        weaknesses: [{ type: "cold", value: 10 }],
      })
    ).toEqual({ amount: 22, notes: ["Weakness 10 to cold"] });

    expect(
      applyDamageDefenses({
        amount: 12,
        damageType: "poison",
        immunities: ["poison"],
      })
    ).toEqual({ amount: 0, notes: ["Immune to poison"] });
  });

  it("uses the highest matching resistance and weakness", () => {
    expect(
      applyDamageDefenses({
        amount: 20,
        damageType: "slashing",
        resistances: [
          { type: "slashing", value: 5 },
          { type: "all", value: 3 },
        ],
        weaknesses: [{ type: "slashing", value: 2 }],
      }).amount
    ).toBe(17);
  });

  it("applies all-damage resistance to untyped damage", () => {
    expect(
      applyDamageDefenses({
        amount: 10,
        damageType: "untyped",
        resistances: [{ type: "all", value: 5 }],
      })
    ).toEqual({ amount: 5, notes: ["Resistance 5 to all"] });
  });

  it("applies physical resistance to physical damage types", () => {
    expect(
      applyDamageDefenses({
        amount: 12,
        damageType: "slashing",
        resistances: [{ type: "physical", value: 5 }],
      })
    ).toEqual({ amount: 7, notes: ["Resistance 5 to physical"] });
  });

  it("applies weakness before resistance", () => {
    expect(
      applyDamageDefenses({
        amount: 3,
        damageType: "fire",
        resistances: [{ type: "all", value: 10 }],
        weaknesses: [{ type: "fire", value: 5 }],
      }).amount
    ).toBe(0);
  });

  it("treats nonlethal immunity as a damage immunity", () => {
    expect(
      applyDamageDefenses({
        amount: 8,
        damageType: "bludgeoning",
        nonlethal: true,
        immunities: ["nonlethal-attacks"],
      })
    ).toEqual({ amount: 0, notes: ["Immune to nonlethal-attacks"] });
  });
});
