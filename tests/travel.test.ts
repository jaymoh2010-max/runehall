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
  normalizeTravelWeather,
  travelDaysRemaining,
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
