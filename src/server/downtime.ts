import {
  DOWNTIME_MAX_ACTIVITIES,
  defaultSubsistDc,
  earnIncomeCp,
  normalizeDowntimeKind,
} from "../shared/downtime";
import { rollFormula } from "../shared/dice";
import { dcForLevel } from "../shared/gmScreen";
import { addCurrency, currencyToCp, spendCurrency } from "../shared/inventory";
import { conditionBaseName } from "../shared/tokens";
import { lifestyleRate, upkeepCostCp } from "../shared/upkeep";
import type {
  CharacterDraft,
  DegreeOfSuccess,
  DerivedCharacter,
  DowntimeActivity,
  DowntimeActivityKind,
  RollResult,
} from "../shared/types";

export interface DowntimeActivityInput {
  activityId?: string;
  kind?: string;
  skill?: string;
  taskLevel?: number;
  dc?: number;
  label?: string;
  daysRequired?: number;
  notes?: string;
}

export interface DowntimeDayResult {
  activity: DowntimeActivity | null;
  roll: RollResult | null;
  degree: DegreeOfSuccess | null;
  earnedCp: number;
  paidCp: number;
  upkeepWaived: boolean;
  completed: boolean;
}

export interface DowntimeDayFailure {
  error: string;
  code: number;
}

export type DowntimeDayOutcome = DowntimeDayResult | DowntimeDayFailure;

function failure(error: string, code = 400): DowntimeDayFailure {
  return { error, code };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function resolveCheck(
  skills: DerivedCharacter["skills"],
  lore: DerivedCharacter["lore"],
  key: string
): { key: string; name: string; mod: number; rank: number } | null {
  if (key.startsWith("lore:")) {
    const name = key.slice(5).trim();
    if (!name) return null;
    const entry = lore.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return entry ? { key, name: entry.name, mod: entry.mod, rank: entry.rank } : null;
  }
  const skill = skills.find((row) => row.id === key);
  return skill ? { key, name: skill.name, mod: skill.mod, rank: skill.rank } : null;
}

function defaultLabel(kind: DowntimeActivityKind, skillName: string | null): string {
  if (kind === "earn-income") return skillName ? `Earn Income · ${skillName}` : "Earn Income";
  if (kind === "subsist") return skillName ? `Subsist · ${skillName}` : "Subsist";
  if (kind === "craft") return "Crafting project";
  if (kind === "retrain") return "Retraining";
  return "Downtime day";
}

/**
 * Spend one downtime day on an Earn Income job, Subsist attempt, or project.
 * The route checks ownership and persists the draft; this helper validates the
 * activity, rolls any check, moves coins, and updates the activity log.
 */
export function performDowntimeDay(options: {
  draft: CharacterDraft;
  skills: DerivedCharacter["skills"];
  lore: DerivedCharacter["lore"];
  input: DowntimeActivityInput;
  settlementLevel: number;
  now: number;
  id: string;
  rng?: () => number;
}): DowntimeDayOutcome {
  const { draft, skills, lore, input, settlementLevel, now, id, rng } = options;
  if (draft.play.downtimeDays < 1) {
    return failure("That character has no downtime days left.");
  }

  const activities = draft.play.downtimeActivities;
  const existing = input.activityId
    ? (activities.find((entry) => entry.id === input.activityId) ?? null)
    : null;
  if (input.activityId && !existing) {
    return failure("That downtime activity was not found.", 404);
  }
  if (existing?.status === "complete") {
    return failure("That downtime activity is already complete.");
  }
  const kind = existing ? existing.kind : normalizeDowntimeKind(input.kind);
  if (!kind) return failure("Choose a downtime activity.");

  let check: { key: string; name: string; mod: number; rank: number } | null = null;
  if (kind === "earn-income" || kind === "subsist") {
    const skillKey = existing?.skill ?? input.skill ?? "";
    if (!skillKey) return failure("Choose a skill for this activity.");
    if (kind === "subsist" && skillKey !== "society" && skillKey !== "survival") {
      return failure("Subsist uses Society or Survival.");
    }
    check = resolveCheck(skills, lore, skillKey);
    if (!check) return failure("That skill is not on this character.");
    if (kind === "earn-income" && check.rank < 1) {
      return failure("You must be trained in the skill to Earn Income.");
    }
  }

  if (!existing && activities.length >= DOWNTIME_MAX_ACTIVITIES) {
    const completedIndex = activities.map((entry) => entry.status).lastIndexOf("complete");
    if (completedIndex < 0) {
      return failure("Finish an active downtime activity before starting another.");
    }
  }

  const taskLevel =
    kind === "earn-income"
      ? existing
        ? clampInt(existing.taskLevel, 0, 0, 20)
        : clampInt(input.taskLevel, 0, 0, 20)
      : null;
  const dcValue =
    kind === "earn-income" || kind === "subsist"
      ? clampInt(
          existing?.dc ??
            input.dc ??
            (kind === "subsist" ? defaultSubsistDc(settlementLevel) : dcForLevel(taskLevel ?? 0)),
          15,
          1,
          100
        )
      : null;

  const rollCheck = (label: string): RollResult => {
    if (!check || dcValue === null) throw new Error("A downtime check needs a skill and DC.");
    return rollFormula(`1d20${check.mod >= 0 ? "+" : ""}${check.mod}`, {
      dc: dcValue,
      label,
      rng,
    });
  };

  let roll: RollResult | null = null;
  let degree: DegreeOfSuccess | null = null;
  let earnedCp = 0;
  let upkeepWaived = false;
  let fatigued = false;

  if (kind === "earn-income" && check) {
    if (existing && existing.dailyEarnedCp !== null) {
      earnedCp = existing.dailyEarnedCp;
    } else {
      roll = rollCheck(`Earn Income (${check.name}, level ${taskLevel ?? 0})`);
      degree = roll.degree ?? "failure";
      earnedCp = earnIncomeCp(taskLevel ?? 0, check.rank, degree);
    }
  } else if (kind === "subsist" && check) {
    roll = rollCheck(`Subsist (${check.name})`);
    degree = roll.degree ?? "failure";
    upkeepWaived = degree === "success" || degree === "critical-success";
    fatigued = !upkeepWaived;
  }

  const rate = lifestyleRate(draft.play.lifestyle);
  const upkeepCp = upkeepCostCp(rate.id, 1);
  const paidCp = upkeepWaived ? 0 : upkeepCp;
  const availableCp = currencyToCp(draft.currency) + earnedCp;
  if (availableCp < paidCp) {
    return failure(
      `You need ${paidCp} cp for one day of ${rate.label.toLowerCase()} living, but your purse holds ${availableCp} cp.`
    );
  }

  draft.currency = addCurrency(draft.currency, earnedCp);
  if (paidCp > 0) {
    const nextCurrency = spendCurrency(draft.currency, paidCp);
    if (!nextCurrency) {
      return failure(
        `You need ${paidCp} cp for one day of ${rate.label.toLowerCase()} living, but your purse holds ${availableCp} cp.`
      );
    }
    draft.currency = nextCurrency;
  }
  draft.play.downtimeDays -= 1;

  if (fatigued) {
    const alreadyFatigued = draft.play.conditions.some(
      (condition) => conditionBaseName(condition.name) === "fatigued"
    );
    if (!alreadyFatigued) {
      draft.play.conditions.push({ name: "Fatigued", value: null, duration: null });
    }
  }

  let activity = existing;
  if (!activity) {
    const completedIndex = activities.map((entry) => entry.status).lastIndexOf("complete");
    if (activities.length >= DOWNTIME_MAX_ACTIVITIES && completedIndex >= 0) {
      activities.splice(completedIndex, 1);
    }
    activity = {
      id,
      kind,
      label: (input.label ?? "").trim() || defaultLabel(kind, check?.name ?? null),
      skill: check?.key ?? null,
      taskLevel,
      dc: dcValue,
      daysRequired:
        kind === "craft" || kind === "retrain"
          ? clampInt(input.daysRequired, kind === "craft" ? 4 : 7, 1, 3_650)
          : null,
      daysSpent: 0,
      earnedCp: 0,
      paidCp: 0,
      dailyEarnedCp: null,
      status: "active",
      lastDegree: null,
      notes: (input.notes ?? "").trim().slice(0, 4_000),
      createdAt: now,
      updatedAt: now,
    };
    activities.unshift(activity);
  }

  activity.daysSpent += 1;
  activity.earnedCp += earnedCp;
  activity.paidCp += paidCp;
  activity.updatedAt = now;
  if (degree) activity.lastDegree = degree;
  if (kind === "earn-income" && !existing) {
    activity.dailyEarnedCp = degree === "critical-failure" ? 0 : earnedCp;
  }
  if ((kind === "craft" || kind === "retrain") && activity.daysRequired === null) {
    activity.daysRequired = kind === "craft" ? 4 : 7;
  }
  if (input.notes !== undefined) activity.notes = (input.notes ?? "").trim().slice(0, 4_000);
  if (kind === "earn-income" && degree === "critical-failure") activity.status = "complete";
  if (kind === "subsist" || kind === "other") activity.status = "complete";
  if (
    (kind === "craft" || kind === "retrain") &&
    activity.daysSpent >= (activity.daysRequired ?? 0)
  ) {
    activity.status = "complete";
  }

  return {
    activity,
    roll,
    degree,
    earnedCp,
    paidCp,
    upkeepWaived,
    completed: activity.status === "complete",
  };
}
