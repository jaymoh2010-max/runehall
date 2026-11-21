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

function timerValue(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1_000, Math.round(value)));
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
