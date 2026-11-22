import type { Monster } from "./types";

export type MonsterTemplate = "standard" | "elite" | "weak";

export const MONSTER_TEMPLATE_LABELS: Record<MonsterTemplate, string> = {
  standard: "Standard",
  elite: "Elite (+1 level)",
  weak: "Weak (-1 level)",
};

/** Recover the template from the generated token name. */
export function monsterTemplateFromName(name: string): MonsterTemplate {
  if (/\(elite\)\s*$/i.test(name)) return "elite";
  if (/\(weak\)\s*$/i.test(name)) return "weak";
  return "standard";
}

function clampLevel(level: number): number {
  return Math.max(-1, Math.min(25, Math.round(level)));
}

/** Add a modifier to a printed damage formula while preserving its type. */
export function adjustMonsterDamage(damage: string, delta: number): string {
  if (!delta) return damage;
  const text = String(damage || "");
  const flat = text.match(/^(\d+)(\s+.*)?$/);
  if (flat) {
    return `${Math.max(1, Number(flat[1]) + delta)}${flat[2] ?? ""}`;
  }
  const match = text.match(/^(\d+d\d+)([+-]\d+)?(\s+.*)?$/i);
  if (!match) return damage;
  const base = Number(match[2] ?? 0) + delta;
  const suffix = match[3] ?? "";
  return `${match[1]}${base > 0 ? `+${base}` : base < 0 ? `${base}` : ""}${suffix}`;
}

function adjustSkill(value: Monster["skills"][string], delta: number) {
  if (typeof value === "number") return Math.max(0, value + delta);
  if (!value || typeof value !== "object") return value;
  if (typeof value.mod === "number") return { ...value, mod: value.mod + delta };
  if (typeof value.base === "number") return { ...value, base: value.base + delta };
  return value;
}

/**
 * Apply the PF2e elite or weak adjustment. The template raises or lowers the
 * creature by one level, shifts AC, saves, Perception, attacks, and skills by
 * 2, adds or removes 10 + level HP, and shifts damage by 2.
 */
export function applyMonsterTemplate(monster: Monster, template: MonsterTemplate): Monster {
  if (template === "standard") return monster;
  const delta = template === "elite" ? 2 : -2;
  const levelDelta = template === "elite" ? 1 : -1;
  const level = clampLevel(monster.level + levelDelta);
  const hpDelta = (template === "elite" ? 1 : -1) * (10 + Math.max(1, monster.level));
  return {
    ...monster,
    id: monster.id,
    name: `${monster.name} (${template === "elite" ? "Elite" : "Weak"})`,
    level,
    hp: Math.max(1, monster.hp + hpDelta),
    ac: Math.max(1, monster.ac + delta),
    fortitude: monster.fortitude + delta,
    reflex: monster.reflex + delta,
    will: monster.will + delta,
    perception: monster.perception + delta,
    skills: Object.fromEntries(
      Object.entries(monster.skills ?? {}).map(([skill, value]) => [
        skill,
        adjustSkill(value, delta),
      ])
    ),
    attacks: (monster.attacks ?? []).map((attack) => ({
      ...attack,
      bonus: attack.bonus + delta,
      damage: adjustMonsterDamage(attack.damage, delta),
    })),
    traits: [...monster.traits.filter((trait) => trait !== "elite" && trait !== "weak"), template],
  };
}

/** The damage formula without its trailing type words. */
export function monsterDamageFormula(damage: string): string {
  const match = String(damage || "")
    .trim()
    .match(/^(\d+d\d+(?:[+-]\d+)?|\d+)/i);
  return match?.[1] ?? "1d4";
}
