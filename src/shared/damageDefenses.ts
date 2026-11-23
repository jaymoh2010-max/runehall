/**
 * Monster damage defenses. PF2e statblocks store immunities as strings and
 * weaknesses/resistances as `{ type, value, exceptions? }` rows.
 */
export const DAMAGE_TYPE_GROUPS: ReadonlyArray<{ label: string; types: string[] }> = [
  {
    label: "Physical",
    types: ["bludgeoning", "piercing", "slashing"],
  },
  {
    label: "Energy",
    types: ["acid", "cold", "electricity", "fire", "sonic", "vitality", "void"],
  },
  {
    label: "Other",
    types: ["force", "mental", "poison", "bleed", "spirit"],
  },
];

export const DAMAGE_TYPES = DAMAGE_TYPE_GROUPS.flatMap((group) => group.types);

/** Untyped damage ignores typed resistance and weakness. */
export const DEFAULT_DAMAGE_TYPE = "untyped";

export interface DamageDefenseEntry {
  type: string;
  value: number;
  exceptions: string[];
}

export interface DamageDefenseInput {
  amount: number;
  damageType?: string | null;
  nonlethal?: boolean;
  immunities?: unknown[];
  weaknesses?: unknown[];
  resistances?: unknown[];
}

export interface DamageDefenseResult {
  amount: number;
  notes: string[];
}

function normalizeType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseDefense(raw: unknown): DamageDefenseEntry | null {
  if (typeof raw === "string") {
    const type = normalizeType(raw);
    return type ? { type, value: 0, exceptions: [] } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const type = normalizeType(record.type);
  if (!type) return null;
  return {
    type,
    value: Math.max(0, Math.round(Number(record.value) || 0)),
    exceptions: Array.isArray(record.exceptions)
      ? record.exceptions.map(normalizeType).filter(Boolean)
      : [],
  };
}

const PHYSICAL_DAMAGE = new Set(["bludgeoning", "piercing", "slashing"]);

function matches(entry: DamageDefenseEntry, damageType: string, nonlethal: boolean): boolean {
  if (entry.type === "all" || entry.type === "all damage" || entry.type === "all-damage")
    return true;
  if (entry.type === "physical") return PHYSICAL_DAMAGE.has(damageType);
  if (entry.type === "nonlethal" || entry.type === "nonlethal-attacks") return nonlethal;
  return entry.type === damageType;
}

export function applyDamageDefenses(input: DamageDefenseInput): DamageDefenseResult {
  const amount = Math.max(0, Math.round(Number(input.amount) || 0));
  const damageType = normalizeType(input.damageType);
  const nonlethal = Boolean(input.nonlethal);
  const notes: string[] = [];
  if (!amount) return { amount, notes };

  const immunities = (input.immunities ?? [])
    .map(parseDefense)
    .filter((entry): entry is DamageDefenseEntry => Boolean(entry));
  const weaknesses = (input.weaknesses ?? [])
    .map(parseDefense)
    .filter((entry): entry is DamageDefenseEntry => Boolean(entry));
  const resistances = (input.resistances ?? [])
    .map(parseDefense)
    .filter((entry): entry is DamageDefenseEntry => Boolean(entry));
  const applies = (entry: DamageDefenseEntry) =>
    matches(entry, damageType, nonlethal) &&
    !(damageType && entry.exceptions.includes(damageType)) &&
    !(nonlethal && entry.exceptions.includes("nonlethal"));

  const immunity = immunities.find(applies);
  if (immunity) {
    notes.push(`Immune to ${immunity.type}`);
    return { amount: 0, notes };
  }

  const resistance = resistances.filter(applies).sort((a, b) => b.value - a.value)[0];
  const weakness = weaknesses.filter(applies).sort((a, b) => b.value - a.value)[0];

  // Player Core: apply weakness first, then resistance, then clamp at zero.
  let adjusted = amount;
  if (weakness && weakness.value > 0) {
    adjusted += weakness.value;
    notes.push(`Weakness ${weakness.value} to ${weakness.type}`);
  }
  if (resistance && resistance.value > 0) {
    adjusted = Math.max(0, adjusted - resistance.value);
    notes.push(`Resistance ${resistance.value} to ${resistance.type}`);
  }
  return { amount: adjusted, notes };
}

export function damageTypeLabel(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Untyped";
}
