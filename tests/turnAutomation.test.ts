import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  dyingValue,
  resolveEndOfTurn,
  resolveStartOfTurn,
  type TurnAutomationRng,
} from "../src/shared/turnAutomation";
import type { CharacterCondition, CharacterDraft } from "../src/shared/types";

function sequence(values: number[]): TurnAutomationRng {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

function hero(conditions: CharacterCondition[] = [], hp = 20): CharacterDraft {
  const draft = emptyCharacterDraft("Automation Hero");
  return {
    ...draft,
    play: { ...draft.play, hp, conditions },
  };
}

function conditionValue(draft: CharacterDraft, name: string): number {
  const normalized = name.toLowerCase();
  for (const condition of draft.play.conditions) {
    const raw = String(condition.name ?? "").trim();
    const match = raw.match(/^(.*?)\s+(\d+)$/);
    if ((match?.[1] ?? raw).trim().toLowerCase() !== normalized) continue;
    return Number(match?.[2] ?? condition.value ?? 1);
  }
  return 0;
}

describe("start-of-turn automation", () => {
  it("does nothing for a character who is not dying", () => {
    const draft = hero();
    const result = resolveStartOfTurn(draft, { rng: () => 0.99 });
    expect(result.recovery).toBeNull();
    expect(result.changed).toBe(false);
    expect(result.draft).toBe(draft);
  });

  it("critically succeeds a recovery check and gains wounded", () => {
    const draft = hero([{ name: "Dying", value: 2 }], 0);
    const result = resolveStartOfTurn(draft, {
      rng: () => 0.99,
      labelPrefix: "Automation Hero",
    });
    expect(result.recovery?.d20).toBe(20);
    expect(result.recovery?.degree).toBe("critical-success");
    expect(result.recovery?.label).toBe("Automation Hero · Dying recovery check");
    expect(result.dyingBefore).toBe(2);
    expect(dyingValue(result.draft)).toBe(0);
    expect(conditionValue(result.draft, "wounded")).toBe(1);
    expect(result.ended).toBe(true);
    expect(result.dead).toBe(false);
  });

  it("critically fails a recovery check and dies at the threshold", () => {
    const draft = hero([{ name: "Dying", value: 2 }], 0);
    const result = resolveStartOfTurn(draft, { rng: () => 0 });
    expect(result.recovery?.d20).toBe(1);
    expect(result.recovery?.degree).toBe("critical-failure");
    expect(result.dead).toBe(true);
    expect(conditionValue(result.draft, "dead")).toBe(1);
  });
});

describe("end-of-turn persistent damage", () => {
  it("applies damage once and removes the type on a successful flat check", () => {
    const draft = hero([], 20);
    draft.play.persistentDamage = [
      { id: "pd-fire", formula: "1d6", type: "fire", dc: 15, notes: "" },
    ];
    const result = resolveEndOfTurn(draft, 30, {
      rng: sequence([0.5, 0.99]),
      labelPrefix: "Automation Hero",
    });
    expect(result.totalDamage).toBe(4);
    expect(result.draft.play.hp).toBe(16);
    expect(result.rolls[0].damage.label).toBe("Automation Hero · Persistent fire damage");
    expect(result.rolls[0].flatCheck?.degree).toBe("critical-success");
    expect(result.rolls[0].ended).toBe(true);
    expect(result.draft.play.persistentDamage).toHaveLength(0);
  });

  it("keeps the type on a failed flat check", () => {
    const draft = hero([], 20);
    draft.play.persistentDamage = [
      { id: "pd-fire", formula: "1d6", type: "fire", dc: 15, notes: "" },
    ];
    const result = resolveEndOfTurn(draft, 30, { rng: sequence([0.5, 0]) });
    expect(result.totalDamage).toBe(4);
    expect(result.draft.play.persistentDamage).toHaveLength(1);
    expect(result.rolls[0].flatCheck?.degree).toBe("critical-failure");
    expect(result.rolls[0].ended).toBe(false);
  });

  it("sums multiple types, applies one damage event, and checks each type", () => {
    const draft = hero([], 30);
    draft.play.persistentDamage = [
      { id: "pd-fire", formula: "1d6", type: "fire", dc: 15, notes: "" },
      { id: "pd-acid", formula: "1d6", type: "acid", dc: 15, notes: "" },
    ];
    // Damage 4 + 4, then a success and a failure.
    const result = resolveEndOfTurn(draft, 30, {
      rng: sequence([0.5, 0.5, 0.99, 0]),
    });
    expect(result.totalDamage).toBe(8);
    expect(result.draft.play.hp).toBe(22);
    expect(result.draft.play.persistentDamage.map((entry) => entry.type)).toEqual(["acid"]);
  });

  it("consumes temporary HP before real HP", () => {
    const draft = hero([], 20);
    draft.play.tempHp = 5;
    draft.play.persistentDamage = [
      { id: "pd-fire", formula: "1d6", type: "fire", dc: 15, notes: "" },
    ];
    const result = resolveEndOfTurn(draft, 30, { rng: sequence([0.5, 0.99]) });
    expect(result.draft.play.tempHp).toBe(1);
    expect(result.draft.play.hp).toBe(20);
  });

  it("stops before the flat check when persistent damage kills", () => {
    const draft = hero([{ name: "Dying", value: 3 }], 0);
    draft.play.persistentDamage = [
      { id: "pd-fire", formula: "1d6", type: "fire", dc: 15, notes: "" },
    ];
    const result = resolveEndOfTurn(draft, 30, { rng: () => 0.99 });
    expect(result.dead).toBe(true);
    expect(result.rolls[0].flatCheck).toBeNull();
    expect(conditionValue(result.draft, "dead")).toBe(1);
  });

  it("ignores invalid persistent formulas", () => {
    const draft = hero([], 20);
    draft.play.persistentDamage = [
      { id: "pd-bad", formula: "not-a-formula", type: "fire", dc: 15, notes: "" },
    ];
    const result = resolveEndOfTurn(draft, 30, { rng: () => 0.5 });
    expect(result.changed).toBe(false);
    expect(result.rolls).toHaveLength(0);
  });
});
