import type { AdvancementSpeed, CampaignRuleset, ContentMode, XpMode } from "./types";
import { XP_PER_LEVEL_BY_SPEED } from "./xp";

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
    label: "Milestone (GM decides)",
    description:
      "Default. You decide when the party or an individual character levels up. XP bookkeeping stays hidden.",
  },
  {
    value: "xp",
    label: "XP tracking (GM levels up)",
    description:
      "Track character XP and quest rewards. Characters still level up only when the GM chooses.",
  },
];

export const ADVANCEMENT_SPEED_OPTIONS: {
  value: AdvancementSpeed;
  label: string;
  description: string;
}[] = [
  {
    value: "fast",
    label: `Fast (${XP_PER_LEVEL_BY_SPEED.fast.toLocaleString("en-US")} XP per level)`,
    description:
      "Quick, heroic pacing. Characters reach level 20 after about 16,000 XP of encounters and accomplishments.",
  },
  {
    value: "medium",
    label: `Medium (${XP_PER_LEVEL_BY_SPEED.medium.toLocaleString("en-US")} XP per level)`,
    description: "The standard PF2e pace used by most Adventure Paths. One level per 1,000 XP.",
  },
  {
    value: "slow",
    label: `Slow (${XP_PER_LEVEL_BY_SPEED.slow.toLocaleString("en-US")} XP per level)`,
    description:
      "A longer campaign. Use this when you want more sessions at each level and slower power growth.",
  },
];

export function isXpMode(value: unknown): value is XpMode {
  return value === "milestone" || value === "xp";
}

export function normalizeXpMode(value: unknown): XpMode {
  return value === "xp" ? "xp" : "milestone";
}
