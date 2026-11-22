import { rollFormula } from "./dice";
import type {
  AfflictionType,
  CharacterAffliction,
  CharacterDraft,
  DegreeOfSuccess,
  RollResult,
  SaveKey,
} from "./types";

export const AFFLICTION_TYPES: AfflictionType[] = ["poison", "disease", "curse"];

export interface AfflictionPreset {
  id: string;
  label: string;
  type: AfflictionType;
  dc: number;
  save: "fortitude" | "reflex" | "will";
  stageMax: number;
  interval: string;
  duration: string;
  onset: string;
  virulent: boolean;
  notes: string;
}

/**
 * Recovery-frame templates, not published statblocks. They fill the DC, save,
 * onset, interval, and maximum duration so the GM can adjudicate the stages.
 */
export const AFFLICTION_PRESETS: ReadonlyArray<AfflictionPreset> = [
  {
    id: "poison-mild",
    label: "Mild poison template",
    type: "poison",
    dc: 16,
    save: "fortitude",
    stageMax: 3,
    interval: "1 round",
    duration: "1 minute",
    onset: "",
    virulent: false,
    notes: "Stage effects are adjudicated by the GM.",
  },
  {
    id: "poison-virulent",
    label: "Virulent poison template",
    type: "poison",
    dc: 20,
    save: "fortitude",
    stageMax: 3,
    interval: "1 round",
    duration: "1 minute",
    onset: "",
    virulent: true,
    notes: "Two consecutive successes are needed to reduce the stage.",
  },
  {
    id: "poison-contact",
    label: "Contact poison template",
    type: "poison",
    dc: 22,
    save: "fortitude",
    stageMax: 3,
    interval: "1 minute",
    duration: "1 hour",
    onset: "1 minute",
    virulent: false,
    notes: "Exposure usually comes from contact with a coated object.",
  },
  {
    id: "disease-common",
    label: "Disease template",
    type: "disease",
    dc: 18,
    save: "fortitude",
    stageMax: 3,
    interval: "1 day",
    duration: "7 days",
    onset: "1 day",
    virulent: false,
    notes: "Daily saves; stage effects are adjudicated by the GM.",
  },
  {
    id: "curse-common",
    label: "Curse template",
    type: "curse",
    dc: 20,
    save: "will",
    stageMax: 3,
    interval: "1 day",
    duration: "30 days",
    onset: "1 day",
    virulent: false,
    notes: "Curses often have a specific removal condition in addition to saves.",
  },
  {
    id: "curse-virulent",
    label: "Virulent curse template",
    type: "curse",
    dc: 24,
    save: "will",
    stageMax: 3,
    interval: "1 day",
    duration: "30 days",
    onset: "1 day",
    virulent: true,
    notes: "Two consecutive successes are needed to reduce the stage.",
  },
];

export type AfflictionSaveOutcome = "ended" | "reduced" | "pending" | "worsened";

export interface AfflictionSaveResult {
  affliction: CharacterAffliction | null;
  outcome: AfflictionSaveOutcome;
  message: string;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function newAfflictionId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `aff-${uuid}`;
}

export function normalizeAfflictionType(value: unknown): AfflictionType {
  return value === "disease" || value === "curse" ? value : "poison";
}

function normalizeSave(value: unknown): "fortitude" | "reflex" | "will" {
  return value === "reflex" || value === "will" ? value : "fortitude";
}

/** Parse a round-based onset or interval such as "2 rounds"; other units stay manual. */
export function afflictionRounds(text: string): number | null {
  const match = String(text ?? "")
    .trim()
    .match(/^(\d+)\s*rounds?$/i);
  if (!match) return null;
  return clampInt(match[1], 1, 1_000, 1);
}

export function initialOnsetRemaining(onset: string): number | null {
  if (!onset.trim()) return 0;
  return afflictionRounds(onset);
}

export function initialIntervalRemaining(interval: string): number | null {
  if (!interval.trim()) return null;
  return afflictionRounds(interval);
}

const DURATION_UNITS: Record<string, number> = {
  round: 6,
  rounds: 6,
  minute: 60,
  minutes: 60,
  hour: 3_600,
  hours: 3_600,
  day: 86_400,
  days: 86_400,
};

/** Parse a maximum duration such as "1 minute" or "2 days" into seconds. */
export function afflictionDurationSeconds(text: string): number | null {
  const match = String(text ?? "")
    .trim()
    .match(/^(\d+)\s*(rounds?|minutes?|hours?|days?)$/i);
  if (!match) return null;
  const amount = clampInt(match[1], 1, 3_650, 1);
  return amount * DURATION_UNITS[match[2].toLowerCase()];
}

/** A compact remaining-time label for the sheet. */
export function formatAfflictionDuration(seconds: number | null): string {
  if (seconds === null) return "no timed maximum";
  const value = Math.max(0, Math.round(seconds));
  if (value >= 86_400) {
    const days = Math.ceil(value / 86_400);
    return `${days} ${days === 1 ? "day" : "days"} left`;
  }
  if (value >= 3_600) {
    const hours = Math.ceil(value / 3_600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  }
  if (value >= 60) {
    const minutes = Math.ceil(value / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
  }
  return `${Math.max(1, value)} ${value === 1 ? "second" : "seconds"} left`;
}

/**
 * Advance a timed maximum duration. Returns null when the affliction has
 * reached its maximum duration and should be removed.
 */
export function advanceAfflictionDuration(
  affliction: CharacterAffliction,
  seconds: number
): CharacterAffliction | null {
  if (affliction.durationRemaining === null) return affliction;
  const remaining = affliction.durationRemaining - Math.max(0, Math.round(seconds));
  if (remaining <= 0) return null;
  return { ...affliction, durationRemaining: remaining };
}

function timerValue(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1_000, Math.round(value)));
  }
  return fallback;
}

function durationValue(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(315_360_000, Math.round(value)));
  }
  return fallback;
}

/** Clamp one affliction from an untrusted save or form value. */
export function normalizeAffliction(input: unknown): CharacterAffliction | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const stageMax = clampInt(raw.stageMax, 1, 10, 3);
  const stage = clampInt(raw.stage, 1, stageMax, 1);
  const virulent = Boolean(raw.virulent);
  const interval = typeof raw.interval === "string" ? raw.interval.trim().slice(0, 40) : "";
  const onset = typeof raw.onset === "string" ? raw.onset.trim().slice(0, 40) : "";
  return {
    id:
      typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newAfflictionId(),
    name,
    type: normalizeAfflictionType(raw.type),
    dc: clampInt(raw.dc, 1, 60, 15),
    save: normalizeSave(raw.save),
    stage,
    stageMax,
    interval,
    duration: typeof raw.duration === "string" ? raw.duration.trim().slice(0, 40) : "",
    durationRemaining: durationValue(
      raw.durationRemaining,
      afflictionDurationSeconds(typeof raw.duration === "string" ? raw.duration : "")
    ),
    onset,
    onsetRemaining: timerValue(raw.onsetRemaining, initialOnsetRemaining(onset)),
    intervalRemaining: timerValue(raw.intervalRemaining, initialIntervalRemaining(interval)),
    virulent,
    virulentSuccesses: virulent ? clampInt(raw.virulentSuccesses, 0, 1, 0) : 0,
    virulentCrit: raw.virulentCrit === "streak" ? "streak" : "reduce",
    savesCanEnd: raw.savesCanEnd !== false,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1_000) : "",
  };
}

export function normalizeAfflictions(input: unknown): CharacterAffliction[] {
  if (!Array.isArray(input)) return [];
  const out: CharacterAffliction[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const affliction = normalizeAffliction(entry);
    if (!affliction || seen.has(affliction.id)) continue;
    seen.add(affliction.id);
    out.push(affliction);
    if (out.length >= 20) break;
  }
  return out;
}

function reduceAfflictionStage(
  affliction: CharacterAffliction,
  amount: number
): AfflictionSaveResult {
  const target = affliction.stage - amount;
  if (target < 1) {
    if (affliction.savesCanEnd) {
      return { affliction: null, outcome: "ended", message: `${affliction.name} ends.` };
    }
    return {
      affliction: { ...affliction, stage: 1, virulentSuccesses: 0 },
      outcome: "reduced",
      message: `${affliction.name}: stage ${affliction.stage} → 1; it persists until specifically removed. Apply stage 1 effects.`,
    };
  }
  return {
    affliction: { ...affliction, stage: target, virulentSuccesses: 0 },
    outcome: "reduced",
    message: `${affliction.name}: stage ${affliction.stage} → ${target}. Apply stage ${target} effects.`,
  };
}

function applyAfflictionSuccess(affliction: CharacterAffliction): AfflictionSaveResult {
  if (affliction.virulent && affliction.virulentSuccesses < 1) {
    return {
      affliction: { ...affliction, virulentSuccesses: 1 },
      outcome: "pending",
      message: `${affliction.name}: success recorded; one more consecutive success is needed to reduce the stage.`,
    };
  }
  return reduceAfflictionStage(affliction, 1);
}

/**
 * Apply one saving throw at the end of an interval. A normal success reduces
 * one stage and a critical success reduces two; virulent afflictions instead
 * need two consecutive successes per stage and a critical success reduces only
 * one (or counts as one success under the strict policy). Ending requires the
 * stage to drop below 1 and the affliction to allow removal by saves.
 */
export function applyAfflictionSave(
  affliction: CharacterAffliction,
  degree: DegreeOfSuccess
): AfflictionSaveResult {
  const name = affliction.name;

  if (degree === "critical-success") {
    if (affliction.virulent && affliction.virulentCrit === "streak") {
      return applyAfflictionSuccess(affliction);
    }
    return reduceAfflictionStage(affliction, affliction.virulent ? 1 : 2);
  }

  if (degree === "success") {
    return applyAfflictionSuccess(affliction);
  }

  const increase = degree === "critical-failure" ? 2 : 1;
  const stage = Math.min(affliction.stageMax, affliction.stage + increase);
  const capped = stage === affliction.stage;
  return {
    affliction: { ...affliction, stage, virulentSuccesses: 0 },
    outcome: "worsened",
    message: capped
      ? `${name}: remains at stage ${stage} (maximum); repeat the maximum-stage effects.`
      : `${name}: stage ${affliction.stage} → ${stage}. Apply stage ${stage} effects.`,
  };
}

export function afflictionTypeLabel(type: AfflictionType): string {
  return type === "poison" ? "Poison" : type === "disease" ? "Disease" : "Curse";
}

export function resetAfflictionTimers(affliction: CharacterAffliction): CharacterAffliction {
  return {
    ...affliction,
    durationRemaining: afflictionDurationSeconds(affliction.duration),
    onsetRemaining: initialOnsetRemaining(affliction.onset),
    intervalRemaining: initialIntervalRemaining(affliction.interval),
  };
}

export function afflictionOnsetPassed(affliction: CharacterAffliction): CharacterAffliction {
  return {
    ...affliction,
    onsetRemaining: 0,
    intervalRemaining: initialIntervalRemaining(affliction.interval),
  };
}

export function hasAfflictionRoundTimers(affliction: CharacterAffliction): boolean {
  if (affliction.onsetRemaining === null) return false;
  if (affliction.onsetRemaining > 0) return true;
  return affliction.intervalRemaining !== null && affliction.intervalRemaining > 0;
}

export interface AfflictionTurnAutomationResult {
  draft: CharacterDraft;
  changed: boolean;
  rolls: RollResult[];
  notes: string[];
}

export interface AfflictionTurnOptions {
  rng?: () => number;
  labelPrefix?: string;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function isDead(draft: CharacterDraft): boolean {
  return draft.play.conditions.some(
    (condition) =>
      String(condition.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+\d+$/, "") === "dead"
  );
}

/**
 * Advance round-based affliction timers at the end of a character's turn.
 * Onset must finish before interval saves begin; a stage save is rolled when
 * the interval countdown reaches zero. Non-round onsets and intervals are left
 * manual, as are afflictions without a round countdown.
 */
export function resolveAfflictionTurnEnd(
  draft: CharacterDraft,
  saves: Record<SaveKey, number>,
  options: AfflictionTurnOptions = {}
): AfflictionTurnAutomationResult {
  if (!draft.play.afflictions.length || isDead(draft)) {
    return { draft, changed: false, rolls: [], notes: [] };
  }

  let changed = false;
  const rolls: RollResult[] = [];
  const notes: string[] = [];
  const next: CharacterAffliction[] = [];

  for (const affliction of draft.play.afflictions) {
    let entry = affliction;
    if (entry.durationRemaining !== null) {
      const remaining = entry.durationRemaining - 6;
      changed = true;
      if (remaining <= 0) {
        notes.push(`${entry.name} reaches its maximum duration and ends.`);
        continue;
      }
      entry = { ...entry, durationRemaining: remaining };
    }
    if (entry.onsetRemaining === null) {
      next.push(entry);
      continue;
    }

    if (entry.onsetRemaining > 0) {
      entry = { ...entry, onsetRemaining: entry.onsetRemaining - 1 };
      changed = true;
      if (entry.onsetRemaining === 0) {
        entry = {
          ...entry,
          intervalRemaining: initialIntervalRemaining(entry.interval),
        };
        notes.push(`${entry.name}: onset ends. Stage ${entry.stage} effects begin.`);
      }
      next.push(entry);
      continue;
    }

    if (entry.intervalRemaining !== null && entry.intervalRemaining > 0) {
      entry = { ...entry, intervalRemaining: entry.intervalRemaining - 1 };
      changed = true;
      if (entry.intervalRemaining === 0) {
        const bonus = Math.round(Number(saves[entry.save]) || 0);
        const roll = rollFormula(`1d20${signed(bonus)}`, {
          dc: entry.dc,
          label: options.labelPrefix
            ? `${options.labelPrefix} · ${entry.name} stage save`
            : `${entry.name} stage save`,
          rng: options.rng,
        });
        rolls.push(roll);
        const applied = applyAfflictionSave(entry, roll.degree ?? "failure");
        notes.push(applied.message);
        if (applied.affliction) {
          entry = {
            ...applied.affliction,
            intervalRemaining: initialIntervalRemaining(applied.affliction.interval),
          };
          next.push(entry);
        }
        continue;
      }
    }

    next.push(entry);
  }

  if (!changed) return { draft, changed: false, rolls: [], notes: [] };
  return {
    draft: {
      ...draft,
      play: { ...draft.play, afflictions: next },
    },
    changed: true,
    rolls,
    notes,
  };
}
