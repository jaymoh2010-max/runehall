import type { AbilityKey, CharacterCondition, ConditionModifiers, SaveKey } from "./types";

/**
 * PF2e conditions that change numbers on the sheet. Status penalties do not
 * stack with each other, and circumstance penalties do not stack with each
 * other; both still stack with the other type. The helper returns the merged
 * penalty per stat so rules math can add it directly.
 */

const ABILITY_CHECKS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

interface ParsedCondition {
  name: string;
  value: number;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

/**
 * Accept both `{ name: "Frightened", value: 2 }` and imported
 * `{ name: "Frightened 2" }` spellings.
 */
function parseCondition(condition: CharacterCondition): ParsedCondition {
  const rawName = String(condition.name ?? "").trim();
  const trailing = rawName.match(/^(.*?)\s+(\d+)$/);
  const name = normalizeName(trailing?.[1] ?? rawName);
  const rawValue = condition.value ?? (trailing ? Number(trailing[2]) : null);
  const value = Math.max(0, Math.round(Number(rawValue ?? 1)));
  return { name: name === "flat-footed" ? "off-guard" : name, value };
}

function mergeConditions(conditions: CharacterCondition[]): Map<string, ParsedCondition> {
  const merged = new Map<string, ParsedCondition>();
  for (const condition of conditions) {
    const parsed = parseCondition(condition);
    if (!parsed.name) continue;
    const existing = merged.get(parsed.name);
    if (!existing || parsed.value > existing.value) merged.set(parsed.name, parsed);
  }
  return merged;
}

export function conditionModifiers(
  conditions: CharacterCondition[],
  context: { level: number }
): ConditionModifiers {
  const active = mergeConditions(conditions);
  const value = (name: string) => active.get(name)?.value ?? 0;
  const has = (name: string) => value(name) > 0 || active.has(name);

  const statusAll = Math.max(value("frightened"), value("sickened"));
  const fatigued = has("fatigued") ? 1 : 0;
  const enfeebled = value("enfeebled");
  const clumsy = Math.max(value("clumsy"), has("encumbered") ? 1 : 0);
  const stupefied = value("stupefied");
  const drained = value("drained");
  const blinded = has("blinded") ? 4 : 0;
  const unconscious = has("unconscious");
  const dying = value("dying");
  const wounded = value("wounded");
  const doomed = value("doomed");

  const checks = Object.fromEntries(
    ABILITY_CHECKS.map((ability) => {
      const abilityPenalty =
        ability === "str"
          ? enfeebled
          : ability === "dex"
            ? clumsy
            : ability === "con"
              ? drained
              : stupefied;
      return [ability, -Math.max(statusAll, abilityPenalty)];
    })
  ) as Record<AbilityKey, number>;

  const saves: Record<SaveKey, number> = {
    fortitude: -Math.max(statusAll, drained, fatigued, unconscious ? 4 : 0),
    reflex: -Math.max(statusAll, clumsy, fatigued, unconscious ? 4 : 0),
    will: -Math.max(statusAll, stupefied, fatigued, unconscious ? 4 : 0),
  };

  // Frightened/sickened penalize all checks and DCs, which includes AC.
  const statusAc = Math.max(clumsy, fatigued, statusAll, unconscious ? 4 : 0);
  const offGuard =
    has("off-guard") ||
    has("prone") ||
    has("grabbed") ||
    has("restrained") ||
    has("paralyzed") ||
    unconscious;
  const ac = -statusAc - (offGuard ? 2 : 0);

  const notes: string[] = [];
  const addNote = (name: string, text: string) => {
    if (!notes.some((note) => note.startsWith(`${name}:`))) {
      notes.push(`${name}: ${text}`);
    }
  };

  if (value("frightened")) {
    addNote(
      `Frightened ${value("frightened")}`,
      `−${value("frightened")} status penalty to checks and DCs, including AC.`
    );
  }
  if (value("sickened")) {
    addNote(
      `Sickened ${value("sickened")}`,
      `−${value("sickened")} status penalty to checks and DCs, including AC.`
    );
  }
  if (enfeebled) {
    addNote(
      `Enfeebled ${enfeebled}`,
      `−${enfeebled} status penalty to Strength-based checks and DCs.`
    );
  }
  if (clumsy) {
    addNote(
      `Clumsy ${clumsy}`,
      `−${clumsy} status penalty to Dexterity-based checks and DCs, including AC and Reflex.`
    );
  }
  if (stupefied) {
    addNote(
      `Stupefied ${stupefied}`,
      `−${stupefied} status penalty to Int, Wis, and Cha checks and DCs.`
    );
  }
  if (drained) {
    addNote(
      `Drained ${drained}`,
      `−${drained} status penalty to Constitution checks and DCs; −${drained * Math.max(1, context.level)} max HP.`
    );
  }
  if (fatigued) addNote("Fatigued", "−1 status penalty to AC and saving throws.");
  if (has("off-guard")) addNote("Off-Guard", "−2 circumstance penalty to AC.");
  if (has("prone")) {
    addNote("Prone", "Off-guard (−2 AC); −2 circumstance penalty to attack rolls.");
  }
  if (has("grabbed")) addNote("Grabbed", "Off-guard (−2 AC); immobilized.");
  if (has("restrained")) addNote("Restrained", "Off-guard (−2 AC); immobilized.");
  if (has("blinded")) {
    addNote("Blinded", "−4 status penalty to Perception; sight-based checks need a flat check.");
  }
  if (unconscious) {
    addNote(
      "Unconscious",
      "−4 status penalty to AC, Perception, and Reflex; off-guard; you can't act."
    );
  }
  if (has("encumbered")) addNote("Encumbered", "Clumsy 1; −10 feet Speed.");
  if (dying) addNote(`Dying ${dying}`, "Roll a recovery check at the start of each turn.");
  if (wounded) addNote(`Wounded ${wounded}`, "Adds to your dying value when reduced to 0 HP.");
  if (doomed) addNote(`Doomed ${doomed}`, "Your dying threshold is reduced by this value.");
  if (value("slowed")) addNote(`Slowed ${value("slowed")}`, "Lose that many actions.");
  if (value("stunned")) addNote(`Stunned ${value("stunned")}`, "Lose that many actions.");
  if (has("quickened")) addNote("Quickened", "Gain one extra action each turn.");
  if (has("persistent damage")) {
    addNote("Persistent Damage", "Roll the listed flat check at the end of your turn.");
  }
  if (has("paralyzed")) addNote("Paralyzed", "Off-guard (−2 AC); you can't act.");
  if (has("petrified")) addNote("Petrified", "You can't act.");
  if (has("dead")) addNote("Dead", "This character is dead.");

  const zero = (value: number) => (value === 0 ? 0 : value);
  return {
    ac: zero(ac),
    saves: {
      fortitude: zero(saves.fortitude),
      reflex: zero(saves.reflex),
      will: zero(saves.will),
    },
    perception: zero(-Math.max(statusAll, blinded, unconscious ? 4 : 0)),
    allChecks: zero(-statusAll),
    checks: Object.fromEntries(
      ABILITY_CHECKS.map((ability) => [ability, zero(checks[ability])])
    ) as Record<AbilityKey, number>,
    attackCircumstance: has("prone") ? -2 : 0,
    maxHp: zero(-drained * Math.max(1, context.level)),
    speed: has("encumbered") ? -10 : 0,
    dying,
    wounded,
    doomed,
    incapacitated: dying > 0 || unconscious || has("paralyzed") || has("petrified") || has("dead"),
    notes,
  };
}

/** True when the condition list contains a name, ignoring case and value. */
export function hasCondition(conditions: CharacterCondition[], name: string): boolean {
  const wanted = normalizeName(name) === "flat-footed" ? "off-guard" : normalizeName(name);
  return conditions.some((condition) => parseCondition(condition).name === wanted);
}
