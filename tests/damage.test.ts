import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  applyDamageToDraft,
  applyDyingRecovery,
  applyHealingToDraft,
  applyHpEditToDraft,
  applyHpEditToState,
  reconcileLifeConditions,
  recoveryDcForDraft,
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
  it("reduces the dying recovery DC with Toughness", () => {
    const draft = draftWith({});
    expect(recoveryDcForDraft(draft, 1)).toBe(11);
    draft.feats.general["1"] = "feat:AmP0qu7c5dlBSath";
    expect(recoveryDcForDraft(draft, 1)).toBe(10);
  });

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

  it("does not raise wounded again when healing a stable character", () => {
    const result = applyHealingToDraft(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Unconscious", value: null, duration: null },
          { name: "Wounded", value: 1, duration: null },
        ],
      }),
      20,
      5
    );
    expect(result.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Wounded", value: 1 }),
    ]);
  });

  it("keeps wounded after healing to full until a rest or Treat Wounds", () => {
    const result = applyHealingToDraft(
      draftWith({
        hp: 18,
        conditions: [{ name: "Wounded", value: 1, duration: null }],
      }),
      20,
      5
    );
    expect(result.draft.play.hp).toBe(20);
    expect(result.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Wounded", value: 1 }),
    ]);
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

  it("uses dying 5 with Diehard", () => {
    const draft = draftWith({ hp: 1 });
    draft.feats.general = { "3": "feat:I0BhPWqYf1bbzEYg" };
    const result = applyDamageToDraft(draft, 20, 1, { critical: true });
    expect(result.dying).toBe(2);
    expect(result.dead).toBe(false);
    const dead = applyDyingRecovery(
      {
        ...result.draft,
        play: { ...result.draft.play, conditions: [{ name: "Dying", value: 4, duration: null }] },
      },
      "failure"
    );
    expect(dead.dying).toBe(5);
    expect(dead.dead).toBe(true);
    expect(dead.draft.play.conditions.some((entry) => entry.name === "Doomed")).toBe(false);
  });

  it("applies massive damage as instant death", () => {
    const result = applyDamageToDraft(draftWith({ hp: 20 }), 20, 40);
    expect(result.dead).toBe(true);
    expect(result.draft.play.hp).toBe(0);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dead" })])
    );
  });

  it("does not apply dying or death to nonlethal damage", () => {
    const result = applyDamageToDraft(draftWith({ hp: 5 }), 20, 20, { nonlethal: true });
    expect(result.dead).toBe(false);
    expect(result.dying).toBe(0);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Unconscious" })])
    );
    expect(result.draft.play.conditions.some((entry) => entry.name === "Dying")).toBe(false);
  });

  it("does not stabilize a dying character with nonlethal damage", () => {
    const result = applyDamageToDraft(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 2, duration: null },
          { name: "Unconscious", value: null, duration: null },
        ],
      }),
      20,
      5,
      { nonlethal: true }
    );
    expect(result.dying).toBe(2);
    expect(result.dead).toBe(false);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dying", value: 2 }),
        expect.objectContaining({ name: "Unconscious" }),
      ])
    );
  });

  it("reduces dying on a successful recovery check and keeps unconscious at 0 HP", () => {
    const draft = draftWith({
      hp: 0,
      conditions: [
        { name: "Dying", value: 2, duration: null },
        { name: "Unconscious", value: null, duration: null },
      ],
    });
    const result = applyDyingRecovery(draft, "success");
    expect(result.dying).toBe(1);
    expect(result.ended).toBe(false);
    expect(result.draft.play.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dying", value: 1 }),
        expect.objectContaining({ name: "Unconscious" }),
      ])
    );

    const ended = applyDyingRecovery(result.draft, "success");
    expect(ended.dying).toBe(0);
    expect(ended.ended).toBe(true);
    expect(ended.wounded).toBe(1);
    expect(ended.draft.play.conditions).toEqual([
      expect.objectContaining({ name: "Unconscious" }),
      expect.objectContaining({ name: "Wounded", value: 1 }),
    ]);
  });

  it("reduces dying by two on a critical success", () => {
    const result = applyDyingRecovery(
      draftWith({
        hp: 0,
        conditions: [{ name: "Dying", value: 3, duration: null }],
      }),
      "critical-success"
    );
    expect(result.dying).toBe(1);
    expect(result.ended).toBe(false);
  });

  it("increases dying on failure and critical failure, then applies the death threshold", () => {
    const failed = applyDyingRecovery(
      draftWith({
        hp: 0,
        conditions: [{ name: "Dying", value: 2, duration: null }],
      }),
      "failure"
    );
    expect(failed.dying).toBe(3);
    expect(failed.dead).toBe(false);

    const critical = applyDyingRecovery(
      draftWith({
        hp: 0,
        conditions: [{ name: "Dying", value: 2, duration: null }],
      }),
      "critical-failure"
    );
    expect(critical.dying).toBe(4);
    expect(critical.dead).toBe(true);
    expect(critical.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dead" })])
    );
  });

  it("lowers the recovery death threshold while doomed", () => {
    const result = applyDyingRecovery(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 2, duration: null },
          { name: "Doomed", value: 1, duration: null },
        ],
      }),
      "failure"
    );
    expect(result.dying).toBe(3);
    expect(result.dead).toBe(true);
  });

  it("dies immediately when doomed lowers the threshold to zero", () => {
    const recovery = applyDyingRecovery(
      draftWith({
        hp: 0,
        conditions: [
          { name: "Dying", value: 1, duration: null },
          { name: "Doomed", value: 4, duration: null },
        ],
      }),
      "critical-success"
    );
    expect(recovery.dead).toBe(true);
    expect(recovery.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dead" })])
    );

    const damage = applyDamageToDraft(
      draftWith({ hp: 5, conditions: [{ name: "Doomed", value: 4, duration: null }] }),
      20,
      5
    );
    expect(damage.dead).toBe(true);
  });

  it("does not change an already dead or stable character", () => {
    const dead = draftWith({
      hp: 0,
      conditions: [{ name: "Dead", value: null, duration: null }],
    });
    expect(applyDyingRecovery(dead, "success").draft).toBe(dead);
    const stable = draftWith({
      hp: 0,
      conditions: [{ name: "Unconscious", value: null, duration: null }],
    });
    expect(applyDyingRecovery(stable, "failure").draft).toBe(stable);
  });
});

describe("linked regeneration", () => {
  function regenerating(hp: number | null, conditions: CharacterCondition[] = []): CharacterDraft {
    const draft = draftWith({ hp, conditions });
    draft.play.regeneration = 5;
    draft.play.regenerationDeactivatedBy = ["fire", "acid"];
    return draft;
  }

  it("suppresses regeneration only for matching typed damage", () => {
    const fire = applyDamageToDraft(regenerating(15), 20, 5, { damageTypes: ["fire"] });
    expect(fire.draft.play.hp).toBe(10);
    expect(fire.notes).toContain("Regeneration suppressed by fire.");
    expect(fire.draft.play.conditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Regeneration Suppressed" })])
    );

    const cold = applyDamageToDraft(regenerating(15), 20, 5, { damageTypes: ["cold"] });
    expect(cold.draft.play.conditions).toHaveLength(0);
  });

  it("deactivates regeneration before triggering lethal damage", () => {
    const fire = applyDamageToDraft(
      regenerating(0, [{ name: "Dying", value: 3, duration: null }]),
      20,
      1,
      { damageTypes: ["fire"] }
    );
    expect(fire.dead).toBe(true);

    const cold = applyDamageToDraft(
      regenerating(0, [{ name: "Dying", value: 3, duration: null }]),
      20,
      1,
      { damageTypes: ["cold"] }
    );
    expect(cold.dead).toBe(false);
    expect(cold.dying).toBe(3);
    expect(cold.notes.some((note) => note.includes("Regeneration prevents death"))).toBe(true);
  });

  it("caps recovery failures below the death threshold while active", () => {
    const draft = regenerating(0, [{ name: "Dying", value: 2, duration: null }]);
    const result = applyDyingRecovery(draft, "critical-failure", { regenerationActive: true });
    expect(result.dead).toBe(false);
    expect(result.dying).toBe(3);
    expect(result.notes.some((note) => note.includes("Regeneration prevents death"))).toBe(true);

    const suppressed = applyDyingRecovery(draft, "critical-failure", {
      regenerationActive: false,
    });
    expect(suppressed.dead).toBe(true);
    expect(suppressed.dying).toBe(4);
  });
});
