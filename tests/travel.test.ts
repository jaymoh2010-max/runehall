import { describe, expect, it } from "vitest";
import {
  EXPLORATION_ACTIVITIES,
  TRAVEL_TERRAIN_OPTIONS,
  emptyTravelWatches,
  explorationActivityLabel,
  normalizeTravelActivities,
  normalizeTravelMiles,
  normalizeTravelSpeed,
  normalizeTravelTerrain,
  normalizeTravelWatches,
  normalizeTravelWaypoints,
  normalizeTravelEncounterChecks,
  normalizeTravelWeather,
  travelDaysRemaining,
  travelEncounterDc,
  travelMilesPerDay,
  travelStatus,
} from "../src/shared/travel";

describe("Player Core travel speed", () => {
  it("matches the table for normal terrain", () => {
    expect(travelMilesPerDay(10, "normal")).toBe(8);
    expect(travelMilesPerDay(15, "normal")).toBe(12);
    expect(travelMilesPerDay(25, "normal")).toBe(20);
    expect(travelMilesPerDay(30, "normal")).toBe(24);
    expect(travelMilesPerDay(40, "normal")).toBe(32);
    expect(travelMilesPerDay(60, "normal")).toBe(48);
  });

  it("halves difficult terrain and thirds greater difficult terrain", () => {
    expect(travelMilesPerDay(30, "difficult")).toBe(12);
    expect(travelMilesPerDay(25, "greater-difficult")).toBe(6.67);
    expect(travelMilesPerDay(60, "greater-difficult")).toBe(16);
  });

  it("clamps malformed speeds and miles", () => {
    expect(normalizeTravelSpeed(25)).toBe(25);
    expect(normalizeTravelSpeed(2)).toBe(5);
    expect(normalizeTravelSpeed(999)).toBe(120);
    expect(normalizeTravelMiles(12.345)).toBe(12.35);
    expect(normalizeTravelMiles(-5)).toBe(0);
    expect(normalizeTravelMiles("80")).toBe(80);
  });
});

describe("travel normalization", () => {
  it("normalizes terrain, weather, and status", () => {
    expect(normalizeTravelTerrain("difficult")).toBe("difficult");
    expect(normalizeTravelTerrain("lava")).toBe("normal");
    expect(normalizeTravelWeather("storm")).toBe("storm");
    expect(normalizeTravelWeather("meteor")).toBe("clear");
    expect(travelStatus(0, 0)).toBe("planning");
    expect(travelStatus(100, 20)).toBe("traveling");
    expect(travelStatus(100, 100)).toBe("complete");
    expect(TRAVEL_TERRAIN_OPTIONS.map((entry) => entry.id)).toEqual([
      "normal",
      "difficult",
      "greater-difficult",
    ]);
  });

  it("computes remaining travel days", () => {
    expect(travelDaysRemaining(100, 20, 20)).toBe(4);
    expect(travelDaysRemaining(100, 100, 20)).toBe(0);
    expect(travelDaysRemaining(100, 20, 0)).toBe(0);
  });

  it("keeps only campaign characters in watches and activities", () => {
    const valid = new Set(["char_a", "char_b"]);
    const watches = normalizeTravelWatches(
      {
        first: ["char_a", "char_a", "char_missing"],
        second: ["char_b"],
        third: "not-a-list",
      },
      valid
    );
    expect(watches).toEqual({
      first: ["char_a"],
      second: ["char_b"],
      third: [],
      fourth: [],
    });
    expect(emptyTravelWatches()).toEqual({ first: [], second: [], third: [], fourth: [] });
    const activities = normalizeTravelActivities(
      {
        char_a: "scout",
        char_b: "not-an-activity",
        char_missing: "search",
      },
      valid
    );
    expect(activities).toEqual({ char_a: "scout" });
  });

  it("labels exploration activities", () => {
    expect(explorationActivityLabel("track")).toBe("Track");
    expect(explorationActivityLabel("unknown")).toBe("None");
    expect(EXPLORATION_ACTIVITIES.map((entry) => entry.id)).toContain("search");
  });
});

describe("travel waypoints and encounter checks", () => {
  it("sorts waypoints by miles and drops nameless entries", () => {
    const waypoints = normalizeTravelWaypoints([
      { id: "b", name: "The Ford", miles: 12, visible: false },
      { id: "a", name: "Old Milestone", miles: 3 },
      { id: "bad", name: "", miles: 1 },
      { name: "The Inn", miles: "7.5", description: "Warm beds." },
    ]);
    expect(waypoints.map((entry) => entry.name)).toEqual(["Old Milestone", "The Inn", "The Ford"]);
    expect(waypoints[0].miles).toBe(3);
    expect(waypoints[1].miles).toBe(7.5);
    expect(waypoints[2].visible).toBe(false);
    expect(normalizeTravelWaypoints("not-an-array")).toEqual([]);
  });

  it("normalizes encounter checks and keeps the d20 range", () => {
    const checks = normalizeTravelEncounterChecks([
      {
        id: "check_1",
        day: 2,
        watch: 9,
        roll: 17,
        dc: 14,
        encounter: true,
        terrain: "difficult",
        weather: "rain",
        note: "A patrol blocks the road.",
        createdAt: 1234,
      },
      { id: "bad", day: 1, watch: 1, roll: 0, dc: 10 },
    ]);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      id: "check_1",
      watch: 4,
      roll: 17,
      dc: 14,
      encounter: true,
      terrain: "difficult",
      weather: "rain",
    });
    expect(normalizeTravelEncounterChecks(null)).toEqual([]);
  });

  it("lowers the encounter threshold for worse terrain and weather", () => {
    expect(travelEncounterDc("normal", "clear")).toBe(16);
    expect(travelEncounterDc("difficult", "rain")).toBe(13);
    expect(travelEncounterDc("greater-difficult", "storm")).toBe(9);
    expect(travelEncounterDc("normal", "fog")).toBe(14);
    expect(travelEncounterDc("unknown", "unknown")).toBe(16);
  });
});
