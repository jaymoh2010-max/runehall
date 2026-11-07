import type { Equipment } from "./types";

export type RuneCategory =
  "weaponPotency" | "striking" | "armorPotency" | "resilient" | "shield" | "property" | null;

export interface RuneEffects {
  weaponPotency: number;
  strikingDice: number;
  armorPotency: number;
  resilient: number;
  property: Equipment[];
  shield: Equipment[];
}

const EMPTY_EFFECTS: RuneEffects = {
  weaponPotency: 0,
  strikingDice: 1,
  armorPotency: 0,
  resilient: 0,
  property: [],
  shield: [],
};

export function runeUsageForTarget(item: Equipment | null | undefined): string | null {
  if (item?.weapon) return "etched-onto-a-weapon";
  if (item?.armor) return "etched-onto-armor";
  if (item?.shield) return "etched-onto-a-shield";
  return null;
}

export function runeUsageForItem(item: Equipment | null | undefined): string | null {
  const usage = String(item?.usage ?? "");
  if (usage.startsWith("etched-onto")) return usage;
  return runeUsageForTarget(item);
}

export function runeCategory(item: Equipment | null | undefined): RuneCategory {
  if (!item || !runeUsageForItem(item)) return null;
  const name = item.name.toLowerCase();
  if (name.includes("weapon potency")) return "weaponPotency";
  if (name.includes("armor potency")) return "armorPotency";
  if (name.startsWith("striking") || name.includes("mythic striking")) return "striking";
  if (name.startsWith("resilient") || name.includes("mythic resilient")) return "resilient";
  if (name.startsWith("reinforcing rune")) return "shield";
  return "property";
}

function potencyValue(name: string): number {
  const match = /\+(\d+)/.exec(name);
  return match ? Number(match[1]) : name.includes("mythic") ? 4 : 0;
}

export function strikingDiceForRune(item: Equipment): number {
  const name = item.name.toLowerCase();
  if (name.includes("mythic")) return 5;
  if (name.includes("major")) return 4;
  if (name.includes("greater")) return 3;
  return 2;
}

export function summarizeRunes(
  runeIds: string[] | undefined,
  equipment: Record<string, Equipment>
): RuneEffects {
  if (!runeIds?.length) return { ...EMPTY_EFFECTS, property: [], shield: [] };
  const effects: RuneEffects = { ...EMPTY_EFFECTS, property: [], shield: [] };
  for (const id of runeIds) {
    const rune = equipment[id];
    if (!rune) continue;
    switch (runeCategory(rune)) {
      case "weaponPotency":
        effects.weaponPotency = Math.max(effects.weaponPotency, potencyValue(rune.name));
        break;
      case "striking":
        effects.strikingDice = Math.max(effects.strikingDice, strikingDiceForRune(rune));
        break;
      case "armorPotency":
        effects.armorPotency = Math.max(effects.armorPotency, potencyValue(rune.name));
        break;
      case "resilient":
        effects.resilient = Math.max(
          effects.resilient,
          potencyValue(rune.name) || strikingDiceForRune(rune) - 1
        );
        break;
      case "shield":
        effects.shield.push(rune);
        break;
      case "property":
        effects.property.push(rune);
        break;
      default:
        break;
    }
  }
  return effects;
}

export function propertyRuneSlots(
  runeIds: string[] | undefined,
  equipment: Record<string, Equipment>
): number {
  const effects = summarizeRunes(runeIds, equipment);
  return Math.max(effects.weaponPotency, effects.armorPotency);
}

export function propertyRuneCount(
  runeIds: string[] | undefined,
  equipment: Record<string, Equipment>
): number {
  return summarizeRunes(runeIds, equipment).property.length;
}

/**
 * Attach a rune, replacing the previous rune of the same fundamental category.
 * Property runes append, subject to the caller's slot check.
 */
export function attachRuneIds(
  runeIds: string[] | undefined,
  rune: Equipment,
  equipment: Record<string, Equipment>
): string[] {
  const existing = runeIds ?? [];
  const category = runeCategory(rune);
  if (!category) return existing;
  if (category === "property") {
    return existing.includes(rune.id) ? existing : [...existing, rune.id];
  }
  const kept = existing.filter((id) => {
    const current = equipment[id];
    return !current || runeCategory(current) !== category;
  });
  return [...kept, rune.id];
}

const DAMAGE_RUNES: { match: RegExp; formula: string; type: string }[] = [
  { match: /^flaming/i, formula: "1d6", type: "fire" },
  { match: /^frost/i, formula: "1d6", type: "cold" },
  { match: /^shock/i, formula: "1d6", type: "electricity" },
  { match: /^thundering/i, formula: "1d6", type: "sonic" },
  { match: /^corrosive/i, formula: "1d6", type: "acid" },
  { match: /^decaying/i, formula: "1d4", type: "void" },
  { match: /^impactful/i, formula: "1d6", type: "force" },
];

export function propertyRuneDamage(
  rune: Equipment
): { formula: string; type: string; label: string } | null {
  const entry = DAMAGE_RUNES.find((candidate) => candidate.match.test(rune.name));
  if (!entry) return null;
  return { formula: entry.formula, type: entry.type, label: rune.name };
}

export interface ShieldRuneBonus {
  hardness: number;
  hp: number;
  maxHardness: number | null;
  maxHp: number | null;
}

export function shieldRuneBonus(
  runeIds: string[] | undefined,
  equipment: Record<string, Equipment>
): ShieldRuneBonus {
  const reinforcing = (runeIds ?? [])
    .map((id) => equipment[id])
    .filter((rune): rune is Equipment => Boolean(rune) && runeCategory(rune) === "shield")
    .sort((a, b) => b.level - a.level)[0];
  if (!reinforcing) return { hardness: 0, hp: 0, maxHardness: null, maxHp: null };
  const text = reinforcing.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const hardness = /Hardness increases by (\d+)/i.exec(text);
  const hp = /additional (\d+) Hit Points/i.exec(text);
  const max = /maximum (\d+) Hardness, (\d+) HP, and (\d+) BT/i.exec(text);
  return {
    hardness: hardness ? Number(hardness[1]) : 0,
    hp: hp ? Number(hp[1]) : 0,
    maxHardness: max ? Number(max[1]) : null,
    maxHp: max ? Number(max[2]) : null,
  };
}
