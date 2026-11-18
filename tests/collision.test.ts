import { describe, expect, it } from "vitest";
import {
  blockingPropForMove,
  propBounds,
  rectsOverlap,
  tokenBounds,
} from "../src/shared/collision";
import type { SceneProp } from "../src/shared/types";

const prop = (overrides: Partial<SceneProp> = {}): SceneProp => ({
  id: "prop_1",
  name: "Crate",
  imageUrl: "/props/crate.svg",
  x: 200,
  y: 100,
  width: 100,
  height: 100,
  rotation: 0,
  layer: "ground",
  visible: true,
  locked: false,
  z: 1,
  ...overrides,
});

const token = { size: 1 };

describe("prop collision", () => {
  it("does nothing when collision is disabled", () => {
    expect(
      blockingPropForMove([prop()], token, { x: 100, y: 100 }, { x: 300, y: 100 }, 70, false)
    ).toBeNull();
  });

  it("blocks a move into a prop", () => {
    expect(
      blockingPropForMove([prop()], token, { x: 100, y: 100 }, { x: 200, y: 100 }, 70, true)?.id
    ).toBe("prop_1");
  });

  it("blocks crossing a prop even when the destination is clear", () => {
    expect(
      blockingPropForMove([prop()], token, { x: 100, y: 100 }, { x: 400, y: 100 }, 70, true)?.id
    ).toBe("prop_1");
  });

  it("allows a path around a prop", () => {
    expect(
      blockingPropForMove([prop()], token, { x: 100, y: 0 }, { x: 400, y: 0 }, 70, true)
    ).toBeNull();
  });

  it("allows a token already inside a prop to escape", () => {
    expect(
      blockingPropForMove([prop()], token, { x: 200, y: 100 }, { x: 400, y: 100 }, 70, true)
    ).toBeNull();
  });

  it("accounts for token size", () => {
    const large = { size: 2 };
    expect(
      blockingPropForMove([prop()], large, { x: 20, y: 300 }, { x: 200, y: 300 }, 70, true)
    ).toBeNull();
    expect(
      blockingPropForMove([prop()], large, { x: 20, y: 100 }, { x: 200, y: 100 }, 70, true)?.id
    ).toBe("prop_1");
  });

  it("uses rotated bounds and rectangle overlap", () => {
    const rotated = prop({ width: 140, height: 40, rotation: 90 });
    expect(propBounds(rotated).y2 - propBounds(rotated).y1).toBeGreaterThan(
      propBounds(rotated).x2 - propBounds(rotated).x1
    );
    expect(rectsOverlap(tokenBounds(token, 100, 100, 70), propBounds(rotated))).toBe(false);
  });
});
