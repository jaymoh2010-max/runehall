export const LEVEL_DCS: number[] = [
  14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44,
  46, 48, 50,
];

export function dcForLevel(level: number): number {
  if (!Number.isFinite(level)) return LEVEL_DCS[0];
  const index = Math.max(0, Math.min(LEVEL_DCS.length - 1, Math.round(level)));
  return LEVEL_DCS[index];
}

export interface SimpleDc {
  id: "untrained" | "trained" | "expert" | "master" | "legendary";
  label: string;
  dc: number;
}

export const SIMPLE_DCS: SimpleDc[] = [
  { id: "untrained", label: "Untrained", dc: 10 },
  { id: "trained", label: "Trained", dc: 15 },
  { id: "expert", label: "Expert", dc: 20 },
  { id: "master", label: "Master", dc: 30 },
  { id: "legendary", label: "Legendary", dc: 40 },
];

export type DcAdjustment = "easy" | "normal" | "hard" | "veryHard" | "incrediblyHard";

export interface DcAdjustmentOption {
  id: DcAdjustment;
  label: string;
  value: number;
}

export const DC_ADJUSTMENTS: DcAdjustmentOption[] = [
  { id: "easy", label: "Easy", value: -2 },
  { id: "normal", label: "Normal", value: 0 },
  { id: "hard", label: "Hard", value: 2 },
  { id: "veryHard", label: "Very hard", value: 5 },
  { id: "incrediblyHard", label: "Incredibly hard", value: 10 },
];

export function adjustDc(base: number, adjustment: DcAdjustment): number {
  const option = DC_ADJUSTMENTS.find((entry) => entry.id === adjustment) ?? DC_ADJUSTMENTS[1];
  return Math.max(1, Math.min(100, Math.round(base) + option.value));
}
