import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { computeCharacter, grantedTrainedSkills } from "../src/shared/rules";
import { featGrantChoiceKey } from "../src/shared/effects";
import {
  advanceSimulatedCharacter,
  buildSimulatedCharacter,
  type SimulatedCharacterBuild,
} from "../scripts/simulate-characters";
import type { CharacterDraft } from "../src/shared/types";

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

  it("resolves General Training into a granted general feat", () => {
    const build = buildSimulatedCharacter({
      seed: 5151,
      className: "Fighter",
      level: 1,
      ancestryName: "Human",
    });
    const baseline = computeCharacter(build.draft, contextForDraft(build.draft));
    build.draft.feats.ancestry["1"] = "feat:D3SuA5MaKucO1flE";
    build.draft.featChoices["feat:D3SuA5MaKucO1flE"] = ["feat:Ux73dmoF8KnavyUD"];
    const applied = computeCharacter(build.draft, contextForDraft(build.draft));
    expect(applied.speed).toBe(baseline.speed + 5);
    expect(applied.validation.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("applies a separate granted feat for each repeatable selection", () => {
    const build = buildSimulatedCharacter({
      seed: 5152,
      className: "Fighter",
      level: 5,
      ancestryName: "Human",
    });
    const buildDraft = build.draft;
    buildDraft.feats.ancestry["1"] = "feat:D3SuA5MaKucO1flE";
    buildDraft.feats.ancestry["5"] = "feat:D3SuA5MaKucO1flE";
    buildDraft.featChoices[featGrantChoiceKey("feat:D3SuA5MaKucO1flE", "ancestry:1")] = [
      "feat:Ux73dmoF8KnavyUD",
    ];
    buildDraft.featChoices[featGrantChoiceKey("feat:D3SuA5MaKucO1flE", "ancestry:5")] = [
      "feat:AmP0qu7c5dlBSath",
    ];
    const baselineDraft = { ...buildDraft, featChoices: {} };
    const baseline = computeCharacter(baselineDraft, contextForDraft(baselineDraft));
    const applied = computeCharacter(buildDraft, contextForDraft(buildDraft));
    expect(applied.speed).toBe(baseline.speed + 5);
    expect(applied.maxHp).toBe(baseline.maxHp + 5);
    expect(applied.validation.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(applied.validation.some((issue) => issue.message.includes("selections found"))).toBe(
      false
    );
  });
});

const ADVANCEMENT_CASES = [
  { className: "Fighter", seed: 4242 },
  { className: "Wizard", seed: 10_101 },
  { className: "Cleric", seed: 10_102 },
  { className: "Sorcerer", seed: 10_103 },
  { className: "Animist", seed: 10_104 },
  { className: "Monk", seed: 10_105 },
] as const;

function errorsFor(build: SimulatedCharacterBuild): string[] {
  return computeCharacter(build.draft, contextForDraft(build.draft))
    .validation.filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

function expectChoicesPreserved(previous: CharacterDraft, next: CharacterDraft): void {
  for (const key of [
    "ancestryId",
    "heritageId",
    "backgroundId",
    "classId",
    "deityId",
    "keyAbility",
  ] as const) {
    expect(next[key], key).toBe(previous[key]);
  }
  for (const key of ["ancestry", "background", "free"] as const) {
    expect(next.boosts[key], `${key} boosts`).toEqual(previous.boosts[key]);
  }
  for (const category of ["ancestry", "class", "skill", "general"] as const) {
    for (const [slot, featId] of Object.entries(previous.feats[category])) {
      expect(next.feats[category][slot], `${category} feat at level ${slot}`).toBe(featId);
    }
  }
  for (const [group, ids] of Object.entries(previous.classChoices)) {
    expect(next.classChoices[group], `class choice ${group}`).toEqual(ids);
  }
  for (const [group, ids] of Object.entries(previous.grantChoices)) {
    for (const id of ids) {
      expect(next.grantChoices[group] ?? [], `grant choice ${group}`).toContain(id);
    }
  }
  const fixedSkills = grantedTrainedSkills(next, contextForDraft(next));
  for (const [slot, skill] of Object.entries(previous.skills.increases)) {
    const nextSkill = next.skills.increases[slot];
    if (nextSkill === skill) continue;
    expect(
      fixedSkills.has(skill),
      `level ${slot} increase moved from ${skill} without new training`
    ).toBe(true);
  }
  for (const id of previous.spells.cantrips) {
    expect(next.spells.cantrips, `cantrip ${id}`).toContain(id);
  }
  for (const id of previous.spells.known) {
    expect(next.spells.known, `known spell ${id}`).toContain(id);
  }
  for (const id of previous.spells.focus) {
    expect(next.spells.focus, `focus spell ${id}`).toContain(id);
  }
  for (const entry of previous.equipment) {
    expect(
      next.equipment.some((candidate) => candidate.itemId === entry.itemId),
      `equipment ${entry.itemId}`
    ).toBe(true);
  }
}

describe("continuous simulated character advancement", () => {
  it.each(ADVANCEMENT_CASES)(
    "advances $className from level 1 to 20 without rerolling choices",
    ({ className, seed }) => {
      let build = buildSimulatedCharacter({ seed, className, level: 1 });
      for (let level = 2; level <= 20; level++) {
        const previous = build;
        build = advanceSimulatedCharacter({ previous, level, seed });
        expect(build.source, build.fallbackReason).toBe("advanced");
        expect(build.draft.level).toBe(level);
        expect(errorsFor(build), `${className} L${level}`).toHaveLength(0);
        expectChoicesPreserved(previous.draft, build.draft);
      }
      expect(build.draft.boosts.levels["5"]).toHaveLength(4);
      expect(build.draft.boosts.levels["10"]).toHaveLength(4);
      expect(build.draft.boosts.levels["15"]).toHaveLength(4);
      expect(build.draft.boosts.levels["20"]).toHaveLength(4);
      const derived = computeCharacter(build.draft, contextForDraft(build.draft));
      expect(derived.maxHp).toBeGreaterThan(0);
      expect(derived.ac).toBeGreaterThanOrEqual(10);
    }
  );

  it("can advance several levels at once", () => {
    const levelOne = buildSimulatedCharacter({ seed: 5150, className: "Cleric", level: 1 });
    const levelTwenty = advanceSimulatedCharacter({
      previous: levelOne,
      level: 20,
      seed: 5150,
    });
    expect(levelTwenty.source, levelTwenty.fallbackReason).toBe("advanced");
    expect(levelTwenty.draft.level).toBe(20);
    expect(errorsFor(levelTwenty)).toHaveLength(0);
    expect(levelTwenty.draft.spells.preparedByRank["10"]?.length ?? 0).toBeGreaterThan(0);
    expect(levelTwenty.draft.boosts.levels["20"]).toHaveLength(4);
  });

  it("keeps a dual-font cleric's font choice across level-ups", () => {
    let build = buildSimulatedCharacter({
      seed: 81_001,
      className: "Cleric",
      level: 1,
      deityName: "Abadar",
    });
    const fontChoice = build.draft.spells.fontChoice;
    expect(fontChoice).toBeTruthy();
    for (let level = 2; level <= 20; level++) {
      build = advanceSimulatedCharacter({ previous: build, level, seed: 81_001 });
      expect(build.source, build.fallbackReason).toBe("advanced");
      expect(build.draft.spells.fontChoice).toBe(fontChoice);
      expect(errorsFor(build), `Cleric L${level}`).toHaveLength(0);
    }
  });

  it("upgrades advancing characters with level-appropriate fundamental runes", () => {
    let build = buildSimulatedCharacter({ seed: 4242, className: "Fighter", level: 1 });
    for (let level = 2; level <= 20; level++) {
      build = advanceSimulatedCharacter({ previous: build, level, seed: 4242 });
    }
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

  it("is deterministic for the same previous build and seed", () => {
    const previous = buildSimulatedCharacter({ seed: 777, className: "Wizard", level: 1 });
    const first = advanceSimulatedCharacter({ previous, level: 5, seed: 777 });
    const second = advanceSimulatedCharacter({ previous, level: 5, seed: 777 });
    expect(JSON.stringify(second.draft)).toBe(JSON.stringify(first.draft));
  });
});
