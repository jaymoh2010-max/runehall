import type { CharacterCondition, CharacterDraft } from "./types";

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
}

export interface HealingResult {
  draft: CharacterDraft;
  healed: number;
  notes: string[];
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
    const name = normalizeName(condition.name);
    if (name === "dying" || name === "unconscious") return hp <= 0;
    if (name === "wounded") return hp < Math.max(1, maxHp);
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
  if (currentHp === 0 && nextHp > 0) notes.push("Dying and unconscious end above 0 HP.");
  if (nextHp >= maximum) notes.push("At full HP: wounded ends.");
  return {
    draft: {
      ...draft,
      play: {
        ...draft.play,
        hp: nextHp,
        conditions: reconcileLifeConditions(draft.play.conditions, nextHp, maximum),
      },
    },
    healed,
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
  const currentHp =
    draft.play.hp === null
      ? Math.max(1, Math.round(maxHp))
      : Math.max(0, Math.min(Math.max(1, Math.round(maxHp)), Math.round(draft.play.hp)));
  const tempHp = Math.max(0, Math.round(draft.play.tempHp));
  if (!damage || conditionValue(draft.play.conditions, "dead") > 0) {
    return {
      draft,
      tempHpAbsorbed: 0,
      hpDamage: 0,
      droppedToZero: false,
      dying: conditionValue(draft.play.conditions, "dying"),
      wounded: conditionValue(draft.play.conditions, "wounded"),
      dead: conditionValue(draft.play.conditions, "dead") > 0,
      notes: [],
    };
  }

  const tempHpAbsorbed = Math.min(tempHp, damage);
  const hpDamage = Math.min(currentHp, damage - tempHpAbsorbed);
  const nextHp = Math.max(0, currentHp - hpDamage);
  const notes: string[] = [];
  if (tempHpAbsorbed) notes.push(`Absorbed ${tempHpAbsorbed} damage with temporary HP.`);
  if (hpDamage) notes.push(`Took ${hpDamage} damage.`);

  let conditions = draft.play.conditions.map((condition) => ({ ...condition }));
  let dying = 0;
  let dead = false;
  const droppedToZero = currentHp > 0 && nextHp === 0;
  if (nextHp === 0) {
    const existingDying = conditionValue(conditions, "dying");
    const wounded = conditionValue(conditions, "wounded");
    const criticalBonus = options.critical ? 1 : 0;
    if (existingDying > 0) {
      dying = existingDying + 1 + criticalBonus;
    } else {
      dying = 1 + (wounded > 0 ? wounded : 0) + criticalBonus;
    }
    conditions = upsertCondition(conditions, "Dying", dying);
    conditions = upsertCondition(conditions, "Unconscious", null);
    notes.push(`Dropped to 0 HP: dying ${dying} and unconscious.`);
    notes.push(`Recovery check DC ${10 + dying} at the start of each turn.`);
    if (dying >= 4) {
      dead = true;
      conditions = upsertCondition(conditions, "Dead", null);
      notes.push("Dying 4 reached: the character is dead unless the GM intervenes.");
    }
  } else if (hpDamage) {
    notes.push(`${nextHp} HP remaining.`);
  }

  return {
    draft: {
      ...draft,
      play: {
        ...draft.play,
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
