import { applyDyingRecovery, applyHpEditToDraft } from "./damage";
import {
  characterRegenerationActive,
  characterTurnHealingParts,
  clearRegenerationSuppression,
} from "./characterTurnEffects";
import { rollFormula, validateFormula } from "./dice";
import type {
  CharacterDraft,
  PersistentDamageInstance,
  RollResult,
  TokenTurnEffects,
} from "./types";

export type TurnAutomationRng = () => number;

export interface TurnAutomationOptions {
  rng?: TurnAutomationRng;
  labelPrefix?: string;
}

export interface StartOfTurnResult {
  draft: CharacterDraft;
  changed: boolean;
  dyingBefore: number;
  recovery: RollResult | null;
  heroicRecoveryAvailable: boolean;
  /** HP regained from fast healing and regeneration at the start of the turn. */
  healing: number;
  notes: string[];
  ended: boolean;
  dead: boolean;
}

export interface EndOfTurnRoll {
  instance: PersistentDamageInstance;
  damage: RollResult;
  flatCheck: RollResult | null;
  ended: boolean;
}

export interface EndOfTurnResult {
  draft: CharacterDraft;
  changed: boolean;
  totalDamage: number;
  rolls: EndOfTurnRoll[];
  notes: string[];
  dead: boolean;
}

export interface TokenEndOfTurnResult {
  changed: boolean;
  totalDamage: number;
  rolls: EndOfTurnRoll[];
  remaining: PersistentDamageInstance[];
  notes: string[];
}

function normalizedConditionName(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, " ");
}

function conditionValue(conditions: CharacterDraft["play"]["conditions"], name: string): number {
  const wanted = normalizedConditionName(name);
  for (const condition of conditions) {
    const raw = String(condition.name ?? "").trim();
    const trailing = raw.match(/^(.*?)\s+(\d+)$/);
    const base = normalizedConditionName(trailing?.[1] ?? raw);
    if (base !== wanted) continue;
    const value = trailing ? Number(trailing[2]) : Number(condition.value ?? 1);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 1;
  }
  return 0;
}

export function dyingValue(draft: CharacterDraft): number {
  return conditionValue(draft.play.conditions, "dying");
}

function hasDead(draft: CharacterDraft): boolean {
  return conditionValue(draft.play.conditions, "dead") > 0;
}

function label(prefix: string | undefined, suffix: string): string {
  return prefix ? `${prefix} · ${suffix}` : suffix;
}

/**
 * Start-of-turn effects. Fast healing and regeneration restore HP first, then
 * a still-dying character chooses between Heroic Recovery and a recovery check.
 * Regeneration suppression is cleared after the skipped healing so it skips
 * exactly one start-of-turn regeneration tick.
 */
export function resolveStartOfTurn(
  draft: CharacterDraft,
  maxHp: number,
  options: TurnAutomationOptions = {}
): StartOfTurnResult {
  const healingParts = characterTurnHealingParts(draft.play);
  let current = draft;
  let healing = 0;
  const notes: string[] = [];
  if (healingParts.total > 0) {
    const applied = applyHpEditToDraft(draft, Math.max(1, Math.round(maxHp)), {
      type: "heal",
      amount: healingParts.total,
    });
    current = applied.draft;
    healing = applied.healed;
    notes.push(...applied.notes);
  }
  const regenerationActive = characterRegenerationActive(draft.play);
  if (!hasDead(current) && healingParts.suppressed && draft.play.regeneration > 0) {
    current = {
      ...current,
      play: {
        ...current.play,
        conditions: clearRegenerationSuppression(current.play.conditions),
      },
    };
  }

  const dyingBefore = dyingValue(current);
  if (dyingBefore <= 0 || hasDead(current)) {
    return {
      draft: current,
      changed: current !== draft,
      dyingBefore,
      recovery: null,
      heroicRecoveryAvailable: false,
      healing,
      notes,
      ended: dyingBefore <= 0,
      dead: hasDead(current),
    };
  }
  if (current.play.heroPoints > 0) {
    return {
      draft: current,
      changed: current !== draft,
      dyingBefore,
      recovery: null,
      heroicRecoveryAvailable: true,
      healing,
      notes: [...notes, "Heroic Recovery is available."],
      ended: false,
      dead: false,
    };
  }

  const recovery = rollFormula("1d20", {
    dc: 10 + dyingBefore,
    label: label(options.labelPrefix, "Dying recovery check"),
    rng: options.rng,
  });
  const applied = applyDyingRecovery(current, recovery.degree ?? "failure", {
    regenerationActive,
  });
  return {
    draft: applied.draft,
    changed: applied.draft !== draft,
    dyingBefore,
    recovery,
    heroicRecoveryAvailable: false,
    healing,
    notes: [...notes, ...applied.notes],
    ended: applied.ended,
    dead: applied.dead,
  };
}

/**
 * End-of-turn persistent damage. PF2e applies all persistent damage at once,
 * updates dying once, then attempts one DC 15 flat check per damage type.
 * A lethal tick stops before the flat checks.
 *
 * Same-type duplicates are normally replaced by the sheet editor. Imported or
 * hand-edited drafts with duplicates are left alone rather than guessing which
 * formula is stronger.
 */
export function resolveEndOfTurn(
  draft: CharacterDraft,
  maxHp: number,
  options: TurnAutomationOptions = {}
): EndOfTurnResult {
  if (hasDead(draft)) {
    return {
      draft,
      changed: false,
      totalDamage: 0,
      rolls: [],
      notes: [],
      dead: true,
    };
  }
  const instances = draft.play.persistentDamage.filter(
    (instance) => validateFormula(instance.formula).ok
  );
  if (!instances.length) {
    return {
      draft,
      changed: false,
      totalDamage: 0,
      rolls: [],
      notes: [],
      dead: false,
    };
  }

  let totalDamage = 0;
  const damageRolls = new Map<string, RollResult>();
  for (const instance of instances) {
    const damage = rollFormula(instance.formula, {
      label: label(options.labelPrefix, `Persistent ${instance.type} damage`),
      rng: options.rng,
    });
    damageRolls.set(instance.id, damage);
    totalDamage += Math.max(0, Math.round(damage.total));
  }

  let next = draft;
  let dead = false;
  const notes: string[] = [];
  if (totalDamage > 0) {
    const applied = applyHpEditToDraft(draft, Math.max(1, Math.round(maxHp)), {
      type: "damage",
      amount: totalDamage,
      damageTypes: [...new Set(instances.map((instance) => instance.type))],
    });
    next = applied.draft;
    dead = applied.dead;
    notes.push(...applied.notes);
  }

  const rolls: EndOfTurnRoll[] = [];
  const endedIds = new Set<string>();
  for (const instance of instances) {
    const damage = damageRolls.get(instance.id)!;
    if (dead) {
      rolls.push({ instance, damage, flatCheck: null, ended: false });
      continue;
    }
    const flatCheck = rollFormula("1d20", {
      dc: instance.dc,
      label: label(options.labelPrefix, `Persistent ${instance.type} flat check`),
      rng: options.rng,
    });
    const ended = flatCheck.degree === "success" || flatCheck.degree === "critical-success";
    if (ended) endedIds.add(instance.id);
    rolls.push({ instance, damage, flatCheck, ended });
  }

  if (endedIds.size) {
    next = {
      ...next,
      play: {
        ...next.play,
        persistentDamage: next.play.persistentDamage.filter(
          (instance) => !endedIds.has(instance.id)
        ),
      },
    };
    for (const instance of instances) {
      if (endedIds.has(instance.id)) {
        notes.push(`Persistent ${instance.type} ends.`);
      }
    }
  }

  return {
    draft: next,
    changed: totalDamage > 0 || endedIds.size > 0,
    totalDamage,
    rolls,
    notes,
    dead,
  };
}

/**
 * End-of-turn persistent damage for an unlinked token. HP and conditions are
 * applied by the caller so the existing unlinked-token HP helper stays the
 * single source of truth for dying/unconscious/dead.
 */
export function resolveTokenEndOfTurn(
  effects: TokenTurnEffects,
  options: TurnAutomationOptions = {},
  dead = false
): TokenEndOfTurnResult {
  if (dead) {
    return {
      changed: false,
      totalDamage: 0,
      rolls: [],
      remaining: effects.persistentDamage,
      notes: [],
    };
  }
  const instances = effects.persistentDamage.filter(
    (instance) => validateFormula(instance.formula).ok
  );
  if (!instances.length) {
    return {
      changed: false,
      totalDamage: 0,
      rolls: [],
      remaining: effects.persistentDamage,
      notes: [],
    };
  }

  let totalDamage = 0;
  const damageRolls = new Map<string, RollResult>();
  for (const instance of instances) {
    const damage = rollFormula(instance.formula, {
      label: label(options.labelPrefix, `Persistent ${instance.type} damage`),
      rng: options.rng,
    });
    damageRolls.set(instance.id, damage);
    totalDamage += Math.max(0, Math.round(damage.total));
  }

  const rolls: EndOfTurnRoll[] = [];
  const endedIds = new Set<string>();
  for (const instance of instances) {
    const damage = damageRolls.get(instance.id)!;
    const flatCheck = rollFormula("1d20", {
      dc: instance.dc,
      label: label(options.labelPrefix, `Persistent ${instance.type} flat check`),
      rng: options.rng,
    });
    const ended = flatCheck.degree === "success" || flatCheck.degree === "critical-success";
    if (ended) endedIds.add(instance.id);
    rolls.push({ instance, damage, flatCheck, ended });
  }

  return {
    changed: totalDamage > 0 || endedIds.size > 0,
    totalDamage,
    rolls,
    remaining: effects.persistentDamage.filter((instance) => !endedIds.has(instance.id)),
    notes: [],
  };
}
