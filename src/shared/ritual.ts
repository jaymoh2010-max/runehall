/**
 * Ritual descriptions usually name the primary check's skill in the form
 * "Primary Check Arcana (expert)". The sheet uses that hint to preselect a
 * skill; the GM still sets the final DC and adjudicates secondary casters.
 */
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
  return name || null;
}
