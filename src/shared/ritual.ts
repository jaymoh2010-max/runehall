import type { RitualData } from "./types";

/**
 * Ritual descriptions usually name the primary check's skill in the form
 * "Primary Check Arcana (expert)". Structured compendium ritual data carries
 * the same text without the label. The sheet uses it to preselect a skill; the
 * GM still sets the final DC and adjudicates secondary casters.
 */
const RITUAL_SKILLS = [
  "acrobatics",
  "arcana",
  "athletics",
  "crafting",
  "deception",
  "diplomacy",
  "intimidation",
  "medicine",
  "nature",
  "occultism",
  "performance",
  "religion",
  "society",
  "stealth",
  "survival",
  "thievery",
] as const;

const RITUAL_SKILL_SET = new Set<string>(RITUAL_SKILLS);

export interface RitualPrimaryCheck {
  /** The primary-check text as printed, without the "Primary Check" label. */
  text: string;
  /** Known skills mentioned by the check, in printed order. */
  skills: string[];
  /** Proficiency named in parentheses, if any. */
  proficiency: string | null;
  /** True when this came from structured compendium data. */
  structured: boolean;
}

function primaryText(description: string): string | null {
  const text = String(description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/Primary Check\s+([^.;]+)/i);
  return match ? match[1].trim() : null;
}

function skillsIn(text: string): string[] {
  const found: Array<{ index: number; skill: string }> = [];
  for (const skill of RITUAL_SKILLS) {
    const match = new RegExp(`\\b${skill}\\b`, "i").exec(text);
    if (match) found.push({ index: match.index, skill });
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.skill);
}

function proficiencyIn(text: string): string | null {
  const match = text.match(/\((trained|expert|master|legendary|mythic)\b/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Resolve a ritual's primary check from structured data first, then from the
 * prose fallback used by older or incomplete entries.
 */
export function ritualPrimaryCheckInfo(
  description: string,
  data?: Pick<RitualData, "primaryCheck"> | null
): RitualPrimaryCheck | null {
  const structuredText = String(data?.primaryCheck ?? "").trim();
  const text = structuredText || primaryText(description);
  if (!text) return null;
  // Generated descriptions sometimes contain prose after "Primary Check"
  // (for example "Primary Check to cast..."). Only treat a known skill as a
  // usable automation hint.
  const skills = skillsIn(text).filter((skill) => RITUAL_SKILL_SET.has(skill));
  if (!skills.length) return null;
  return {
    text,
    skills,
    proficiency: proficiencyIn(text),
    structured: Boolean(structuredText),
  };
}

export function ritualPrimarySkillNames(
  description: string,
  data?: Pick<RitualData, "primaryCheck"> | null
): string[] {
  return ritualPrimaryCheckInfo(description, data)?.skills ?? [];
}

export function ritualPrimarySkillName(
  description: string,
  data?: Pick<RitualData, "primaryCheck"> | null
): string | null {
  return ritualPrimarySkillNames(description, data)[0] ?? null;
}
