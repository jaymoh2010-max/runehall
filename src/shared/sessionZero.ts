import type { CampaignSessionZero } from "./types";

export const SESSION_ZERO_CHECKLIST = [
  {
    id: "pitch",
    label: "Share the campaign pitch, genre, and tone.",
  },
  {
    id: "themes",
    label: "Agree on themes, expectations, and house rules.",
  },
  {
    id: "limits",
    label: "Collect lines, veils, and content limits.",
  },
  {
    id: "sources",
    label: "Agree on allowed sources, supplements, and optional rules.",
  },
  {
    id: "hooks",
    label: "Connect every character to the party goal and to each other.",
  },
  {
    id: "safety",
    label: "Explain the safety tools and the pause signal.",
  },
  {
    id: "characters",
    label: "Build characters together and connect their stories.",
  },
  {
    id: "schedule",
    label: "Agree on a session schedule and attendance expectations.",
  },
  {
    id: "first-session",
    label: "Set the date and opening scene for the first session.",
  },
] as const;

export function normalizeSessionZeroChecklist(value: unknown): Record<string, boolean> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, boolean> = {};
  for (const item of SESSION_ZERO_CHECKLIST) {
    if (source[item.id] === true) result[item.id] = true;
  }
  return result;
}

export function sessionZeroCompletion(profile: Pick<CampaignSessionZero, "checklist">): {
  done: number;
  total: number;
} {
  const done = SESSION_ZERO_CHECKLIST.filter((item) => profile.checklist[item.id]).length;
  return { done, total: SESSION_ZERO_CHECKLIST.length };
}

export function safetyPreferenceHasContent(value: {
  lines: string;
  veils: string;
  notes: string;
}): boolean {
  return Boolean(value.lines.trim() || value.veils.trim() || value.notes.trim());
}
