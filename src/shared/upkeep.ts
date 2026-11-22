import type { Lifestyle } from "./types";

/**
 * Player Core table 6-16: cost of living. The table gives weekly, monthly,
 * and yearly rates; Runehall tracks downtime in days, so upkeep prorates the
 * weekly rate by the days spent and rounds up to the next copper.
 */
export interface CostOfLiving {
  id: Lifestyle;
  label: string;
  weeklyCp: number;
  dailyCp: number;
  note: string;
}

export const LIFESTYLE_OPTIONS: readonly CostOfLiving[] = [
  {
    id: "subsistence",
    label: "Subsistence",
    weeklyCp: 40,
    dailyCp: Math.ceil(40 / 7),
    note: "Room and board. A successful Subsist check can waive the cost.",
  },
  {
    id: "comfortable",
    label: "Comfortable",
    weeklyCp: 100,
    dailyCp: Math.ceil(100 / 7),
    note: "A private room, good meals, and stable space.",
  },
  {
    id: "fine",
    label: "Fine",
    weeklyCp: 3_000,
    dailyCp: Math.ceil(3_000 / 7),
    note: "Fine lodging, meals, and services.",
  },
  {
    id: "extravagant",
    label: "Extravagant",
    weeklyCp: 10_000,
    dailyCp: Math.ceil(10_000 / 7),
    note: "The best lodging, food, and attention money can buy.",
  },
];

export const COST_OF_LIVING: Record<Lifestyle, CostOfLiving> = Object.fromEntries(
  LIFESTYLE_OPTIONS.map((option) => [option.id, option])
) as Record<Lifestyle, CostOfLiving>;

export function normalizeLifestyle(value: unknown): Lifestyle {
  return LIFESTYLE_OPTIONS.find((option) => option.id === value)?.id ?? "subsistence";
}

export function lifestyleRate(value: unknown): CostOfLiving {
  return COST_OF_LIVING[normalizeLifestyle(value)];
}

/** Copper charged for one downtime day at the given standard of living. */
export function dailyUpkeepCp(value: unknown): number {
  return lifestyleRate(value).dailyCp;
}

export function upkeepCostCp(value: unknown, days: unknown): number {
  const count = Math.max(0, Math.floor(Number(days) || 0));
  if (!count) return 0;
  return Math.ceil((lifestyleRate(value).weeklyCp * count) / 7);
}
