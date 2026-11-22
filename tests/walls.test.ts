import { describe, expect, it } from "vitest";
import {
  blockingWallForMove,
  normalizeWalls,
  segmentsIntersect,
  wallBlocksMovement,
  wallBlocksSight,
} from "../src/shared/walls";
import type { Wall } from "../src/shared/types";

const wall = (overrides: Partial<Wall> = {}): Wall => ({
  id: "wall_1",
  x1: 210,
  y1: 0,
  x2: 210,
  y2: 700,
  kind: "wall",
  hidden: false,
  ...overrides,
});

const from = { x: 175, y: 315 };
const to = { x: 245, y: 315 };

describe("wall movement collision", () => {
  it("preserves the hidden flag while still blocking movement", () => {
    const hidden = normalizeWalls([
      { id: "wall_hidden", x1: 0, y1: 0, x2: 100, y2: 0, kind: "wall", hidden: true },
    ])[0];
    expect(hidden.hidden).toBe(true);
    expect(wallBlocksMovement(hidden)).toBe(true);
  });

  it("blocks movement through walls and closed doors", () => {
    expect(wallBlocksMovement(wall())).toBe(true);
    expect(wallBlocksMovement(wall({ kind: "door", open: false }))).toBe(true);
    expect(wallBlocksMovement(wall({ kind: "door", open: true }))).toBe(false);
    expect(wallBlocksSight(wall({ kind: "door", open: true }))).toBe(false);
  });

  it("returns the wall crossed by a move", () => {
    const barrier = wall();
    expect(blockingWallForMove([barrier], from, to)?.id).toBe(barrier.id);
    expect(blockingWallForMove([wall({ kind: "door", open: true })], from, to)).toBeNull();
    expect(blockingWallForMove([wall({ kind: "door", open: false })], from, to)?.kind).toBe("door");
  });

  it("does not block movement that runs parallel to a wall", () => {
    expect(blockingWallForMove([wall()], { x: 105, y: 105 }, { x: 175, y: 105 })).toBeNull();
  });

  it("can be disabled for a scene", () => {
    expect(blockingWallForMove([wall()], from, to, false)).toBeNull();
  });

  it("treats a wall endpoint touch as a crossing", () => {
    expect(segmentsIntersect(0, 0, 100, 100, 50, 50, 150, 50)).toBe(true);
    expect(segmentsIntersect(0, 0, 100, 0, 0, 10, 100, 10)).toBe(false);
  });
});
