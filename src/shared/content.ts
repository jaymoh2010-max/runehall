import type { CampaignRuleset, ContentMode, XpMode } from "./types";

/**
 * Tier 1 character options. These are the remastered core books most tables
 * expect to have available by default. Everything else stays available through
 * the "Expanded sources" toggle.
 */
export const CORE_CHARACTER_SOURCES = new Set([
  "Pathfinder Core Rulebook",
  "Pathfinder Player Core",
  "Pathfinder Player Core 2",
  "Pathfinder GM Core",
  "Pathfinder Monster Core",
]);

/** Current core deity references. Deity data lives in Lost Omens books. */
export const CORE_DEITY_SOURCES = new Set([
  "Pathfinder Lost Omens Divine Mysteries",
  "Pathfinder Lost Omens Divine Mysteries Web Supplement",
]);

export function isCoreSource(source: string, kind: "character" | "deity" = "character"): boolean {
  const value = String(source || "").trim();
  return (kind === "deity" ? CORE_DEITY_SOURCES : CORE_CHARACTER_SOURCES).has(value);
}

export function allowsExpanded(mode: ContentMode | undefined): boolean {
  return mode === "expanded";
}

export const CAMPAIGN_RULESET_OPTIONS: {
  value: CampaignRuleset;
  label: string;
  description: string;
}[] = [
  {
    value: "core",
    label: "Core Remastered",
    description: "Player Core, Player Core 2, Core Rulebook, GM Core, and Monster Core.",
  },
  {
    value: "expanded",
    label: "Expanded Remastered",
    description: "All remastered sources, including Lost Omens, adventures, and supplements.",
  },
  {
    value: "legacy",
    label: "Legacy + Remastered",
    description: "Everything in Expanded plus pre-remaster legacy options.",
  },
];

export function isCampaignRuleset(value: unknown): value is CampaignRuleset {
  return value === "core" || value === "expanded" || value === "legacy";
}

export function normalizeCampaignRuleset(value: unknown): CampaignRuleset {
  return value === "expanded" || value === "legacy" ? value : "core";
}

export function rulesetContentMode(ruleset: CampaignRuleset | null | undefined): ContentMode {
  return ruleset === "expanded" || ruleset === "legacy" ? "expanded" : "core";
}

export function rulesetIncludesLegacy(ruleset: CampaignRuleset | null | undefined): boolean {
  return ruleset === "legacy";
}

export function rulesetLabel(ruleset: CampaignRuleset | null | undefined): string {
  return (
    CAMPAIGN_RULESET_OPTIONS.find((option) => option.value === ruleset)?.label ?? "Core Remastered"
  );
}

export function rulesetDescription(ruleset: CampaignRuleset | null | undefined): string {
  return (
    CAMPAIGN_RULESET_OPTIONS.find((option) => option.value === ruleset)?.description ??
    CAMPAIGN_RULESET_OPTIONS[0].description
  );
}

export const XP_MODE_OPTIONS: { value: XpMode; label: string; description: string }[] = [
  {
    value: "milestone",
    label: "Milestone",
    description: "You decide when the party levels up. Encounter XP budgets stay hidden.",
  },
  {
    value: "xp",
    label: "XP budget",
    description: "Use PF2e encounter budgets and difficulty while you prepare fights.",
  },
];

export function isXpMode(value: unknown): value is XpMode {
  return value === "milestone" || value === "xp";
}

export function normalizeXpMode(value: unknown): XpMode {
  return value === "xp" ? "xp" : "milestone";
}
