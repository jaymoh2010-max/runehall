import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_PORTRAITS, builtinPortraitUrl } from "../src/shared/portraits";

describe("built-in portraits", () => {
  it("has unique, licensed portrait files", () => {
    expect(new Set(BUILTIN_PORTRAITS.map((portrait) => portrait.id)).size).toBe(
      BUILTIN_PORTRAITS.length
    );
    expect(BUILTIN_PORTRAITS.length).toBeGreaterThanOrEqual(30);
    for (const portrait of BUILTIN_PORTRAITS) {
      expect(portrait.url.startsWith("/portraits/"), portrait.id).toBe(true);
      expect(fs.existsSync(`public${portrait.url}`), portrait.url).toBe(true);
      expect(portrait.name, portrait.id).toBeTruthy();
      expect(portrait.credit, portrait.id).toBeTruthy();
      expect(portrait.license, portrait.id).toMatch(/^CC BY(-SA)? (3\.0|4\.0)$/);
      expect(portrait.sourceUrl, portrait.id).toMatch(/^https:\/\//);
      expect(portrait.tags.length, portrait.id).toBeGreaterThan(0);
    }
  });

  it("covers the core ancestries and resolves URLs", () => {
    const ancestries = new Set(BUILTIN_PORTRAITS.map((portrait) => portrait.ancestry));
    expect(ancestries).toEqual(new Set(["Human", "Elf", "Dwarf", "Orc"]));
    expect(builtinPortraitUrl("flare-05")).toBe("/portraits/flare-05.webp");
    expect(builtinPortraitUrl("missing")).toBeNull();
  });
});
