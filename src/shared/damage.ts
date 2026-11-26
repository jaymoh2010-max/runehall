import type { CharacterCondition, CharacterDraft, DegreeOfSuccess } from "./types";
import {
  characterRegenerationActive,
  suppressRegenerationFromDamage,
} from "./characterTurnEffects";

/**
 * PF2e damage helper. Temporary HP absorbs damage first, and dropping to 0 HP
 * applies the dying/unconscious state instead of leaving a character standing
 * at 0 HP with no consequence.
 */
export interface DamageResult {
  draft: CharacterDraft;
  tempHpAbsorbed: number;
  hpDamage: number;
  droppedToZero: boolean;
  dying: number;
  wounded: number;
  dead: boolean;
  notes: string[];
}

export interface DamageOptions {
  /** Critical damage increases the dying value by 1. */
  critical?: boolean;
  /** Nonlethal damage never causes the dying or dead conditions. */
  nonlethal?: boolean;
  /** Damage types used to deactivate regeneration before the damage lands. */
  damageTypes?: string[];
}

export interface HealingResult {
  draft: CharacterDraft;
  healed: number;
  notes: string[];
}

export type HpEdit =
  | {
      type: "damage";
      amount: number;
      critical?: boolean;
      nonlethal?: boolean;
      damageTypes?: string[];
    }
  | { type: "heal"; amount: number }
  | { type: "set"; hp: number | null };

export interface HpEditResult {
  draft: CharacterDraft;
  changed: boolean;
  notes: string[];
  tempHpAbsorbed: number;
  hpDamage: number;
  healed: number;
  droppedToZero: boolean;
  dying: number;
  wounded: number;
  dead: boolean;
}

export interface HpState {
  hp: number | null;
  tempHp?: number;
  conditions: CharacterCondition[];
}

function stateDraft(state: HpState): CharacterDraft {
  return {
    play: {
      hp: state.hp,
      tempHp: state.tempHp ?? 0,
      conditions: state.conditions,
      heroPoints: 0,
      focusPoints: 0,
      afflictions: [],
      persistentDamage: [],
      xp: 0,
      shieldRaised: false,
    },
  } as unknown as CharacterDraft;
}

/**
 * One HP mutation entry point for the sheet, token editor, token panel, group
 * actions, and unlinked monsters. "set" is a direct correction that preserves
 * temporary HP; damage and heal use the normal PF2e life-state rules.
 */
export function applyHpEditToDraft(
  draft: CharacterDraft,
  maxHp: number,
  edit: HpEdit
): HpEditResult {
  if (edit.type === "damage") {
    const result = applyDamageToDraft(draft, maxHp, edit.amount, {
      critical: edit.critical,
      nonlethal: edit.nonlethal,
      damageTypes: edit.damageTypes,
    });
    return {
      draft: result.draft,
      changed: result.draft !== draft,
      notes: result.notes,
      tempHpAbsorbed: result.tempHpAbsorbed,
      hpDamage: result.hpDamage,
      healed: 0,
      droppedToZero: result.droppedToZero,
      dying: result.dying,
      wounded: result.wounded,
      dead: result.dead,
    };
  }
  if (edit.type === "heal") {
    const result = applyHealingToDraft(draft, maxHp, edit.amount);
    return {
      draft: result.draft,
      changed: result.draft !== draft,
      notes: result.notes,
      tempHpAbsorbed: 0,
      hpDamage: 0,
      healed: result.healed,
      droppedToZero: false,
      dying: conditionValue(result.draft.play.conditions, "dying"),
      wounded: conditionValue(result.draft.play.conditions, "wounded"),
      dead: conditionValue(result.draft.play.conditions, "dead") > 0,
    };
  }

  const maximum = Math.max(1, Math.round(maxHp));
  const currentHp =
    draft.play.hp === null ? maximum : Math.max(0, Math.min(maximum, Math.round(draft.play.hp)));
  const target = edit.hp === null ? maximum : Math.max(0, Math.min(maximum, Math.round(edit.hp)));
  if (target === currentHp) {
    return {
      draft,
      changed: false,
      notes: [],
      tempHpAbsorbed: 0,
      hpDamage: 0,
      healed: 0,
      droppedToZero: false,
      dying: conditionValue(draft.play.conditions, "dying"),
      wounded: conditionValue(draft.play.conditions, "wounded"),
      dead: conditionValue(draft.play.conditions, "dead") > 0,
    };
  }
  if (target < currentHp) {
    // A numeric correction does not consume temporary HP, but it still applies
    // dying/unconscious when the corrected HP reaches 0.
    const withoutTemp = { ...draft, play: { ...draft.play, tempHp: 0 } };
    const result = applyDamageToDraft(withoutTemp, maximum, currentHp - target);
    const corrected = {
      ...result.draft,
      play: { ...result.draft.play, tempHp: draft.play.tempHp },
    };
    return {
      draft: corrected,
      changed: true,
      notes: result.notes,
      tempHpAbsorbed: 0,
      hpDamage: result.hpDamage,
      healed: 0,
      droppedToZero: result.droppedToZero,
      dying: result.dying,
      wounded: result.wounded,
      dead: result.dead,
    };
  }
  const result = applyHealingToDraft(draft, maximum, target - currentHp);
  return {
    draft: result.draft,
    changed: result.draft !== draft,
    notes: result.notes,
    tempHpAbsorbed: 0,
    hpDamage: 0,
    healed: result.healed,
    droppedToZero: false,
    dying: conditionValue(result.draft.play.conditions, "dying"),
    wounded: conditionValue(result.draft.play.conditions, "wounded"),
    dead: conditionValue(result.draft.play.conditions, "dead") > 0,
  };
}

/** HP edit for a token that has no linked character sheet. */
export function applyHpEditToState(state: HpState, maxHp: number, edit: HpEdit): HpEditResult {
  return applyHpEditToDraft(stateDraft(state), maxHp, edit);
}

/**
 * Keep life-state conditions consistent with current HP after an external
 * edit (a heal, a token HP field, or the Full button). Healing above 0 ends
 * dying/unconscious; reaching full HP ends wounded. Dead is not removed by
 * ordinary healing.
 */
export function reconcileLifeConditions(
  conditions: CharacterCondition[],
  hp: number,
  maxHp: number
): CharacterCondition[] {
  if (conditionValue(conditions, "dead") > 0) return conditions;
  return conditions.filter((condition) => {
    const name = normalizeName(condition.name.replace(/\s+\d+$/, ""));
    if (name === "dying" || name === "unconscious") return hp <= 0;
    // Wounded ends only after a successful Treat Wounds or a full-HP rest.
    // Ordinary healing to full does not remove it immediately.
    return true;
  });
}

export function applyHealingToDraft(
  draft: CharacterDraft,
  maxHp: number,
  amount: number
): HealingResult {
  const healing = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
  const maximum = Math.max(1, Math.round(maxHp));
  if (!healing || conditionValue(draft.play.conditions, "dead") > 0) {
    return { draft, healed: 0, notes: [] };
  }
  const currentHp =
    draft.play.hp === null ? maximum : Math.max(0, Math.min(maximum, Math.round(draft.play.hp)));
  const nextHp = Math.min(maximum, currentHp + healing);
  const healed = nextHp - currentHp;
  if (!healed) return { draft, healed: 0, notes: [] };
  const notes = [`Healed ${healed} HP.`];
  const wasDying = conditionValue(draft.play.conditions, "dying") > 0;
  let conditions = reconcileLifeConditions(draft.play.conditions, nextHp, maximum);
  if (currentHp === 0 && nextHp > 0 && wasDying) {
    const wounded = conditionValue(conditions, "wounded");
    conditions = upsertCondition(conditions, "Wounded", wounded + 1);
    notes.push(`Dying ends: wounded ${wounded + 1}.`);
  }
  if (nextHp >= maximum) notes.push("At full HP: wounded ends after a long rest.");
  return {
    draft: {
      ...draft,
      play: {
        ...draft.play,
        hp: nextHp,
        conditions,
      },
    },
    healed,
    notes,
  };
}

export interface DyingRecoveryResult {
  draft: CharacterDraft;
  dying: number;
  wounded: number;
  dead: boolean;
  ended: boolean;
  notes: string[];
}

export interface HeroicRecoveryResult {
  draft: CharacterDraft;
  applied: boolean;
  spent: number;
  reason: "dead" | "not-dying" | "no-hero-points" | null;
  notes: string[];
}

/**
 * PF2e Heroic Recovery: spend all remaining Hero Points at the start of a turn
 * (or when dying would increase) to stabilize at 0 HP. Unlike ordinary
 * recovery, this does not add wounded.
 */
export function applyHeroicRecovery(draft: CharacterDraft): HeroicRecoveryResult {
  const dying = conditionValue(draft.play.conditions, "dying");
  const dead = conditionValue(draft.play.conditions, "dead") > 0;
  const heroPoints = Math.max(0, Math.floor(Number(draft.play.heroPoints) || 0));
  if (dead) {
    return { draft, applied: false, spent: 0, reason: "dead", notes: [] };
  }
  if (dying <= 0) {
    return { draft, applied: false, spent: 0, reason: "not-dying", notes: [] };
  }
  if (heroPoints < 1) {
    return { draft, applied: false, spent: 0, reason: "no-hero-points", notes: [] };
  }

  let conditions = draft.play.conditions
    .filter((condition) => conditionBaseName(condition.name) !== "dying")
    .map((condition) => ({ ...condition }));
  if (!conditions.some((condition) => conditionBaseName(condition.name) === "unconscious")) {
    conditions = upsertCondition(conditions, "Unconscious", null);
  }
  return {
    draft: {
      ...draft,
      play: {
        ...draft.play,
        hp: 0,
        heroPoints: 0,
        conditions,
      },
    },
    applied: true,
    spent: heroPoints,
    reason: null,
    notes: ["Heroic Recovery: dying ends; the character remains unconscious at 0 HP."],
  };
}

function conditionBaseName(value: string): string {
  const trailing = String(value ?? "")
    .trim()
    .match(/^(.*?)\s+(\d+)$/);
  return normalizeName(trailing?.[1] ?? String(value ?? ""));
}

const DIEHARD_FEAT_ID = "feat:I0BhPWqYf1bbzEYg";
const TOUGHNESS_FEAT_ID = "feat:AmP0qu7c5dlBSath";

function hasFeat(draft: CharacterDraft, featId: string): boolean {
  const feats = draft.feats;
  if (!feats) return false;
  for (const bucket of [
    feats.ancestry,
    feats.class,
    feats.skill,
    feats.general,
    feats.freeArchetype,
  ]) {
    if (bucket && Object.values(bucket).includes(featId)) return true;
  }
  if (Array.isArray(feats.extras) && feats.extras.includes(featId)) return true;
  if (draft.backgroundFeat === featId) return true;
  // Versatile Human, General Training, and similar grants store the chosen
  // feat in featChoices rather than the normal feat buckets.
  for (const choices of Object.values(draft.featChoices ?? {})) {
    if (Array.isArray(choices) && choices.includes(featId)) return true;
  }
  return false;
}

/**
 * PF2e death threshold: dying 4 normally, dying 5 with Diehard, reduced by
 * the doomed condition.
 */
export function deathThresholdForDraft(draft: CharacterDraft): number {
  const base = hasFeat(draft, DIEHARD_FEAT_ID) ? 5 : 4;
  return base - conditionValue(draft.play.conditions, "doomed");
}

/** Dying recovery-check DC, including Toughness's −1 adjustment. */
export function recoveryDcForDraft(draft: CharacterDraft, dying: number): number {
  return (
    10 + Math.max(0, Math.round(Number(dying) || 0)) - (hasFeat(draft, TOUGHNESS_FEAT_ID) ? 1 : 0)
  );
}

/**
 * Apply a start-of-turn dying recovery check. A success reduces dying by 1
 * (critical success by 2) and a failure increases it by 1 (critical failure by
 * 2). Dropping below dying 1 ends dying, keeps unconscious while HP remains 0,
 * and increases wounded by 1. Reaching the doomed-adjusted threshold kills.
 */
export interface DyingRecoveryOptions {
  /** Active regeneration keeps the dying value below the death threshold. */
  regenerationActive?: boolean;
}

export function applyDyingRecovery(
  draft: CharacterDraft,
  degree: DegreeOfSuccess,
  options: DyingRecoveryOptions = {}
): DyingRecoveryResult {
  const existing = conditionValue(draft.play.conditions, "dying");
  const wounded = conditionValue(draft.play.conditions, "wounded");
  const alreadyDead = conditionValue(draft.play.conditions, "dead") > 0;
  if (alreadyDead || existing <= 0) {
    return {
      draft,
      dying: existing,
      wounded,
      dead: alreadyDead,
      ended: existing <= 0,
      notes: [],
    };
  }

  const immediateThreshold = deathThresholdForDraft(draft);
  if (immediateThreshold <= 0) {
    const conditions = draft.play.conditions
      .filter((condition) => conditionBaseName(condition.name) !== "doomed")
      .map((condition) => ({ ...condition }));
    conditions.push({ name: "Dead", value: null, duration: null });
    return {
      draft: { ...draft, play: { ...draft.play, conditions } },
      dying: existing,
      wounded,
      dead: true,
      ended: false,
      notes: ["Doomed lowered the death threshold to 0: the character is dead."],
    };
  }

  const delta =
    degree === "critical-success"
      ? -2
      : degree === "success"
        ? -1
        : degree === "critical-failure"
          ? 2
          : 1;
  let dying = Math.max(0, existing + delta);
  let conditions = draft.play.conditions.map((condition) => ({ ...condition }));
  const notes: string[] = [];
  let ended = false;

  if (dying <= 0) {
    ended = true;
    const hp = draft.play.hp === null ? 1 : Math.max(0, Math.round(draft.play.hp));
    conditions = conditions.filter((condition) => {
      const base = conditionBaseName(condition.name);
      if (base === "dying") return false;
      if (base === "unconscious" && hp > 0) return false;
      return true;
    });
    conditions = upsertCondition(conditions, "Wounded", wounded + 1);
    notes.push(`Dying ends: wounded ${wounded + 1}.`);
  } else {
    const deathThreshold = deathThresholdForDraft(draft);
    if (options.regenerationActive && deathThreshold > 0 && dying >= deathThreshold) {
      dying = Math.max(0, deathThreshold - 1);
      notes.push(`Regeneration prevents death: dying capped at ${dying}.`);
    }
    conditions = upsertCondition(conditions, "Dying", dying);
    notes.push(`Dying ${existing} → ${dying}.`);
    if (deathThreshold <= 0 || dying >= deathThreshold) {
      conditions = conditions.filter((condition) => conditionBaseName(condition.name) !== "doomed");
      conditions = upsertCondition(conditions, "Dead", null);
      notes.push(
        deathThreshold <= 0
          ? "Doomed lowered the death threshold to 0: the character is dead."
          : `Dying ${deathThreshold} reached: the character is dead unless the GM intervenes.`
      );
    }
  }

  return {
    draft: {
      ...draft,
      play: { ...draft.play, conditions },
    },
    dying,
    wounded: conditionValue(conditions, "wounded"),
    dead: conditionValue(conditions, "dead") > 0,
    ended,
    notes,
  };
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

function conditionValue(conditions: CharacterCondition[], name: string): number {
  const wanted = normalizeName(name);
  let value = 0;
  for (const condition of conditions) {
    const rawName = String(condition.name ?? "").trim();
    const trailing = rawName.match(/^(.*?)\s+(\d+)$/);
    const parsedName = normalizeName(trailing?.[1] ?? rawName);
    if (parsedName !== wanted) continue;
    const parsedValue = Math.max(
      0,
      Math.round(Number(condition.value ?? (trailing ? Number(trailing[2]) : 1)))
    );
    value = Math.max(value, parsedValue);
  }
  return value;
}

function upsertCondition(
  conditions: CharacterCondition[],
  name: string,
  value: number | null
): CharacterCondition[] {
  const wanted = normalizeName(name);
  const next = conditions.filter((condition) => {
    const rawName = String(condition.name ?? "").trim();
    const trailing = rawName.match(/^(.*?)\s+(\d+)$/);
    return normalizeName(trailing?.[1] ?? rawName) !== wanted;
  });
  next.push({ name, value, duration: null });
  return next;
}

export function applyDamageToDraft(
  draft: CharacterDraft,
  maxHp: number,
  amount: number,
  options: DamageOptions = {}
): DamageResult {
  const damage = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
  const suppression = options.damageTypes?.length
    ? suppressRegenerationFromDamage(draft.play, options.damageTypes)
    : null;
  const working = suppression?.applied
    ? {
        ...draft,
        play: { ...draft.play, conditions: suppression.conditions },
      }
    : draft;
  const regenerationActive = characterRegenerationActive(working.play);
  const currentHp =
    working.play.hp === null
      ? Math.max(1, Math.round(maxHp))
      : Math.max(0, Math.min(Math.max(1, Math.round(maxHp)), Math.round(working.play.hp)));
  const tempHp = Math.max(0, Math.round(working.play.tempHp));
  const notes: string[] = [];
  if (suppression?.applied) {
    notes.push(`Regeneration suppressed by ${suppression.types.join(", ")}.`);
  }
  if (!damage || conditionValue(working.play.conditions, "dead") > 0) {
    return {
      draft: working,
      tempHpAbsorbed: 0,
      hpDamage: 0,
      droppedToZero: false,
      dying: conditionValue(working.play.conditions, "dying"),
      wounded: conditionValue(working.play.conditions, "wounded"),
      dead: conditionValue(working.play.conditions, "dead") > 0,
      notes,
    };
  }

  const tempHpAbsorbed = Math.min(tempHp, damage);
  const hpDamage = Math.min(currentHp, damage - tempHpAbsorbed);
  const nextHp = Math.max(0, currentHp - hpDamage);
  if (tempHpAbsorbed) notes.push(`Absorbed ${tempHpAbsorbed} damage with temporary HP.`);
  if (hpDamage) notes.push(`Took ${hpDamage} damage.`);

  let conditions = working.play.conditions.map((condition) => ({ ...condition }));
  let dying = 0;
  let dead = false;
  const droppedToZero = currentHp > 0 && nextHp === 0;
  const damageToHp = Math.max(0, damage - tempHpAbsorbed);

  // PF2e Massive Damage: a single blow equal to or greater than double your
  // maximum HP kills instantly. Nonlethal damage never does.
  if (!options.nonlethal && damageToHp >= 2 * Math.max(1, Math.round(maxHp))) {
    conditions = conditions.filter(
      (condition) => !["dying", "unconscious", "doomed"].includes(conditionBaseName(condition.name))
    );
    conditions = upsertCondition(conditions, "Dead", null);
    notes.push(
      `Massive damage (${damageToHp} against ${Math.max(1, Math.round(maxHp))} max HP): the character dies.`
    );
    return {
      draft: {
        ...working,
        play: {
          ...working.play,
          hp: 0,
          tempHp: tempHp - tempHpAbsorbed,
          conditions,
        },
      },
      tempHpAbsorbed,
      hpDamage,
      droppedToZero: true,
      dying: 0,
      wounded: conditionValue(conditions, "wounded"),
      dead: true,
      notes,
    };
  }

  if (nextHp === 0) {
    if (options.nonlethal) {
      conditions = conditions.filter((condition) => conditionBaseName(condition.name) !== "dying");
      conditions = upsertCondition(conditions, "Unconscious", null);
      notes.push("Nonlethal damage: the character is unconscious at 0 HP, not dying.");
    } else {
      const existingDying = conditionValue(conditions, "dying");
      const wounded = conditionValue(conditions, "wounded");
      const criticalBonus = options.critical ? 1 : 0;
      if (existingDying > 0) {
        dying = existingDying + 1 + criticalBonus;
      } else {
        dying = 1 + (wounded > 0 ? wounded : 0) + criticalBonus;
      }
      const deathThreshold = deathThresholdForDraft(working);
      if (regenerationActive && deathThreshold > 0 && dying >= deathThreshold) {
        dying = Math.max(0, deathThreshold - 1);
        notes.push(`Regeneration prevents death: dying capped at ${dying}.`);
      }
      conditions = upsertCondition(conditions, "Dying", dying);
      conditions = upsertCondition(conditions, "Unconscious", null);
      notes.push(`Dropped to 0 HP: dying ${dying} and unconscious.`);
      notes.push(
        `Recovery check DC ${recoveryDcForDraft(working, dying)} at the start of each turn.`
      );
      if (deathThreshold <= 0 || dying >= deathThreshold) {
        dead = true;
        conditions = conditions.filter(
          (condition) => conditionBaseName(condition.name) !== "doomed"
        );
        conditions = upsertCondition(conditions, "Dead", null);
        notes.push(
          deathThreshold <= 0
            ? "Doomed lowered the death threshold to 0: the character is dead."
            : `Dying ${deathThreshold} reached: the character is dead unless the GM intervenes.`
        );
      }
    }
  } else if (hpDamage) {
    notes.push(`${nextHp} HP remaining.`);
  }

  return {
    draft: {
      ...working,
      play: {
        ...working.play,
        hp: nextHp,
        tempHp: tempHp - tempHpAbsorbed,
        conditions,
      },
    },
    tempHpAbsorbed,
    hpDamage,
    droppedToZero,
    dying,
    wounded: conditionValue(conditions, "wounded"),
    dead,
    notes,
  };
}
