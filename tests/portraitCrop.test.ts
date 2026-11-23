import { describe, expect, it } from "vitest";
import { clampPortraitOffset, portraitDrawRect } from "../src/client/portraitCrop";

describe("portrait crop geometry", () => {
  it("fills a square with a square image", () => {
    expect(portraitDrawRect(500, 500, 100, 1, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it("covers the frame with a landscape image and clamps panning", () => {
    const rect = portraitDrawRect(200, 100, 100, 1, { x: 0, y: 0 });
    expect(rect).toEqual({ x: -50, y: 0, width: 200, height: 100 });
    expect(clampPortraitOffset(200, 100, 100, 1, { x: 999, y: 999 })).toEqual({
      x: 50,
      y: 0,
    });
    expect(clampPortraitOffset(200, 100, 100, 1, { x: -999, y: -999 })).toEqual({
      x: -50,
      y: 0,
    });
  });

  it("keeps zoomed offsets inside the image", () => {
    const rect = portraitDrawRect(200, 100, 100, 2, { x: 0, y: 0 });
    expect(rect).toEqual({ x: -150, y: -50, width: 400, height: 200 });
    expect(clampPortraitOffset(200, 100, 100, 2, { x: 999, y: 999 })).toEqual({
      x: 150,
      y: 50,
    });
  });
});
