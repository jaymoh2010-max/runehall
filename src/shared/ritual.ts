/**
 * Ritual descriptions usually name the primary check's skill in the form
 * "Primary Check Arcana (expert)". The sheet uses that hint to preselect a
 * skill; the GM still sets the final DC and adjudicates secondary casters.
 */
const RITUAL_SKILLS = new Set([
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
]);

export function ritualPrimarySkillName(description: string): string | null {
  const text = String(description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/Primary Check\s+([A-Za-z]+(?: [A-Za-z]+)?)/i);
  if (!match) return null;
  const name = match[1]
    .replace(/\s*\(.*$/, "")
    .trim()
    .toLowerCase();
  // Generated descriptions sometimes contain prose after "Primary Check"
  // (for example "Primary Check to cast..."). Only treat a known skill as a
  // usable automation hint.
  return RITUAL_SKILLS.has(name) ? name : null;
}
