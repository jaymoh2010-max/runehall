import { describe, expect, it } from "vitest";
import { concealmentFor, coverBetween, evaluateCover } from "../src/shared/cover";
import type { SceneProp, Wall } from "../src/shared/types";

const CELL = 70;
const attacker = { x: 105, y: 105 };
const target = { x: 455, y: 105 };

const prop = (name: string, x: number, overrides: Partial<SceneProp> = {}): SceneProp => ({
  id: `prop_${name}`,
  name,
  imageUrl: "/props/crate.svg",
  x,
  y: 105,
  width: 70,
  height: 70,
  rotation: 0,
  layer: "ground",
  visible: true,
  locked: false,
  z: 1,
  ...overrides,
});

const wall = (overrides: Partial<Wall> = {}): Wall => ({
  id: "wall_1",
  x1: 280,
  y1: 0,
  x2: 280,
  y2: 700,
  kind: "wall",
  hidden: false,
  ...overrides,
});

describe("cover and concealment", () => {
  it("reports no cover on an open line", () => {
    const result = coverBetween({ attacker, target, walls: [], props: [] });
    expect(result.cover).toBe("none");
    expect(result.acBonus).toBe(0);
  });

  it("gives cover for one intervening prop and greater cover for two", () => {
    const one = coverBetween({
      attacker,
      target,
      walls: [],
      props: [prop("crate", 280)],
    });
    expect(one).toMatchObject({ cover: "cover", acBonus: 2, totalCover: false });
    expect(one.blockers).toEqual(["crate"]);

    const two = coverBetween({
      attacker,
      target,
      walls: [],
      props: [prop("crate", 245), prop("barrel", 350)],
    });
    expect(two).toMatchObject({ cover: "greater-cover", acBonus: 4 });
    expect(two.blockers).toEqual(["crate", "barrel"]);
  });

  it("ignores overhead props that are above the line of effect", () => {
    const result = coverBetween({
      attacker,
      target,
      walls: [],
      props: [prop("roof", 280, { layer: "overhead" })],
    });
    expect(result.cover).toBe("none");
  });

  it("treats walls and closed doors as total cover but lets open doors pass", () => {
    expect(coverBetween({ attacker, target, walls: [wall()], props: [] }).totalCover).toBe(true);
    const closed = wall({ kind: "door", open: false });
    const open = wall({ kind: "door", open: true });
    expect(coverBetween({ attacker, target, walls: [closed], props: [] }).totalCover).toBe(true);
    expect(coverBetween({ attacker, target, walls: [open], props: [] }).totalCover).toBe(false);
  });

  it("maps light levels and senses to concealment", () => {
    expect(concealmentFor("normal", "bright")).toBe("none");
    expect(concealmentFor("normal", "dim")).toBe("concealed");
    expect(concealmentFor("normal", "darkness")).toBe("hidden");
    expect(concealmentFor("low-light", "dim")).toBe("none");
    expect(concealmentFor("low-light", "darkness")).toBe("hidden");
    expect(concealmentFor("darkvision", "darkness")).toBe("none");
  });

  it("combines cover with concealment into a table summary", () => {
    const result = evaluateCover({
      attacker: { ...attacker, visionMode: "normal" },
      target,
      walls: [],
      props: [prop("crate", 280)],
      ambientLight: "dim",
      lights: [],
    });
    expect(result).toMatchObject({
      cover: "cover",
      acBonus: 2,
      concealment: "concealed",
      flatCheck: 5,
      lightLevel: "dim",
    });
    expect(result.summary).toContain("Cover +2 AC");
    expect(result.summary).toContain("DC 5 flat check");
  });

  it("lets a token light remove concealment", () => {
    const result = evaluateCover({
      attacker,
      target,
      walls: [],
      props: [],
      ambientLight: "dim",
      lights: [{ x: target.x, y: target.y, radius: CELL }],
    });
    expect(result.lightLevel).toBe("bright");
    expect(result.concealment).toBe("none");
  });
});
