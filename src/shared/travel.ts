import type {
  CampaignTravel,
  TravelTerrain,
  TravelStatus,
  TravelWatches,
  TravelWeather,
} from "./types";

export const TRAVEL_SPEED_OPTIONS = [
  { speed: 10, milesPerDay: 8 },
  { speed: 15, milesPerDay: 12 },
  { speed: 20, milesPerDay: 16 },
  { speed: 25, milesPerDay: 20 },
  { speed: 30, milesPerDay: 24 },
  { speed: 35, milesPerDay: 28 },
  { speed: 40, milesPerDay: 32 },
  { speed: 50, milesPerDay: 40 },
  { speed: 60, milesPerDay: 48 },
];

export const TRAVEL_TERRAIN_OPTIONS: ReadonlyArray<{
  id: TravelTerrain;
  label: string;
  multiplier: number;
  note: string;
}> = [
  {
    id: "normal",
    label: "Normal",
    multiplier: 1,
    note: "Road, open plains, or other clear ground.",
  },
  {
    id: "difficult",
    label: "Difficult",
    multiplier: 0.5,
    note: "Forest, hills, mud, or deep snow. Halves daily progress.",
  },
  {
    id: "greater-difficult",
    label: "Greater difficult",
    multiplier: 1 / 3,
    note: "Mountains, dense jungle, or a swamp. One-third daily progress.",
  },
];

export const TRAVEL_WEATHER_OPTIONS: ReadonlyArray<{
  id: TravelWeather;
  label: string;
  note: string;
}> = [
  { id: "clear", label: "Clear", note: "No weather penalty." },
  { id: "rain", label: "Rain", note: "GM adjudicates visibility and footing." },
  { id: "snow", label: "Snow", note: "GM adjudicates cold and hidden ground." },
  { id: "storm", label: "Storm", note: "Severe wind and rain; travel may be risky." },
  { id: "fog", label: "Fog", note: "Heavily obscured distances; navigation may suffer." },
  { id: "heat", label: "Extreme heat", note: "GM adjudicates heat exposure and water." },
  { id: "cold", label: "Extreme cold", note: "GM adjudicates cold exposure and shelter." },
];

export const EXPLORATION_ACTIVITIES: ReadonlyArray<{
  id: string;
  label: string;
  summary: string;
}> = [
  {
    id: "avoid-notice",
    label: "Avoid Notice",
    summary: "Move quietly with Stealth and try not to be seen.",
  },
  {
    id: "defend",
    label: "Defend",
    summary: "Stay ready to protect the party and react to danger.",
  },
  {
    id: "detect-magic",
    label: "Detect Magic",
    summary: "Repeatedly cast detect magic while moving.",
  },
  {
    id: "follow-the-expert",
    label: "Follow the Expert",
    summary: "Follow an ally's lead on a skill the party is using.",
  },
  {
    id: "investigate",
    label: "Investigate",
    summary: "Recall knowledge and piece together the area's clues.",
  },
  {
    id: "repeat-a-spell",
    label: "Repeat a Spell",
    summary: "Keep a useful spell active while travelling.",
  },
  {
    id: "scout",
    label: "Scout",
    summary: "Move ahead and watch for danger with Perception.",
  },
  {
    id: "search",
    label: "Search",
    summary: "Look for hidden creatures, traps, and details.",
  },
  {
    id: "track",
    label: "Track",
    summary: "Follow tracks with Survival.",
  },
  {
    id: "other",
    label: "Other",
    summary: "A custom exploration activity; add details in the notes.",
  },
];

export const TRAVEL_WATCH_KEYS = ["first", "second", "third", "fourth"] as const;

export const TRAVEL_WATCH_LABELS: Record<(typeof TRAVEL_WATCH_KEYS)[number], string> = {
  first: "First watch",
  second: "Second watch",
  third: "Third watch",
  fourth: "Fourth watch",
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function roundMiles(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeTravelTerrain(value: unknown): TravelTerrain {
  return value === "difficult" || value === "greater-difficult" ? value : "normal";
}

export function normalizeTravelWeather(value: unknown): TravelWeather {
  return TRAVEL_WEATHER_OPTIONS.some((entry) => entry.id === value)
    ? (value as TravelWeather)
    : "clear";
}

export function travelTerrainOption(value: unknown) {
  return (
    TRAVEL_TERRAIN_OPTIONS.find((entry) => entry.id === normalizeTravelTerrain(value)) ??
    TRAVEL_TERRAIN_OPTIONS[0]
  );
}

export function travelWeatherOption(value: unknown) {
  return (
    TRAVEL_WEATHER_OPTIONS.find((entry) => entry.id === normalizeTravelWeather(value)) ??
    TRAVEL_WEATHER_OPTIONS[0]
  );
}

/** Player Core Travel Speed: Speed × 0.8 miles in an eight-hour travel day. */
export function travelMilesPerDay(value: unknown, terrain: unknown): number {
  const speed = clampNumber(value, 25, 5, 120);
  return roundMiles(speed * 0.8 * travelTerrainOption(terrain).multiplier);
}

export function normalizeTravelSpeed(value: unknown, fallback = 25): number {
  return Math.round(clampNumber(value, fallback, 5, 120));
}

export function normalizeTravelMiles(value: unknown, fallback = 0): number {
  return roundMiles(clampNumber(value, fallback, 0, 1_000_000));
}

export function travelStatus(distanceMiles: number, progressMiles: number): TravelStatus {
  if (distanceMiles <= 0) return "planning";
  return progressMiles >= distanceMiles ? "complete" : "traveling";
}

export function travelDaysRemaining(
  distanceMiles: number,
  progressMiles: number,
  dailyMiles: number
): number {
  if (dailyMiles <= 0) return 0;
  const remaining = Math.max(0, distanceMiles - progressMiles);
  return Math.ceil(remaining / dailyMiles);
}

export function isExplorationActivity(value: unknown): boolean {
  return EXPLORATION_ACTIVITIES.some((entry) => entry.id === value);
}

export function explorationActivityLabel(value: unknown): string {
  return EXPLORATION_ACTIVITIES.find((entry) => entry.id === value)?.label ?? "None";
}

export function emptyTravelWatches(): TravelWatches {
  return { first: [], second: [], third: [], fourth: [] };
}

export function normalizeTravelWatches(
  value: unknown,
  validCharacterIds: Set<string>
): TravelWatches {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result = emptyTravelWatches();
  for (const key of TRAVEL_WATCH_KEYS) {
    const raw = Array.isArray(source[key]) ? source[key] : [];
    result[key] = [
      ...new Set(
        raw
          .filter((id): id is string => typeof id === "string")
          .filter((id) => validCharacterIds.has(id))
      ),
    ].slice(0, 20);
  }
  return result;
}

export function normalizeTravelActivities(
  value: unknown,
  validCharacterIds: Set<string>
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [characterId, activityId] of Object.entries(value as Record<string, unknown>)) {
    if (!validCharacterIds.has(characterId) || !isExplorationActivity(activityId)) continue;
    result[characterId] = activityId as string;
  }
  return result;
}

export function travelWatchMembers(
  watches: TravelWatches,
  validCharacterIds: Set<string>
): TravelWatches {
  return normalizeTravelWatches(watches, validCharacterIds);
}

export function travelIsActive(travel: CampaignTravel | null): boolean {
  return Boolean(travel && travel.status === "traveling");
}
