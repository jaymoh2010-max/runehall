import { conditionBaseName, conditionNameWithoutValue, conditionNumericValue } from "./tokens";
import { resetItemUses } from "./itemActivation";
import type { CharacterCondition, CharacterDraft, DerivedCharacter } from "./types";

export interface LongRestOptions {
  /** An uncomfortable or interrupted night halves natural healing (minimum 1). */
  rough?: boolean;
  /** Mark today's spell preparations as still needing confirmation. */
  preparedCaster?: boolean;
}

export interface LongRestSummary {
  /** Natural healing before the maximum-HP cap. */
  healing: number;
  /** Hit Points actually regained after the cap. */
  healed: number;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  tempHpCleared: number;
  focusBefore: number;
  focusAfter: number;
  focusMax: number;
  slotsRestored: number;
  divineFontRestored: number;
  removedConditions: string[];
  reducedConditions: { name: string; from: number; to: number }[];
  shieldLowered: boolean;
}

export interface LongRestResult {
  draft: CharacterDraft;
  summary: LongRestSummary;
}

type RestDerived = Pick<DerivedCharacter, "maxHp" | "abilityMods" | "focusPointsMax">;

/**
 * PF2e natural healing from an 8-hour rest: Constitution modifier (minimum 1)
 * multiplied by level. An uncomfortable rest can halve this, minimum 1 HP.
 */
export function longRestHealing(
  draft: CharacterDraft,
  derived: Pick<DerivedCharacter, "abilityMods">,
  rough = false
): number {
  const base = Math.max(1, derived.abilityMods.con) * Math.max(1, draft.level);
  return rough ? Math.max(1, Math.ceil(base / 2)) : base;
}

function restoreConditions(
  conditions: CharacterCondition[],
  hpAfter: number,
  maxHp: number
): {
  conditions: CharacterCondition[];
  removed: string[];
  reduced: { name: string; from: number; to: number }[];
} {
  const next: CharacterCondition[] = [];
  const removed: string[] = [];
  const reduced: { name: string; from: number; to: number }[] = [];

  for (const condition of conditions) {
    const name = conditionBaseName(condition.name);
    if (name === "fatigued") {
      removed.push(condition.name);
      continue;
    }
    if ((name === "dying" || name === "unconscious") && hpAfter > 0) {
      removed.push(condition.name);
      continue;
    }
    if (name === "wounded" && hpAfter >= maxHp) {
      removed.push(condition.name);
      continue;
    }
    if (name === "doomed" || name === "drained") {
      const value = conditionNumericValue(condition);
      if (value !== null) {
        if (value <= 1) {
          removed.push(condition.name);
          continue;
        }
        const baseName = conditionNameWithoutValue(condition.name);
        reduced.push({ name: baseName, from: value, to: value - 1 });
        next.push({ ...condition, name: baseName, value: value - 1 });
        continue;
      }
    }
    next.push(condition);
  }

  return { conditions: next, removed, reduced };
}

/**
 * Apply PF2e rest and daily preparations to a character draft. This is a pure
 * helper: the input draft is not modified.
 *
 * - Heals CON modifier (minimum 1) x level, capped at maximum HP.
 * - Clears temporary HP, resets spell slots, divine font, focus points, and
 *   lowers the shield.
 * - Removes fatigued; reduces doomed and drained by 1; removes wounded when
 *   the character is at full HP; clears dying and unconscious once above 0 HP.
 * - Leaves the prepared list, hero points, XP, and unrelated conditions alone;
 *   prepared casters are marked as needing to confirm today's preparations.
 */
export function applyLongRest(
  draft: CharacterDraft,
  derived: RestDerived,
  options: LongRestOptions = {}
): LongRestResult {
  const maxHp = Math.max(1, Math.round(derived.maxHp));
  const hpBefore =
    draft.play.hp === null ? maxHp : Math.max(0, Math.min(maxHp, Math.round(draft.play.hp)));
  const focusMax = Math.max(0, Math.min(3, Math.round(derived.focusPointsMax)));
  const focusBefore = Math.max(0, Math.min(focusMax, Math.round(draft.play.focusPoints)));
  const dead = draft.play.conditions.some(
    (condition) => conditionBaseName(condition.name) === "dead"
  );
  if (dead) {
    return {
      draft,
      summary: {
        healing: 0,
        healed: 0,
        hpBefore,
        hpAfter: hpBefore,
        maxHp,
        tempHpCleared: 0,
        focusBefore,
        focusAfter: focusBefore,
        focusMax,
        slotsRestored: 0,
        divineFontRestored: 0,
        removedConditions: [],
        reducedConditions: [],
        shieldLowered: false,
      },
    };
  }
  const healing = longRestHealing(draft, derived, options.rough);
  const hpAfter = Math.min(maxHp, hpBefore + healing);
  const healed = hpAfter - hpBefore;
  const conditionResult = restoreConditions(draft.play.conditions, hpAfter, maxHp);
  const slotsRestored = Object.values(draft.spells.slotsUsed).reduce(
    (total, value) => total + Math.max(0, Math.round(Number(value) || 0)),
    0
  );

  return {
    draft: resetItemUses({
      ...draft,
      spells: {
        ...draft.spells,
        divineFontUsed: 0,
        slotsUsed: {},
        preparedUsed: {},
        fontUsed: {},
        preparationsPending: options.preparedCaster === true,
      },
      play: {
        ...draft.play,
        hp: hpAfter,
        tempHp: 0,
        focusPoints: focusMax,
        conditions: conditionResult.conditions,
        sustainedSpells: [],
        treatWoundsImmune: false,
        battleMedicineImmuneBy: [],
        shieldRaised: false,
      },
    }),
    summary: {
      healing,
      healed,
      hpBefore,
      hpAfter,
      maxHp,
      tempHpCleared: Math.max(0, Math.round(draft.play.tempHp)),
      focusBefore,
      focusAfter: focusMax,
      focusMax,
      slotsRestored,
      divineFontRestored: Math.max(0, Math.round(draft.spells.divineFontUsed)),
      removedConditions: conditionResult.removed,
      reducedConditions: conditionResult.reduced,
      shieldLowered: draft.play.shieldRaised,
    },
  };
}
