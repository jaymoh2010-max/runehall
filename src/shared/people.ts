import type { CampaignNpcKind, HazardComplexity, NpcAttitude } from "./types";

export const NPC_KINDS: ReadonlyArray<{ id: CampaignNpcKind; label: string }> = [
  { id: "npc", label: "NPC or monster" },
  { id: "hazard", label: "Hazard" },
];

export const HAZARD_COMPLEXITIES: ReadonlyArray<{ id: HazardComplexity; label: string }> = [
  { id: "complex", label: "Complex hazard" },
  { id: "simple", label: "Simple hazard" },
];

export function normalizeNpcKind(value: unknown): CampaignNpcKind {
  return value === "hazard" ? "hazard" : "npc";
}

export function normalizeHazardComplexity(value: unknown): HazardComplexity {
  return value === "simple" ? "simple" : "complex";
}

export const NPC_ATTITUDES: ReadonlyArray<{ id: NpcAttitude; label: string; note: string }> = [
  { id: "hostile", label: "Hostile", note: "Actively opposed; will harm or betray the party." },
  { id: "unfriendly", label: "Unfriendly", note: "Wants the party to fail but may still talk." },
  { id: "indifferent", label: "Indifferent", note: "No strong feelings either way." },
  { id: "friendly", label: "Friendly", note: "Wants to help and will take risks for the party." },
  {
    id: "helpful",
    label: "Helpful",
    note: "Actively loyal and willing to sacrifice for the party.",
  },
];

export function normalizeNpcAttitude(value: unknown): NpcAttitude {
  return NPC_ATTITUDES.some((entry) => entry.id === value) ? (value as NpcAttitude) : "indifferent";
}

export function npcAttitudeLabel(value: unknown): string {
  return (
    NPC_ATTITUDES.find((entry) => entry.id === normalizeNpcAttitude(value))?.label ?? "Indifferent"
  );
}

export function normalizeReputation(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-100, Math.min(100, Math.round(number)));
}

export function reputationLabel(value: number): string {
  const reputation = normalizeReputation(value);
  if (reputation <= -60) return "Sworn enemy";
  if (reputation <= -20) return "Hostile";
  if (reputation < 20) return "Neutral";
  if (reputation < 60) return "Friendly";
  return "Devoted ally";
}
