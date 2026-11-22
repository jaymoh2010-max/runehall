import type {
  CampaignTravel,
  TravelDayLog,
  TravelEncounterCheck,
  TravelTerrain,
  TravelStatus,
  TravelWatches,
  TravelWaypoint,
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

function limitedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeTravelWaypoints(value: unknown): TravelWaypoint[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const waypoints: TravelWaypoint[] = [];
  for (const raw of value.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const name = limitedText(entry.name, 120);
    if (!name) continue;
    const id = limitedText(entry.id, 80) || `waypoint_${waypoints.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    waypoints.push({
      id,
      name,
      miles: normalizeTravelMiles(entry.miles),
      description: limitedText(entry.description, 2_000),
      visible: entry.visible !== false,
      reached: entry.reached === true,
    });
  }
  return waypoints.sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
}

export function normalizeTravelEncounterChecks(value: unknown): TravelEncounterCheck[] {
  if (!Array.isArray(value)) return [];
  const checks: TravelEncounterCheck[] = [];
  for (const raw of value.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const roll = Number(entry.roll);
    const dc = Number(entry.dc);
    if (!Number.isFinite(roll) || roll < 1 || roll > 20) continue;
    if (!Number.isFinite(dc) || dc < 2 || dc > 20) continue;
    checks.push({
      id: limitedText(entry.id, 80) || `check_${checks.length + 1}`,
      day: Math.round(clampNumber(entry.day, 0, 0, 100_000)),
      watch: Math.round(clampNumber(entry.watch, 1, 1, 4)),
      roll: Math.round(roll),
      dc: Math.round(dc),
      encounter: entry.encounter === true,
      terrain: normalizeTravelTerrain(entry.terrain),
      weather: normalizeTravelWeather(entry.weather),
      note: limitedText(entry.note, 500),
      createdAt: Math.round(clampNumber(entry.createdAt, 0, 0, 8_640_000_000_000_000)),
    });
  }
  return checks;
}

export function normalizeTravelHistory(value: unknown): TravelDayLog[] {
  if (!Array.isArray(value)) return [];
  const history: TravelDayLog[] = [];
  for (const raw of value.slice(-3_650)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    history.push({
      id: limitedText(entry.id, 80) || `day_${history.length + 1}`,
      day: Math.round(clampNumber(entry.day, 0, 0, 100_000)),
      miles: normalizeTravelMiles(entry.miles),
      terrain: normalizeTravelTerrain(entry.terrain),
      weather: normalizeTravelWeather(entry.weather),
      worldYear: Math.round(clampNumber(entry.worldYear, 4726, 1, 100_000)),
      worldMonth: Math.round(clampNumber(entry.worldMonth, 1, 1, 12)),
      worldDay: Math.round(clampNumber(entry.worldDay, 1, 1, 31)),
      note: limitedText(entry.note, 500),
      createdAt: Math.round(clampNumber(entry.createdAt, 0, 0, 8_640_000_000_000_000)),
    });
  }
  return history.sort((a, b) => a.day - b.day || a.createdAt - b.createdAt);
}

/**
 * Split a journey into daily mileage. Full travel days use the party's daily
 * pace and the final day carries the remainder, so a 30-mile push at 20
 * miles/day records 20 then 10 rather than two even 15-mile days.
 */
export function travelDayMiles(totalMiles: unknown, dailyMiles: unknown): number[] {
  const total = normalizeTravelMiles(totalMiles);
  const daily = Math.max(1, normalizeTravelMiles(dailyMiles));
  if (total <= 0) return [];
  const days = Math.max(1, Math.ceil(total / daily));
  const result: number[] = [];
  let left = total;
  for (let index = 0; index < days; index += 1) {
    const portion = roundMiles(Math.min(left, daily));
    result.push(portion);
    left = roundMiles(left - portion);
  }
  return result;
}

/**
 * The d20 threshold for a random travel encounter. Worse terrain and weather
 * lower the threshold, so encounters become more likely. A result at or above
 * the threshold is an encounter.
 */
export function travelEncounterDc(terrain: unknown, weather: unknown): number {
  const base = { normal: 16, difficult: 14, "greater-difficult": 12 }[
    normalizeTravelTerrain(terrain)
  ];
  const penalty = {
    clear: 0,
    rain: 1,
    snow: 2,
    storm: 3,
    fog: 2,
    heat: 1,
    cold: 1,
  }[normalizeTravelWeather(weather)];
  return Math.max(5, Math.min(20, base - penalty));
}
