import type { AfflictionType, CharacterAffliction, DegreeOfSuccess } from "./types";

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

/** Clamp one affliction from an untrusted save or form value. */
export function normalizeAffliction(input: unknown): CharacterAffliction | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const stageMax = clampInt(raw.stageMax, 1, 10, 3);
  const stage = clampInt(raw.stage, 1, stageMax, 1);
  const virulent = Boolean(raw.virulent);
  return {
    id:
      typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : newAfflictionId(),
    name,
    type: normalizeAfflictionType(raw.type),
    dc: clampInt(raw.dc, 1, 60, 15),
    save: normalizeSave(raw.save),
    stage,
    stageMax,
    interval: typeof raw.interval === "string" ? raw.interval.trim().slice(0, 40) : "",
    duration: typeof raw.duration === "string" ? raw.duration.trim().slice(0, 40) : "",
    onset: typeof raw.onset === "string" ? raw.onset.trim().slice(0, 40) : "",
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
