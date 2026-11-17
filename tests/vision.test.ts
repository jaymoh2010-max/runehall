import { describe, expect, it } from "vitest";
import {
  distanceToSegment,
  nearestWall,
  normalizeWalls,
  wallBlocksSight,
} from "../src/shared/walls";
import {
  hasLineOfSight,
  computeVision,
  segmentsIntersect,
  visibleCells,
} from "../src/shared/vision";
import type { Wall } from "../src/shared/types";

const wall = (overrides: Partial<Wall> = {}): Wall => ({
  id: "wall_1",
  x1: 100,
  y1: 0,
  x2: 100,
  y2: 100,
  kind: "wall",
  ...overrides,
});

const scene = {
  width: 200,
  height: 100,
  gridSize: 20,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

describe("walls", () => {
  it("normalizes wall and door data", () => {
    expect(
      normalizeWalls([
        { id: "w1", x1: 0, y1: 0, x2: 70, y2: 0, kind: "wall" },
        { id: "d1", x1: 70, y1: 0, x2: 140, y2: 0, kind: "door", open: true },
        { id: "d1", x1: 1, y1: 1, x2: 2, y2: 2, kind: "door" },
        { id: "", x1: 0, y1: 0, x2: 1, y2: 1, kind: "wall" },
      ])
    ).toEqual([
      { id: "w1", x1: 0, y1: 0, x2: 70, y2: 0, kind: "wall" },
      { id: "d1", x1: 70, y1: 0, x2: 140, y2: 0, kind: "door", open: true },
    ]);
  });

  it("only walls and closed doors block sight", () => {
    expect(wallBlocksSight(wall())).toBe(true);
    expect(wallBlocksSight(wall({ kind: "door", open: false }))).toBe(true);
    expect(wallBlocksSight(wall({ kind: "door", open: true }))).toBe(false);
  });

  it("finds the nearest wall for editing", () => {
    const walls = [wall(), wall({ id: "wall_2", x1: 0, y1: 80, x2: 200, y2: 80 })];
    expect(distanceToSegment(50, 80, 0, 80, 200, 80)).toBe(0);
    expect(nearestWall(walls, 50, 79, 5)?.id).toBe("wall_2");
    expect(nearestWall(walls, 50, 50, 5)).toBeNull();
  });
});

describe("line of sight", () => {
  it("detects crossing segments", () => {
    expect(segmentsIntersect(0, 0, 100, 100, 0, 100, 100, 0)).toBe(true);
    expect(segmentsIntersect(0, 0, 50, 0, 60, 10, 60, 80)).toBe(false);
  });

  it("blocks sight through a wall", () => {
    expect(hasLineOfSight({ x: 50, y: 50 }, { x: 150, y: 50 }, [wall()])).toBe(false);
    expect(hasLineOfSight({ x: 50, y: 50 }, { x: 90, y: 50 }, [wall()])).toBe(true);
  });

  it("lets sight through an open door but not a closed one", () => {
    const door = wall({ kind: "door", open: false });
    expect(hasLineOfSight({ x: 50, y: 50 }, { x: 150, y: 50 }, [door])).toBe(false);
    expect(hasLineOfSight({ x: 50, y: 50 }, { x: 150, y: 50 }, [{ ...door, open: true }])).toBe(
      true
    );
  });

  it("computes visible grid cells from party tokens", () => {
    const visible = visibleCells(scene, [], [{ x: 50, y: 50 }]);
    expect(visible.has("2,2")).toBe(true);
    expect(visible.has("9,4")).toBe(true);
  });

  it("uses each token's own vision radius", () => {
    const short = visibleCells(scene, [], [{ x: 50, y: 50, radius: 40 }]);
    expect(short.has("2,2")).toBe(true);
    expect(short.has("5,2")).toBe(false);

    const long = visibleCells(scene, [], [{ x: 50, y: 50, radius: 200 }]);
    expect(long.has("5,2")).toBe(true);
  });

  it("hides cells behind a wall", () => {
    const visible = visibleCells(scene, [wall()], [{ x: 50, y: 50 }]);
    expect(visible.has("2,2")).toBe(true);
    expect(visible.has("7,2")).toBe(false);
  });

  it("returns no vision without a party token", () => {
    expect(visibleCells(scene, [], []).size).toBe(0);
  });

  it("applies ambient light, token light, and senses", () => {
    const origin = { x: 100, y: 50, radius: 80 };
    const lights = [{ x: 100, y: 50, radius: 20 }];
    const normal = computeVision(scene, [], [{ ...origin, mode: "normal" }], {
      ambientLight: "darkness",
      lights,
    });
    expect(normal.bright.has("4,2")).toBe(true);
    expect(normal.dim.has("6,2")).toBe(true);
    expect(normal.visible.has("7,2")).toBe(false);

    const lowLight = computeVision(scene, [], [{ ...origin, mode: "low-light" }], {
      ambientLight: "darkness",
      lights,
    });
    expect(lowLight.bright.has("6,2")).toBe(true);
    expect(lowLight.visible.has("7,2")).toBe(false);

    const darkvision = computeVision(scene, [], [{ ...origin, mode: "darkvision" }], {
      ambientLight: "darkness",
      lights,
    });
    expect(darkvision.dim.has("7,2")).toBe(true);
  });

  it("does not let light bleed through walls", () => {
    const visible = computeVision(
      scene,
      [wall({ x1: 110, y1: 0, x2: 110, y2: 100 })],
      [{ x: 50, y: 50, radius: 200, mode: "normal" }],
      {
        ambientLight: "darkness",
        lights: [{ x: 150, y: 50, radius: 100 }],
      }
    );
    expect(visible.visible.has("4,2")).toBe(false);
  });
});
