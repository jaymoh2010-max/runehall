import type { AdvancementSpeed, XpAwardKind } from "./types";
import { creatureXp } from "./encounters";

/** PF2e characters advance one level per 1,000 XP at the default (medium) speed. */
export const XP_PER_LEVEL = 1000;

export const ADVANCEMENT_SPEEDS = ["fast", "medium", "slow"] as const;
export type { AdvancementSpeed };

export const XP_PER_LEVEL_BY_SPEED: Record<AdvancementSpeed, number> = {
  fast: 800,
  medium: 1000,
  slow: 1200,
};

export function isAdvancementSpeed(value: unknown): value is AdvancementSpeed {
  return value === "fast" || value === "medium" || value === "slow";
}

export function normalizeAdvancementSpeed(value: unknown): AdvancementSpeed {
  return isAdvancementSpeed(value) ? value : "medium";
}

export function xpPerLevel(speed: AdvancementSpeed = "medium"): number {
  return XP_PER_LEVEL_BY_SPEED[speed];
}

export interface XpProgress {
  xp: number;
  required: number | null;
  percent: number;
  ready: boolean;
}

export function xpProgress(
  xp: number,
  level: number,
  speed: AdvancementSpeed = "medium"
): XpProgress {
  const current = Math.max(0, Math.round(Number.isFinite(xp) ? xp : 0));
  if (level >= 20) {
    return { xp: current, required: null, percent: 100, ready: false };
  }
  const required = xpPerLevel(speed);
  return {
    xp: current,
    required,
    percent: Math.max(0, Math.min(100, (current / required) * 100)),
    ready: current >= required,
  };
}

/**
 * Spend one level's worth of XP. The GM can still advance a character early;
 * extra XP is preserved and a shortfall simply floors at zero.
 */
export function consumeLevelXp(xp: number, speed: AdvancementSpeed = "medium"): number {
  return Math.max(0, Math.round(Number.isFinite(xp) ? xp : 0) - xpPerLevel(speed));
}

/**
 * PF2e awards complex hazard XP on the same level-difference table as
 * creatures: 10 / 15 / 20 / 30 / 40 / 60 / 80 / 120 / 160 XP. A simple
 * hazard is worth one fifth of that. Hazards more than four levels below the
 * party award nothing.
 */
export function hazardXp(
  hazardLevel: number,
  partyLevel: number,
  complexity: "simple" | "complex" = "complex"
): number {
  const difference = Math.round(hazardLevel) - Math.round(partyLevel);
  if (difference < -4) return 0;
  const complex = creatureXp(hazardLevel, partyLevel);
  return complexity === "simple" ? Math.round(complex / 5) : complex;
}

export const ACCOMPLISHMENT_XP = {
  minor: 10,
  moderate: 30,
  major: 80,
} as const;

export type AccomplishmentTier = keyof typeof ACCOMPLISHMENT_XP;

export const ACCOMPLISHMENT_TIERS = ["minor", "moderate", "major"] as const;

export const ACCOMPLISHMENT_LABELS: Record<AccomplishmentTier, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

export function isAccomplishmentTier(value: unknown): value is AccomplishmentTier {
  return value === "minor" || value === "moderate" || value === "major";
}

export const XP_AWARD_KINDS = ["encounter", "hazard", "accomplishment", "quest", "other"] as const;

export const XP_AWARD_KIND_LABELS: Record<XpAwardKind, string> = {
  encounter: "Encounter",
  hazard: "Hazard",
  accomplishment: "Accomplishment",
  quest: "Quest",
  other: "Other",
};

export function isXpAwardKind(value: unknown): value is XpAwardKind {
  return (
    value === "encounter" ||
    value === "hazard" ||
    value === "accomplishment" ||
    value === "quest" ||
    value === "other"
  );
}

export function normalizeXpAwardKind(value: unknown): XpAwardKind {
  return isXpAwardKind(value) ? value : "other";
}
