import { dcForLevel } from "./gmScreen";
import type {
  DegreeOfSuccess,
  DowntimeActivity,
  DowntimeActivityKind,
  DowntimeActivityStatus,
} from "./types";

export const DOWNTIME_MAX_ACTIVITIES = 40;

export const DOWNTIME_ACTIVITY_KINDS: ReadonlyArray<{
  id: DowntimeActivityKind;
  label: string;
  description: string;
}> = [
  {
    id: "earn-income",
    label: "Earn Income",
    description: "Work a job with a trained skill. The first day rolls; later days repeat the pay.",
  },
  {
    id: "subsist",
    label: "Subsist",
    description: "Forage or scrounge with Society or Survival to waive one day of upkeep.",
  },
  {
    id: "craft",
    label: "Craft",
    description: "Track the days of a crafting project. Materials and checks stay manual.",
  },
  {
    id: "retrain",
    label: "Retrain",
    description: "Track the days needed to retrain a feat, skill, or class choice.",
  },
  {
    id: "other",
    label: "Other",
    description: "Log any other downtime day, such as research, carousing, or a ritual.",
  },
];

/** Player Core table 4-2: Income Earned, in copper pieces. */
export const INCOME_FAILURE_CP = [
  1, 2, 4, 8, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 600, 800,
];

export const INCOME_RANK_CP: Record<number, number[]> = {
  1: [
    5, 20, 30, 50, 70, 90, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1_000, 1_300, 1_500, 2_000,
    3_000, 4_000,
  ],
  2: [
    5, 20, 30, 50, 80, 100, 200, 250, 300, 400, 500, 600, 800, 1_000, 1_500, 2_000, 2_500, 3_000,
    4_500, 6_000, 7_500,
  ],
  3: [
    5, 20, 30, 50, 80, 100, 200, 250, 300, 400, 600, 800, 1_000, 1_500, 2_000, 2_800, 3_600, 4_500,
    7_000, 10_000, 15_000,
  ],
  4: [
    5, 20, 30, 50, 80, 100, 200, 250, 300, 400, 600, 800, 1_000, 1_500, 2_000, 2_800, 4_000, 5_500,
    9_000, 13_000, 20_000,
  ],
};

/** The separate critical-success row at task level 20. */
export const INCOME_CRIT_LEVEL_20_CP: Record<number, number> = {
  1: 5_000,
  2: 9_000,
  3: 17_500,
  4: 30_000,
};

export const INCOME_RANK_LABELS: Record<number, string> = {
  1: "Trained",
  2: "Expert",
  3: "Master",
  4: "Legendary",
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeDowntimeKind(value: unknown): DowntimeActivityKind | null {
  return DOWNTIME_ACTIVITY_KINDS.some((entry) => entry.id === value)
    ? (value as DowntimeActivityKind)
    : null;
}

export function downtimeKindLabel(kind: DowntimeActivityKind): string {
  return DOWNTIME_ACTIVITY_KINDS.find((entry) => entry.id === kind)?.label ?? "Downtime";
}

/**
 * Table 4-2 payout. Critical success uses the next task level's rank pay;
 * task level 20 uses the table's special critical-success row.
 */
export function earnIncomeCp(taskLevel: number, rank: number, degree: DegreeOfSuccess): number {
  const level = clampInt(taskLevel, 0, 0, 20);
  const safeRank = Math.max(1, Math.min(4, Math.round(rank)));
  if (degree === "critical-failure") return 0;
  if (degree === "failure") return INCOME_FAILURE_CP[level];
  if (degree === "success") return INCOME_RANK_CP[safeRank][level];
  if (level >= 20) return INCOME_CRIT_LEVEL_20_CP[safeRank];
  return INCOME_RANK_CP[safeRank][level + 1];
}

/** Default DC for a Subsist attempt in the campaign's settlement. */
export function defaultSubsistDc(settlementLevel: number): number {
  return dcForLevel(settlementLevel);
}

const DEGREES: DegreeOfSuccess[] = ["critical-success", "success", "failure", "critical-failure"];

function normalizeDegree(value: unknown): DegreeOfSuccess | null {
  return DEGREES.includes(value as DegreeOfSuccess) ? (value as DegreeOfSuccess) : null;
}

function normalizeStatus(value: unknown): DowntimeActivityStatus {
  return value === "active" ? "active" : "complete";
}

function fallbackLabel(kind: DowntimeActivityKind): string {
  if (kind === "earn-income") return "Earn Income";
  if (kind === "subsist") return "Subsist";
  if (kind === "craft") return "Crafting project";
  if (kind === "retrain") return "Retraining";
  return "Downtime day";
}

export function normalizeDowntimeActivities(value: unknown): DowntimeActivity[] {
  if (!Array.isArray(value)) return [];
  const out: DowntimeActivity[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const id = text(record.id, 80);
    if (!id || ids.has(id)) continue;
    const kind = normalizeDowntimeKind(record.kind) ?? "other";
    ids.add(id);
    out.push({
      id,
      kind,
      label: text(record.label, 120) || fallbackLabel(kind),
      skill: text(record.skill, 120) || null,
      taskLevel:
        record.taskLevel === null || record.taskLevel === undefined
          ? null
          : clampInt(record.taskLevel, 0, 0, 20),
      dc: record.dc === null || record.dc === undefined ? null : clampInt(record.dc, 15, 1, 100),
      daysRequired:
        record.daysRequired === null || record.daysRequired === undefined
          ? null
          : clampInt(record.daysRequired, 1, 1, 3_650),
      daysSpent: clampInt(record.daysSpent, 0, 0, 9_999),
      earnedCp: clampInt(record.earnedCp, 0, 0, 1_000_000_000),
      paidCp: clampInt(record.paidCp, 0, 0, 1_000_000_000),
      dailyEarnedCp:
        record.dailyEarnedCp === null || record.dailyEarnedCp === undefined
          ? null
          : clampInt(record.dailyEarnedCp, 0, 0, 1_000_000_000),
      status: normalizeStatus(record.status),
      lastDegree: normalizeDegree(record.lastDegree),
      notes: text(record.notes, 4_000),
      createdAt: clampInt(record.createdAt, 0, 0, 8_640_000_000_000),
      updatedAt: clampInt(record.updatedAt, 0, 0, 8_640_000_000_000),
    });
    if (out.length >= DOWNTIME_MAX_ACTIVITIES) break;
  }
  return out;
}
