import { describe, expect, it } from "vitest";
import { normalizeSceneProp, normalizeSceneProps, PROP_LIMIT } from "../src/shared/props";

describe("scene props", () => {
  it("normalizes ground and overhead props", () => {
    expect(
      normalizeSceneProp({
        id: "prop_1",
        name: "Crate",
        imageUrl: "/props/crate.svg",
        x: 100,
        y: 200,
        width: 64,
        height: 64,
        rotation: 450,
        layer: "overhead",
        visible: false,
        locked: true,
        z: 3,
      })
    ).toEqual({
      id: "prop_1",
      name: "Crate",
      imageUrl: "/props/crate.svg",
      x: 100,
      y: 200,
      width: 64,
      height: 64,
      rotation: 90,
      layer: "overhead",
      visible: false,
      locked: true,
      z: 3,
    });
  });

  it("drops props without ids or images and deduplicates ids", () => {
    expect(
      normalizeSceneProps([
        { id: "", imageUrl: "/props/crate.svg" },
        { id: "missing-image" },
        { id: "p1", imageUrl: "/props/crate.svg" },
        { id: "p1", imageUrl: "/props/barrel.svg" },
      ])
    ).toHaveLength(1);
  });

  it("caps the prop list", () => {
    const many = Array.from({ length: PROP_LIMIT + 20 }, (_, index) => ({
      id: `p${index}`,
      imageUrl: "/props/crate.svg",
      width: 64,
      height: 64,
    }));
    expect(normalizeSceneProps(many)).toHaveLength(PROP_LIMIT);
  });

  it("clamps sizes and defaults missing values", () => {
    const prop = normalizeSceneProp({
      id: "p",
      imageUrl: "/props/crate.svg",
      width: 1,
      height: 99_999,
    });
    expect(prop?.width).toBe(8);
    expect(prop?.height).toBe(10_000);
    expect(prop?.layer).toBe("ground");
    expect(prop?.visible).toBe(true);
    expect(prop?.rotation).toBe(0);
  });
});
