import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exploredSignature,
  exploredStorageKey,
  loadExplored,
  saveExplored,
} from "../src/client/components/table/explored";

const scene = {
  campaignId: "camp",
  id: "scene",
  width: 1600,
  height: 1000,
  gridSize: 70,
  gridOffsetX: 0,
  gridOffsetY: 0,
  imageUrl: null,
};

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("explored fog memory", () => {
  it("keys memory by campaign, scene, and user", () => {
    expect(exploredStorageKey(scene, "user-1")).toContain("camp:scene:user-1");
    expect(exploredSignature(scene)).toBe("1600x1000:70:0:0:");
  });

  it("round-trips explored cells", () => {
    saveExplored(scene, "user-1", new Set(["1,2", "3,4"]));
    expect(loadExplored(scene, "user-1")).toEqual(new Set(["1,2", "3,4"]));
    expect(loadExplored(scene, "user-2")).toEqual(new Set());
  });

  it("resets memory when the map geometry changes", () => {
    saveExplored(scene, "user-1", new Set(["1,2"]));
    expect(loadExplored({ ...scene, gridSize: 50 }, "user-1")).toEqual(new Set());
    expect(loadExplored({ ...scene, width: 3200 }, "user-1")).toEqual(new Set());
    expect(loadExplored({ ...scene, imageUrl: "/uploads/new-map.webp" }, "user-1")).toEqual(
      new Set()
    );
  });
});
