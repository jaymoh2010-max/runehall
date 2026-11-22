import { applyDamageToDraft, applyHealingToDraft } from "./damage";
import { conditionBaseName, conditionNumericValue } from "./tokens";
import type {
  CharacterCondition,
  CharacterDraft,
  DegreeOfSuccess,
  DerivedCharacter,
} from "./types";

export type RecoveryActivity = "treat-wounds" | "battle-medicine" | "stabilize";

export const RECOVERY_ACTIVITIES: RecoveryActivity[] = [
  "treat-wounds",
  "battle-medicine",
  "stabilize",
];

export const RECOVERY_LABELS: Record<RecoveryActivity, string> = {
  "treat-wounds": "Treat Wounds",
  "battle-medicine": "Battle Medicine",
  stabilize: "Stabilize",
};

/** Treat Wounds and Battle Medicine use the same DC ladder. */
export const RECOVERY_DCS = [15, 20, 30, 40] as const;

export function recoveryActivityLabel(activity: RecoveryActivity): string {
  return RECOVERY_LABELS[activity];
}

export function medicineRank(derived: Pick<DerivedCharacter, "skills">): number {
  return (
    derived.skills.find((skill) => skill.id === "medicine")?.rank ??
    derived.skills.find((skill) => skill.name.toLowerCase() === "medicine")?.rank ??
    0
  );
}

/**
 * A trained character may attempt the DC matching their rank or any lower DC.
 * Stabilize has a fixed DC 15 check.
 */
export function recoveryDcsForRank(
  rank: number,
  activity: RecoveryActivity = "treat-wounds"
): number[] {
  if (Math.round(rank) < 1) return [];
  if (activity === "stabilize") return [15];
  const safeRank = Math.min(4, Math.round(rank));
  return RECOVERY_DCS.slice(0, safeRank).map((dc) => Number(dc));
}

export function recoveryHealingFormula(dc: number): string | null {
  if (dc >= 40) return "4d8+30";
  if (dc >= 30) return "4d8+10";
  if (dc >= 20) return "2d8+10";
  if (dc >= 15) return "2d8";
  return null;
}

export function recoveryHealingMultiplier(degree: DegreeOfSuccess): number {
  if (degree === "critical-success") return 2;
  if (degree === "success") return 1;
  return 0;
}

export function hasRecoveryFeat(
  derived: Pick<DerivedCharacter, "selectedFeats" | "grantedFeats">,
  name: string
): boolean {
  const wanted = name.trim().toLowerCase();
  return [...derived.selectedFeats, ...derived.grantedFeats].some(
    (feat) => feat.name.trim().toLowerCase() === wanted
  );
}

export interface RecoveryOutcome {
  draft: CharacterDraft;
  healed: number;
  damage: number;
  notes: string[];
}

function conditionValue(conditions: CharacterCondition[], name: string): number {
  const wanted = name.trim().toLowerCase();
  return conditions.reduce((highest, condition) => {
    if (conditionBaseName(condition.name) !== wanted) return highest;
    return Math.max(highest, conditionNumericValue(condition) ?? 0);
  }, 0);
}

function removeCondition(conditions: CharacterCondition[], name: string): CharacterCondition[] {
  const wanted = name.trim().toLowerCase();
  return conditions.filter((condition) => conditionBaseName(condition.name) !== wanted);
}

function upsertCondition(
  conditions: CharacterCondition[],
  name: string,
  value: number | null
): CharacterCondition[] {
  const wanted = name.trim().toLowerCase();
  let found = false;
  const next = conditions.map((condition) => {
    if (conditionBaseName(condition.name) !== wanted) return condition;
    found = true;
    return { ...condition, name, value };
  });
  if (!found) next.push({ name, value, duration: null });
  return next;
}

function ensureUnconscious(conditions: CharacterCondition[], hp: number): CharacterCondition[] {
  if (hp > 0) return removeCondition(conditions, "unconscious");
  return upsertCondition(conditions, "Unconscious", null);
}

function withConditions(draft: CharacterDraft, conditions: CharacterCondition[]): CharacterDraft {
  return { ...draft, play: { ...draft.play, conditions } };
}

/**
 * Apply the result of a completed Treat Wounds, Battle Medicine, or Stabilize
 * check. The caller rolls the Medicine check and any healing/damage dice and
 * passes the raw totals here so the HP, dying, and immunity rules stay in one
 * pure place.
 */
export function applyRecoveryToDraft(options: {
  draft: CharacterDraft;
  maxHp: number;
  level: number;
  activity: RecoveryActivity;
  degree: DegreeOfSuccess;
  /** Raw healing dice total before Robust Health and critical doubling. */
  healing?: number;
  /** Raw critical-failure damage, normally 1d8. */
  damage?: number;
  healerId: string;
  robustHealth?: boolean;
  continualRecovery?: boolean;
}): RecoveryOutcome {
  const {
    draft,
    maxHp,
    level,
    activity,
    degree,
    healerId,
    robustHealth = false,
    continualRecovery = false,
  } = options;
  const rawHealing = Math.max(0, Math.round(Number(options.healing) || 0));
  const rawDamage = Math.max(0, Math.round(Number(options.damage) || 0));
  const notes: string[] = [];

  if (activity === "stabilize") {
    const dying = conditionValue(draft.play.conditions, "dying");
    if (dying <= 0) {
      return {
        draft,
        healed: 0,
        damage: 0,
        notes: ["Stabilize has no effect: the target is not dying."],
      };
    }
    if (degree === "critical-failure") {
      const doomed = conditionValue(draft.play.conditions, "doomed");
      const deathThreshold = 4 - doomed;
      const nextDying = dying + 1;
      if (nextDying >= deathThreshold) {
        const conditions = upsertCondition(draft.play.conditions, "Dead", null);
        notes.push(`Stabilize critically failed: dying ${nextDying} reaches the death threshold.`);
        return {
          draft: withConditions(draft, conditions),
          healed: 0,
          damage: 0,
          notes,
        };
      }
      notes.push(`Stabilize critically failed: dying increases to ${nextDying}.`);
      return {
        draft: withConditions(draft, upsertCondition(draft.play.conditions, "Dying", nextDying)),
        healed: 0,
        damage: 0,
        notes,
      };
    }
    if (degree === "failure") {
      return {
        draft,
        healed: 0,
        damage: 0,
        notes: ["Stabilize failed: the target remains dying."],
      };
    }

    const withoutDying = removeCondition(draft.play.conditions, "dying");
    if (degree === "critical-success") {
      const healed = applyHealingToDraft(withConditions(draft, withoutDying), maxHp, 1);
      notes.push("Stabilize critical success: dying ends and the target regains 1 HP.");
      notes.push(...healed.notes);
      return {
        draft: withConditions(
          healed.draft,
          ensureUnconscious(healed.draft.play.conditions, healed.draft.play.hp ?? 0)
        ),
        healed: healed.healed,
        damage: 0,
        notes,
      };
    }
    notes.push("Stabilize succeeded: dying ends; the target remains unconscious at 0 HP.");
    return {
      draft: withConditions(draft, ensureUnconscious(withoutDying, draft.play.hp ?? 0)),
      healed: 0,
      damage: 0,
      notes,
    };
  }

  if (activity === "treat-wounds") {
    const conditions = draft.play.conditions.map((condition) => ({ ...condition }));
    let working = withConditions(draft, conditions);
    working = {
      ...working,
      play: { ...working.play, treatWoundsImmune: true },
    };
    const multiplier = recoveryHealingMultiplier(degree);
    if (multiplier > 0) {
      const robustBonus = robustHealth ? Math.max(1, Math.round(level)) : 0;
      const amount = (rawHealing + robustBonus) * multiplier;
      const healed = applyHealingToDraft(working, maxHp, amount);
      notes.push(
        `Treat Wounds ${degree === "critical-success" ? "critical success" : "success"}: ${amount} HP restored${robustHealth ? ` (includes +${Math.max(1, Math.round(level))} from Robust Health)` : ""}.`
      );
      notes.push(...healed.notes);
      notes.push(
        continualRecovery
          ? "Target is immune to further Treat Wounds for 10 minutes (Continual Recovery)."
          : "Target is immune to further Treat Wounds for 1 hour."
      );
      return {
        draft: healed.draft,
        healed: healed.healed,
        damage: 0,
        notes,
      };
    }
    if (degree === "critical-failure") {
      const damaged = applyDamageToDraft(working, maxHp, rawDamage);
      notes.push(`Treat Wounds critical failure: ${damaged.hpDamage} damage.`);
      notes.push(...damaged.notes);
      notes.push(
        continualRecovery
          ? "Target is immune to further Treat Wounds for 10 minutes (Continual Recovery)."
          : "Target is immune to further Treat Wounds for 1 hour."
      );
      return {
        draft: damaged.draft,
        healed: 0,
        damage: damaged.hpDamage,
        notes,
      };
    }
    notes.push("Treat Wounds failed: no HP restored.");
    notes.push(
      continualRecovery
        ? "Target is immune to further Treat Wounds for 10 minutes (Continual Recovery)."
        : "Target is immune to further Treat Wounds for 1 hour."
    );
    return { draft: working, healed: 0, damage: 0, notes };
  }

  // Battle Medicine uses the same healing ladder but never damages on a
  // critical failure. The target is immune to this healer for 1 day.
  const conditions = draft.play.conditions.map((condition) => ({ ...condition }));
  let working = withConditions(draft, conditions);
  working = {
    ...working,
    play: {
      ...working.play,
      battleMedicineImmuneBy: [
        ...new Set([...working.play.battleMedicineImmuneBy, healerId]),
      ].slice(0, 40),
    },
  };
  const multiplier = recoveryHealingMultiplier(degree);
  if (multiplier > 0) {
    const robustBonus = robustHealth ? Math.max(1, Math.round(level)) : 0;
    const amount = (rawHealing + robustBonus) * multiplier;
    const healed = applyHealingToDraft(working, maxHp, amount);
    notes.push(
      `Battle Medicine ${degree === "critical-success" ? "critical success" : "success"}: ${amount} HP restored${robustHealth ? ` (includes +${Math.max(1, Math.round(level))} from Robust Health)` : ""}.`
    );
    notes.push(...healed.notes);
    notes.push(
      robustHealth
        ? "Target is immune to this healer's Battle Medicine for 1 hour (Robust Health)."
        : "Target is immune to this healer's Battle Medicine for 1 day."
    );
    return {
      draft: healed.draft,
      healed: healed.healed,
      damage: 0,
      notes,
    };
  }
  notes.push("Battle Medicine failed: no HP restored.");
  notes.push(
    robustHealth
      ? "Target is immune to this healer's Battle Medicine for 1 hour (Robust Health)."
      : "Target is immune to this healer's Battle Medicine for 1 day."
  );
  return { draft: working, healed: 0, damage: 0, notes };
}

/** Daily preparations end all Treat Wounds and Battle Medicine immunities. */
export function clearRecoveryImmunities(draft: CharacterDraft): CharacterDraft {
  if (!draft.play.treatWoundsImmune && draft.play.battleMedicineImmuneBy.length === 0) {
    return draft;
  }
  return {
    ...draft,
    play: {
      ...draft.play,
      treatWoundsImmune: false,
      battleMedicineImmuneBy: [],
    },
  };
}
