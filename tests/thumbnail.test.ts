import { describe, expect, it } from "vitest";
import { thumbnailDimensions } from "../src/client/thumbnail";

describe("scene thumbnails", () => {
  it("scales wide images to the target width", () => {
    expect(thumbnailDimensions(1600, 900, 320)).toEqual({ width: 320, height: 180 });
  });

  it("scales tall images proportionally", () => {
    expect(thumbnailDimensions(800, 1200, 320)).toEqual({ width: 320, height: 480 });
  });

  it("does not upscale small images", () => {
    expect(thumbnailDimensions(120, 80, 320)).toEqual({ width: 120, height: 80 });
  });
});
