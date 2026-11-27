import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCoreSource,
  itemAllowedByContent,
  normalizeCampaignRuleset,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../src/shared/content";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";
import type { Feat } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

describe("content tiers", () => {
  it("treats the remastered core books as Tier 1", () => {
    expect(isCoreSource("Pathfinder Player Core")).toBe(true);
    expect(isCoreSource("Pathfinder Player Core 2")).toBe(true);
    expect(isCoreSource("Pathfinder Core Rulebook")).toBe(true);
    expect(isCoreSource("Pathfinder GM Core")).toBe(true);
    expect(isCoreSource("Pathfinder Battlecry!")).toBe(false);
    expect(isCoreSource("Pathfinder Lost Omens Divine Mysteries", "deity")).toBe(true);
    expect(isCoreSource("Pathfinder Lost Omens Gods & Magic", "deity")).toBe(false);
    expect(isCoreSource("Pathfinder Battlecry!", "deity")).toBe(false);
  });

  it("keeps a meaningful core feat list", () => {
    const feats = read<Feat>("feats.json");
    const core = feats.filter((feat) => isCoreSource(feat.source));
    expect(core.length).toBeGreaterThan(1000);
    expect(
      core.every((feat) =>
        [
          "Pathfinder Player Core",
          "Pathfinder Player Core 2",
          "Pathfinder GM Core",
          "Pathfinder Core Rulebook",
          "Pathfinder Monster Core",
        ].includes(feat.source)
      )
    ).toBe(true);
  });

  it("defaults to core sources and preserves expanded/legacy preferences", () => {
    expect(emptyCharacterDraft("Tier Test").contentMode).toBe("core");
    expect(emptyCharacterDraft("Tier Test").includeLegacy).toBe(false);
    const expanded = normalizeCharacterDraft({
      ...emptyCharacterDraft("Tier Test"),
      contentMode: "expanded",
      includeLegacy: true,
    });
    expect(expanded.contentMode).toBe("expanded");
    expect(expanded.includeLegacy).toBe(true);
    expect(normalizeCharacterDraft({ contentMode: "nonsense" }).contentMode).toBe("core");
  });

  it("maps campaign rulesets to content scope and legacy access", () => {
    expect(normalizeCampaignRuleset("nonsense")).toBe("core");
    expect(rulesetContentMode("core")).toBe("core");
    expect(rulesetContentMode("expanded")).toBe("expanded");
    expect(rulesetContentMode("legacy")).toBe("expanded");
    expect(rulesetIncludesLegacy("core")).toBe(false);
    expect(rulesetIncludesLegacy("expanded")).toBe(false);
    expect(rulesetIncludesLegacy("legacy")).toBe(true);
  });

  it("enforces content scope for purchased and granted items", () => {
    const coreItem = { source: "Pathfinder Player Core", remaster: true };
    const expandedItem = { source: "Pathfinder Treasure Vault (Remastered)", remaster: true };
    const legacyItem = { source: "Pathfinder Core Rulebook", remaster: false };
    expect(itemAllowedByContent(coreItem, "core", false)).toBe(true);
    expect(itemAllowedByContent(expandedItem, "core", false)).toBe(false);
    expect(itemAllowedByContent(expandedItem, "expanded", false)).toBe(true);
    expect(itemAllowedByContent(legacyItem, "expanded", false)).toBe(false);
    expect(itemAllowedByContent(legacyItem, "expanded", true)).toBe(true);
  });
});
