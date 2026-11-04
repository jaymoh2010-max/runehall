import { describe, expect, it } from "vitest";
import { groupHp } from "../src/shared/tokens";

describe("token group HP", () => {
  it("sums current and maximum HP across members", () => {
    expect(
      groupHp([
        { hpCurrent: 4, hpMax: 6 },
        { hpCurrent: 2, hpMax: 6 },
        { hpCurrent: null, hpMax: 10 },
      ]),
    ).toEqual({ count: 3, current: 16, max: 22, percent: (16 / 22) * 100 });
  });

  it("ignores members without HP but still counts them", () => {
    expect(groupHp([{ hpCurrent: 5, hpMax: 10 }, { hpCurrent: 3, hpMax: null }])).toEqual({
      count: 2,
      current: 5,
      max: 10,
      percent: 50,
    });
  });

  it("returns a null percentage when no member has HP", () => {
    expect(groupHp([{ hpCurrent: null, hpMax: null }])).toEqual({
      count: 1,
      current: 0,
      max: 0,
      percent: null,
    });
  });

  it("clamps members above or below their maximum", () => {
    expect(groupHp([{ hpCurrent: 20, hpMax: 10 }, { hpCurrent: -5, hpMax: 10 }])).toEqual({
      count: 2,
      current: 10,
      max: 20,
      percent: 50,
    });
  });
});
