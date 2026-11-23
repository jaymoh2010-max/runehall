import type {
  EncounterBudget,
  EncounterCombatant,
  EncounterDifficulty,
  EncounterWaveSummary,
} from "./types";

/**
 * PF2e encounter math. Creatures are worth XP based on their level relative to
 * the party level, and the encounter budget scales with party size.
 *
 * The official table stops at party level -4 / +4. Creatures five or more
 * levels below the party are worth 0 XP; creatures above +4 cap at 160 XP.
 */
const CREATURE_XP_BY_LEVEL_DIFFERENCE: Record<number, number> = {
  [-4]: 10,
  [-3]: 15,
  [-2]: 20,
  [-1]: 30,
  0: 40,
  1: 60,
  2: 80,
  3: 120,
  4: 160,
};

const DIFFICULTY_BUDGETS: Record<
  Exclude<EncounterDifficulty, "beyond">,
  { base: number; perCharacter: number }
> = {
  trivial: { base: 40, perCharacter: 10 },
  low: { base: 60, perCharacter: 15 },
  moderate: { base: 80, perCharacter: 20 },
  severe: { base: 120, perCharacter: 30 },
  extreme: { base: 160, perCharacter: 40 },
};

export const ENCOUNTER_DIFFICULTY_LABELS: Record<EncounterDifficulty, string> = {
  trivial: "Trivial",
  low: "Low",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
  beyond: "Beyond extreme",
};

export const ENCOUNTER_DIFFICULTY_TONES: Record<
  EncounterDifficulty,
  "neutral" | "green" | "gold" | "red" | "violet"
> = {
  trivial: "neutral",
  low: "green",
  moderate: "gold",
  severe: "red",
  extreme: "violet",
  beyond: "violet",
};

export function clampPartyLevel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(20, Math.round(value)));
}

export function clampPartySize(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(10, Math.round(value)));
}

/** Common party sizes offered as one-click planning presets. */
export const PARTY_SIZE_PRESETS = [3, 4, 5, 6] as const;

export function encounterWaveSummaries(
  combatants: Pick<EncounterCombatant, "wave" | "count">[]
): EncounterWaveSummary[] {
  const waves = new Map<number, EncounterWaveSummary>();
  for (const combatant of combatants) {
    const wave = Math.max(1, Math.round(Number(combatant.wave) || 1));
    const count = Math.max(1, Math.round(Number(combatant.count) || 1));
    const existing = waves.get(wave) ?? { wave, combatants: 0, creatures: 0 };
    existing.combatants += 1;
    existing.creatures += count;
    waves.set(wave, existing);
  }
  return [...waves.values()].sort((a, b) => a.wave - b.wave);
}

/** XP a single creature contributes against the encounter budget. */
export function creatureXp(creatureLevel: number, partyLevel: number): number {
  const difference = Math.round(creatureLevel) - clampPartyLevel(partyLevel);
  // The official table ends at -4; creatures five or more levels below the
  // party are worth no XP and do not count toward the encounter budget.
  if (difference <= -5) return 0;
  if (difference <= -4) return CREATURE_XP_BY_LEVEL_DIFFERENCE[-4];
  if (difference >= 4) return CREATURE_XP_BY_LEVEL_DIFFERENCE[4];
  return CREATURE_XP_BY_LEVEL_DIFFERENCE[difference] ?? 40;
}

export function combatantXp(
  combatant: Pick<EncounterCombatant, "level" | "count">,
  partyLevel: number
): number {
  return creatureXp(combatant.level, partyLevel) * Math.max(1, Math.round(combatant.count));
}

export function encounterAwardXp(
  combatants: Pick<EncounterCombatant, "level" | "count">[],
  partyLevel: number
): number {
  return combatants.reduce((total, combatant) => total + combatantXp(combatant, partyLevel), 0);
}

export function encounterBudgetThresholds(partySize: number): EncounterBudget["thresholds"] {
  const size = clampPartySize(partySize);
  const offset = size - 4;
  const threshold = (difficulty: keyof typeof DIFFICULTY_BUDGETS) => {
    const budget = DIFFICULTY_BUDGETS[difficulty];
    return Math.max(0, budget.base + budget.perCharacter * offset);
  };
  return {
    trivial: threshold("trivial"),
    low: threshold("low"),
    moderate: threshold("moderate"),
    severe: threshold("severe"),
    extreme: threshold("extreme"),
  };
}

export function classifyEncounter(totalXp: number, partySize: number): EncounterDifficulty {
  const xp = Math.max(0, Math.round(totalXp));
  const thresholds = encounterBudgetThresholds(partySize);
  if (xp <= thresholds.trivial) return "trivial";
  if (xp <= thresholds.low) return "low";
  if (xp <= thresholds.moderate) return "moderate";
  if (xp <= thresholds.severe) return "severe";
  if (xp <= thresholds.extreme) return "extreme";
  return "beyond";
}

export function encounterBudget(
  combatants: Pick<EncounterCombatant, "level" | "count">[],
  partyLevel: number,
  partySize: number
): EncounterBudget {
  const level = clampPartyLevel(partyLevel);
  const size = clampPartySize(partySize);
  const awardXp = encounterAwardXp(combatants, level);
  const thresholds = encounterBudgetThresholds(size);
  const difficulty = classifyEncounter(awardXp, size);
  const order: Exclude<EncounterDifficulty, "beyond">[] = [
    "trivial",
    "low",
    "moderate",
    "severe",
    "extreme",
  ];
  const next = order.find((entry) => awardXp < thresholds[entry]);
  return {
    partyLevel: level,
    partySize: size,
    awardXp,
    thresholds,
    difficulty,
    nextThreshold: next ? thresholds[next] : null,
  };
}

export interface PartyDefaults {
  partyLevel: number;
  partySize: number;
  /** Characters with a computed level; unfinished characters are omitted. */
  completed: number;
  /** Characters still missing a level. */
  incomplete: number;
}

/**
 * Pick a starting party level for the encounter builder. The GM can override
 * it, but this keeps the default useful when a character is still unfinished.
 */
export function partyDefaults(levels: (number | null | undefined)[]): PartyDefaults {
  const valid = levels
    .map((level) =>
      typeof level === "number" && Number.isFinite(level) ? clampPartyLevel(level) : null
    )
    .filter((level): level is number => level !== null);
  // A campaign with no characters yet still deserves a usable planning default.
  const partySize = levels.length ? Math.max(valid.length, levels.length) : 4;
  return {
    partyLevel: valid.length
      ? clampPartyLevel(valid.reduce((total, level) => total + level, 0) / valid.length)
      : 1,
    partySize,
    completed: valid.length,
    incomplete: Math.max(0, levels.length - valid.length),
  };
}
