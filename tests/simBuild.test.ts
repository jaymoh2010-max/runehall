import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { computeCharacter } from "../src/shared/rules";
import { buildSimulatedCharacter } from "../scripts/simulate-characters";

const CASES = [
  { className: "Sorcerer", level: 5, seed: 10_116 },
  { className: "Psychic", level: 10, seed: 10_095 },
  { className: "Animist", level: 5, seed: 10_005 },
  { className: "Commander", level: 20, seed: 680 },
  { className: "Rogue", level: 1, seed: 759 },
  { className: "Bard", level: 20, seed: 978 },
] as const;

describe("deterministic character simulation build", () => {
  it.each(CASES)("builds a valid $className at level $level", ({ className, level, seed }) => {
    const build = buildSimulatedCharacter({ seed, className, level });
    const derived = computeCharacter(build.draft, contextForDraft(build.draft));
    const errors = derived.validation.filter((issue) => issue.severity === "error");
    expect(errors, errors.map((issue) => issue.message).join("\n")).toHaveLength(0);
    expect(build.draft.level).toBe(level);
    expect(derived.maxHp).toBeGreaterThan(0);
    expect(derived.ac).toBeGreaterThanOrEqual(10);
    expect(derived.attacks.length).toBeGreaterThan(0);
  });

  it("gives level 20 simulated characters fundamental runes", () => {
    const build = buildSimulatedCharacter({ seed: 4242, className: "Fighter", level: 20 });
    const weapon = build.draft.equipment.find(
      (entry) => build.context.equipment[entry.itemId]?.weapon
    );
    const armor = build.draft.equipment.find(
      (entry) => build.context.equipment[entry.itemId]?.armor
    );
    expect(weapon?.runes?.length ?? 0).toBeGreaterThan(0);
    expect(armor?.runes?.length ?? 0).toBeGreaterThan(0);
    const derived = computeCharacter(build.draft, contextForDraft(build.draft));
    const weaponAttack = derived.attacks.find((attack) => attack.sourceItemId);
    expect(weaponAttack?.damageFormula).toMatch(/[2-9]d/);
  });
});
