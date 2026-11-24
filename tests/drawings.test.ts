import { describe, expect, it } from "vitest";
import {
  canEraseDrawing,
  drawingHitByPoint,
  DRAWING_LIMIT,
  DRAWING_POINT_LIMIT,
  normalizeSceneDrawing,
  normalizeSceneDrawings,
} from "../src/shared/drawings";

const base = {
  id: "drawing_one",
  ownerId: "user_one",
  ownerName: "Alder",
  points: [10, 10, 100, 100],
  color: "#7cc4ff",
  width: 6,
  createdAt: 123,
};

describe("scene drawings", () => {
  it("normalizes strokes, colors, widths, and scene bounds", () => {
    const drawing = normalizeSceneDrawing(
      {
        ...base,
        points: [-10, 5, 25.44, 35.55, 25.5, 35.6, 2_000, 2_000],
        color: "#ABCDEF",
        width: 500,
      },
      800,
      600
    );
    expect(drawing).toMatchObject({
      id: "drawing_one",
      ownerId: "user_one",
      ownerName: "Alder",
      color: "#abcdef",
      width: 24,
    });
    expect(drawing?.points).toEqual([0, 5, 25.4, 35.6, 800, 600]);
  });

  it("rejects empty strokes and falls back for unsafe metadata", () => {
    expect(normalizeSceneDrawing({ ...base, points: [10] }, 800, 600)).toBeNull();
    expect(normalizeSceneDrawing({ ...base, id: "" }, 800, 600)).toBeNull();
    const drawing = normalizeSceneDrawing(
      { ...base, points: [1, 2], color: "red", width: Number.NaN },
      800,
      600
    );
    expect(drawing).toMatchObject({
      id: "drawing_one",
      color: "#f4c96b",
      width: 6,
      ownerName: "Alder",
    });
  });

  it("caps the number of strokes and points per scene", () => {
    const entries = Array.from({ length: DRAWING_LIMIT + 5 }, (_, index) => ({
      ...base,
      id: `drawing_${index}`,
    }));
    const drawings = normalizeSceneDrawings(entries, 800, 600);
    expect(drawings).toHaveLength(DRAWING_LIMIT);
    expect(drawings[0].id).toBe("drawing_5");

    const longStroke = Array.from({ length: (DRAWING_POINT_LIMIT + 50) * 2 }, (_, index) =>
      index % 2 === 0 ? index / 2 : index / 2
    );
    const normalized = normalizeSceneDrawing({ ...base, points: longStroke }, 10_000, 10_000);
    expect(normalized?.points.length).toBeLessThanOrEqual(DRAWING_POINT_LIMIT * 2);
  });

  it("lets players erase their own strokes while the GM can erase anyone's", () => {
    expect(canEraseDrawing(base, "user_one", false)).toBe(true);
    expect(canEraseDrawing(base, "user_two", false)).toBe(false);
    expect(canEraseDrawing(base, "user_two", true)).toBe(true);
  });

  it("hit-tests strokes and dots for the eraser", () => {
    expect(drawingHitByPoint(base, 50, 50, 2)).toBe(true);
    expect(drawingHitByPoint(base, 50, 90, 2)).toBe(false);
    expect(drawingHitByPoint({ points: [20, 20], width: 8 }, 23, 23, 1)).toBe(true);
    expect(drawingHitByPoint({ points: [20, 20], width: 8 }, 40, 40, 1)).toBe(false);
  });
});
