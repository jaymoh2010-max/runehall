import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  applyDamageToDraft,
  applyHealingToDraft,
  applyHpEditToDraft,
  applyHpEditToState,
  reconcileLifeConditions,
} from "../src/shared/damage";
import type { CharacterDraft, CharacterCondition } from "../src/shared/types";

function draftWith(input: {
  hp?: number | null;
  tempHp?: number;
  conditions?: CharacterCondition[];
}): CharacterDraft {
  const draft = emptyCharacterDraft("Damage Test");
  draft.level = 5;
  draft.play.hp = input.hp ?? null;
  draft.play.tempHp = input.tempHp ?? 0;
  draft.play.conditions = input.conditions ?? [];
  return draft;
}

describe("damage and dying", () => {
  it("absorbs damage with temporary HP before reducing HP", () => {
    const result = applyDamageToDraft(draftWith({ hp: 10, tempHp: 5 }), 20, 3);
    expect(result.tempHpAbsorbed).toBe(3);
    expect(result.draft.play.tempHp).toBe(2);
    expect(result.draft.play.hp).toBe(10);
    expect(result.draft.play.conditions).toHaveLength(0);
  });

  it("applies overflow damage after temporary HP", () => {
    const result = applyDamageToDraft(draftWith({ hp: 10, tempHp: 5 }), 20, 8);
    expect(result.tempHpAbsorbed).toBe(5);
    expect(result.hpDamage).toBe(3);
    expect(result.draft.play.hp).toBe(7);
    expect(result.draft.play.tempHp).toBe(0);
  });

  it("applies dying 1 and unconscious when HP reaches 0", () => {
    const result = applyDamageToDraft(draftWith({ hp: 10 }), 20, 10);
    expect(result.draft.play.hp).toBe(0);
    expect(result.droppedToZero).toBe(true);
    expect(result.dying).toBe(1);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dying", value: 1 }),
        expect.objectContaining({ name: "Unconscious" }),
      ])
    );
  });

  it("adds wounded to the initial dying value", () => {
    const result = applyDamageToDraft(
      draftWith({ hp: 5, conditions: [{ name: "Wounded", value: 2, duration: null }] }),
      20,
      10
    );
    expect(result.dying).toBe(3);
  });

  it("adds one for critical damage", () => {
    const result = applyDamageToDraft(draftWith({ hp: 5 }), 20, 10, { critical: true });
    expect(result.dying).toBe(2);
  });

  it("increases an existing dying value", () => {
    const result = applyDamageToDraft(
      draftWith({ hp: 0, conditions: [{ name: "Dying", value: 2, duration: null }] }),
      20,
      3
    );
    expect(result.dying).toBe(3);
  });

  it("lowers the death threshold while doomed", () => {
    const result = applyDamageToDraft(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 2, duration: null },
          { name: "Doomed", value: 1, duration: null },
        ],
      }),
      20,
      1
    );
    expect(result.dying).toBe(3);
    expect(result.dead).toBe(true);
  });

  it("marks the character dead at dying 4", () => {
    const result = applyDamageToDraft(
      draftWith({ hp: 0, conditions: [{ name: "Dying", value: 3, duration: null }] }),
      20,
      3
    );
    expect(result.dying).toBe(4);
    expect(result.dead).toBe(true);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dead" })])
    );
  });

  it("healing above 0 clears dying and unconscious and adds wounded", () => {
    const result = applyHealingToDraft(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 1, duration: null },
          { name: "Unconscious", value: null, duration: null },
        ],
      }),
      20,
      5
    );
    expect(result.draft.play.hp).toBe(5);
    expect(result.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Wounded", value: 1 }),
    ]);
  });

  it("raises wounded when healed from dying again", () => {
    const result = applyHealingToDraft(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 2, duration: null },
          { name: "Unconscious", value: null, duration: null },
          { name: "Wounded", value: 1, duration: null },
        ],
      }),
      20,
      5
    );
    expect(result.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Wounded", value: 2 }),
    ]);
  });

  it("healing to full clears wounded", () => {
    const result = applyHealingToDraft(
      draftWith({
        hp: 18,
        conditions: [{ name: "Wounded", value: 1, duration: null }],
      }),
      20,
      5
    );
    expect(result.draft.play.hp).toBe(20);
    expect(result.draft.play.conditions).toEqual([]);
  });

  it("reconciles life conditions after an external HP edit", () => {
    expect(
      reconcileLifeConditions(
        [
          { name: "Dying", value: 2, duration: null },
          { name: "Unconscious", value: null, duration: null },
          { name: "Frightened", value: 1, duration: null },
        ],
        4,
        20
      )
    ).toEqual([{ name: "Frightened", value: 1, duration: null }]);
  });

  it("edits HP as a correction without consuming temporary HP", () => {
    const result = applyHpEditToDraft(draftWith({ hp: 10, tempHp: 5 }), 20, {
      type: "set",
      hp: 4,
    });
    expect(result.draft.play.hp).toBe(4);
    expect(result.draft.play.tempHp).toBe(5);
    expect(result.changed).toBe(true);
  });

  it("applies dying from a corrected HP target and wounded on recovery", () => {
    const dropped = applyHpEditToDraft(draftWith({ hp: 10 }), 20, { type: "set", hp: 0 });
    expect(dropped.dying).toBe(1);
    expect(dropped.draft.play.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dying", value: 1 }),
        expect.objectContaining({ name: "Unconscious" }),
      ])
    );
    const recovered = applyHpEditToDraft(dropped.draft, 20, { type: "set", hp: 1 });
    expect(recovered.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Wounded", value: 1 }),
    ]);
  });

  it("clamps corrections and treats null as full HP", () => {
    const above = applyHpEditToDraft(draftWith({ hp: 10 }), 20, { type: "set", hp: 99 });
    expect(above.draft.play.hp).toBe(20);
    const full = applyHpEditToDraft(draftWith({ hp: 0 }), 20, { type: "set", hp: null });
    expect(full.draft.play.hp).toBe(20);
  });

  it("supports an unlinked token state", () => {
    const state = applyHpEditToState({ hp: 10, conditions: [] }, 10, {
      type: "damage",
      amount: 10,
    });
    expect(state.draft.play.hp).toBe(0);
    expect(state.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dying", value: 1 })])
    );
  });

  it("does nothing for zero damage or an already dead character", () => {
    const zero = applyDamageToDraft(draftWith({ hp: 10 }), 20, 0);
    expect(zero.draft.play.hp).toBe(10);
    const dead = applyDamageToDraft(
      draftWith({ hp: 0, conditions: [{ name: "Dead", value: null, duration: null }] }),
      20,
      5
    );
    expect(dead.draft.play.hp).toBe(0);
    expect(dead.dead).toBe(true);
  });
});
