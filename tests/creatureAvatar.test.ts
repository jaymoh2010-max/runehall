import { describe, expect, it } from "vitest";
import { creatureAvatarDataUrl } from "../src/shared/creatureAvatar";

describe("default creature avatars", () => {
  it("returns deterministic inline SVG art", () => {
    const first = creatureAvatarDataUrl("Cavern Troll", "monster:troll");
    const second = creatureAvatarDataUrl("Cavern Troll", "monster:troll");
    const other = creatureAvatarDataUrl("Giant Bat", "monster:bat");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(first)).toContain("<svg");
  });
});
