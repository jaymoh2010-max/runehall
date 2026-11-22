import { describe, expect, it } from "vitest";
import { findPathAroundProps, type PathfindingInput } from "../src/shared/pathfinding";
import type { SceneProp, Wall } from "../src/shared/types";

const CELL = 70;

const prop = (col: number, row: number, overrides: Partial<SceneProp> = {}): SceneProp => ({
  id: `prop_${col}_${row}`,
  name: "Prop",
  imageUrl: "/props/crate.svg",
  x: (col + 0.5) * CELL,
  y: (row + 0.5) * CELL,
  width: CELL,
  height: CELL,
  rotation: 0,
  layer: "ground",
  visible: true,
  locked: false,
  z: 1,
  ...overrides,
});

const point = (col: number, row: number) => ({
  x: (col + 0.5) * CELL,
  y: (row + 0.5) * CELL,
});

const barrier = (doorOpen: boolean): Wall[] => [
  { id: "wall_top", x1: 210, y1: 0, x2: 210, y2: 280, kind: "wall", hidden: false },
  {
    id: "door_mid",
    x1: 210,
    y1: 280,
    x2: 210,
    y2: 420,
    kind: "door",
    open: doorOpen,
    hidden: false,
  },
  { id: "wall_bottom", x1: 210, y1: 420, x2: 210, y2: 700, kind: "wall", hidden: false },
];

const base = (overrides: Partial<PathfindingInput> = {}): PathfindingInput => ({
  props: [],
  propCollision: true,
  gridSize: CELL,
  gridOffsetX: 0,
  gridOffsetY: 0,
  width: 700,
  height: 700,
  tokenSize: 1,
  from: point(1, 1),
  to: point(6, 1),
  ...overrides,
});

const overlaps = (
  cellPoint: { x: number; y: number },
  tokenSize: number,
  entry: SceneProp
): boolean => {
  const half = (tokenSize * CELL) / 2;
  const propHalfWidth = entry.width / 2;
  const propHalfHeight = entry.height / 2;
  return (
    cellPoint.x - half < entry.x + propHalfWidth &&
    cellPoint.x + half > entry.x - propHalfWidth &&
    cellPoint.y - half < entry.y + propHalfHeight &&
    cellPoint.y + half > entry.y - propHalfHeight
  );
};

describe("prop pathfinding", () => {
  it("returns a direct path when nothing blocks the destination", () => {
    const result = findPathAroundProps(base({ props: [prop(3, 5)] }));
    expect(result.detoured).toBe(false);
    expect(result.reachedGoal).toBe(true);
    expect(result.points).toEqual([point(6, 1)]);
    expect(result.feet).toBe(25);
  });

  it("routes around a prop instead of stopping at it", () => {
    const crate = prop(3, 1);
    const result = findPathAroundProps(base({ props: [crate] }));
    expect(result.detoured).toBe(true);
    expect(result.reachedGoal).toBe(true);
    expect(result.points.at(-1)).toEqual(point(6, 1));
    expect(result.feet).toBeGreaterThan(25);
    for (const waypoint of result.points) {
      expect(overlaps(waypoint, 1, crate)).toBe(false);
    }
  });

  it("stops at the furthest square the remaining Speed can afford", () => {
    const result = findPathAroundProps(base({ props: [prop(3, 1)], budget: 10, diagonalStart: 0 }));
    expect(result.reachedGoal).toBe(false);
    expect(result.unreachable).toBe(false);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.feet).toBeLessThanOrEqual(10);
    expect(result.feet).toBeGreaterThan(0);
  });

  it("moves adjacent when the destination itself is inside a prop", () => {
    const result = findPathAroundProps(
      base({ from: point(1, 1), to: point(2, 2), props: [prop(2, 2)] })
    );
    expect(result.reachedGoal).toBe(false);
    expect(result.points).toHaveLength(1);
    expect(result.feet).toBe(5);
    const endpoint = result.points[0];
    expect(Math.abs(endpoint.x - point(2, 2).x) + Math.abs(endpoint.y - point(2, 2).y)).toBe(CELL);
  });

  it("follows the detour even when the first step moves away from the target", () => {
    const crate = prop(9, 9, { x: 665, y: 735, width: 100, height: 100 });
    const result = findPathAroundProps({
      ...base({
        props: [crate],
        width: 1600,
        height: 1000,
        from: { x: 630, y: 570 },
        to: { x: 665, y: 875 },
        budget: 5,
      }),
    });
    expect(result.points).toHaveLength(1);
    expect(result.feet).toBe(5);
    expect(result.reachedGoal).toBe(false);
    expect(result.unreachable).toBe(false);
    expect(result.points[0].y).toBe(595);
    expect(result.points[0].x).not.toBe(665);
  });

  it("stops short when the destination is walled off", () => {
    const ring = [
      prop(5, 0),
      prop(6, 0),
      prop(7, 0),
      prop(5, 1),
      prop(7, 1),
      prop(5, 2),
      prop(6, 2),
      prop(7, 2),
    ];
    const result = findPathAroundProps(base({ props: ring }));
    expect(result.reachedGoal).toBe(false);
    expect(result.unreachable).toBe(true);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.at(-1)).not.toEqual(point(6, 1));
  });

  it("returns an empty path when the token is surrounded", () => {
    const ring = [
      prop(0, 0),
      prop(1, 0),
      prop(2, 0),
      prop(0, 1),
      prop(2, 1),
      prop(0, 2),
      prop(1, 2),
      prop(2, 2),
    ];
    const result = findPathAroundProps(base({ props: ring, from: point(1, 1), to: point(6, 6) }));
    expect(result.reachedGoal).toBe(false);
    expect(result.unreachable).toBe(true);
    expect(result.points).toEqual([]);
  });

  it("lets a token that already overlaps a prop escape", () => {
    const crate = prop(1, 1);
    const result = findPathAroundProps(base({ props: [crate] }));
    expect(result.detoured).toBe(false);
    expect(result.reachedGoal).toBe(true);
    expect(result.points).toEqual([point(6, 1)]);
  });

  it("uses the token footprint when squeezing through gaps", () => {
    const gap = [prop(3, 0), prop(3, 2)];
    const small = findPathAroundProps(base({ props: gap }));
    const large = findPathAroundProps(base({ props: gap, tokenSize: 2 }));
    expect(small.reachedGoal).toBe(true);
    expect(large.reachedGoal).toBe(true);
    expect(large.feet).toBeGreaterThan(small.feet);
  });

  it("routes through an open door in a wall", () => {
    const result = findPathAroundProps(base({ walls: barrier(true), wallCollision: true }));
    expect(result.detoured).toBe(true);
    expect(result.reachedGoal).toBe(true);
    expect(result.points.at(-1)).toEqual(point(6, 1));
    expect(result.feet).toBeGreaterThan(25);
    expect(result.points.some((waypoint) => waypoint.x === point(3, 4).x)).toBe(true);
  });

  it("treats a closed door as part of the wall", () => {
    const result = findPathAroundProps(base({ walls: barrier(false), wallCollision: true }));
    expect(result.detoured).toBe(true);
    expect(result.reachedGoal).toBe(false);
    expect(result.unreachable).toBe(true);
    expect(result.points.at(-1)?.x).toBe(point(2, 1).x);
  });

  it("ignores walls when wall collision is off", () => {
    const result = findPathAroundProps(base({ walls: barrier(false), wallCollision: false }));
    expect(result.detoured).toBe(false);
    expect(result.reachedGoal).toBe(true);
    expect(result.feet).toBe(25);
    expect(result.points).toEqual([point(6, 1)]);
  });

  it("keeps PF2e diagonal parity for direct paths", () => {
    const first = findPathAroundProps(
      base({ from: point(1, 1), to: point(4, 4), diagonalStart: 0 })
    );
    const second = findPathAroundProps(
      base({ from: point(1, 1), to: point(4, 4), diagonalStart: 1 })
    );
    expect(first.diagonals).toBe(3);
    expect(first.feet).toBe(20);
    expect(second.feet).toBe(25);
  });
});
