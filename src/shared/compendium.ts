// ---------------------------------------------------------------------------
// Compendium-wide vocabulary shared by the server, client, and data checks.
// ---------------------------------------------------------------------------
import { SIZES, type Spell, type Vehicle } from "./types";

export type CompendiumEntryKind =
  | "ancestry"
  | "heritage"
  | "background"
  | "class"
  | "classFeature"
  | "feat"
  | "spell"
  | "equipment"
  | "deity"
  | "domain"
  | "condition"
  | "action"
  | "monster"
  | "hazard"
  | "vehicle"
  | "familiarAbility"
  | "boonCurse"
  | "trait"
  | "affliction";

export const COMPENDIUM_KIND_ORDER: CompendiumEntryKind[] = [
  "feat",
  "spell",
  "equipment",
  "monster",
  "ancestry",
  "heritage",
  "background",
  "class",
  "classFeature",
  "deity",
  "domain",
  "condition",
  "action",
  "hazard",
  "vehicle",
  "familiarAbility",
  "boonCurse",
  "trait",
  "affliction",
];

export const COMPENDIUM_KIND_LABELS: Record<CompendiumEntryKind, string> = {
  ancestry: "Ancestry",
  heritage: "Heritage",
  background: "Background",
  class: "Class",
  classFeature: "Class feature",
  feat: "Feat",
  spell: "Spell",
  equipment: "Item",
  deity: "Deity",
  domain: "Domain",
  condition: "Condition",
  action: "Action",
  monster: "Creature",
  hazard: "Hazard",
  vehicle: "Vehicle",
  familiarAbility: "Familiar ability",
  boonCurse: "Boon or curse",
  trait: "Trait",
  affliction: "Affliction",
};

export const COMPENDIUM_KIND_PLURALS: Record<CompendiumEntryKind, string> = {
  ancestry: "Ancestries",
  heritage: "Heritages",
  background: "Backgrounds",
  class: "Classes",
  classFeature: "Class features",
  feat: "Feats",
  spell: "Spells",
  equipment: "Items",
  deity: "Deities",
  domain: "Domains",
  condition: "Conditions",
  action: "Actions",
  monster: "Creatures",
  hazard: "Hazards",
  vehicle: "Vehicles",
  familiarAbility: "Familiar abilities",
  boonCurse: "Boons & curses",
  trait: "Traits",
  affliction: "Afflictions",
};

export interface CompendiumSearchItem {
  id: string;
  name: string;
  kind: CompendiumEntryKind;
  /** Character/creature/feat/spell/item level, or null for unleveled entries. */
  level: number | null;
  source: string;
  rarity: string;
  summary: string;
  /** Rituals are spells but have no magical tradition. */
  ritual?: boolean;
  /** The summary comes from GM-facing source text. */
  gmDescription?: boolean;
}

export interface CompendiumSearchResponse {
  items: CompendiumSearchItem[];
  total: number;
  counts: Partial<Record<CompendiumEntryKind, number>>;
}

const ID_PREFIXES: Record<string, CompendiumEntryKind> = {
  anc: "ancestry",
  her: "heritage",
  bg: "background",
  cls: "class",
  cf: "classFeature",
  feat: "feat",
  spell: "spell",
  item: "equipment",
  deity: "deity",
  domain: "domain",
  cond: "condition",
  act: "action",
  mon: "monster",
  haz: "hazard",
  veh: "vehicle",
  fam: "familiarAbility",
  boon: "boonCurse",
  trait: "trait",
  aff: "affliction",
};

export function isCompendiumEntryKind(value: unknown): value is CompendiumEntryKind {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(COMPENDIUM_KIND_LABELS, value)
  );
}

export function compendiumKindFromId(id: string): CompendiumEntryKind | null {
  const [prefix] = id.split(":");
  return Object.prototype.hasOwnProperty.call(ID_PREFIXES, prefix) ? ID_PREFIXES[prefix] : null;
}

export function compendiumKindLabel(kind: CompendiumEntryKind): string {
  return COMPENDIUM_KIND_LABELS[kind] ?? "Entry";
}

export function compendiumEntryPath(kind: CompendiumEntryKind, id: string): string {
  return `/library/${kind}/${encodeURIComponent(id)}`;
}

/**
 * Rituals, focus spells, and class-locked spells legitimately have no magical
 * tradition. Give the UI a useful label instead of rendering an empty list.
 */
export function spellTraditionLabel(
  spell: Pick<Spell, "ritual" | "traditions" | "traits">
): string {
  if (spell.ritual) return "Ritual";
  if (spell.traditions.length) {
    return spell.traditions
      .map((tradition) => tradition.charAt(0).toUpperCase() + tradition.slice(1))
      .join(", ");
  }
  if (spell.traits.includes("focus")) return "Focus";
  return "Class-locked";
}

export function truncateText(value: string, maxLength: number): string {
  const source = value.trim();
  if (source.length <= maxLength) return source;
  const candidate = source.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = candidate.lastIndexOf(" ");
  const cut = lastSpace > candidate.length * 0.6 ? candidate.slice(0, lastSpace) : candidate;
  return `${cut.trimEnd()}…`;
}

/** Derived summary for vehicle entries, which have statblocks but often no prose. */
export function vehicleSummary(vehicle: Vehicle): string {
  const size = SIZES[vehicle.size] ?? vehicle.size;
  return [
    `Level ${vehicle.level} ${size} vehicle`,
    `${vehicle.hp} HP`,
    `AC ${vehicle.ac}`,
    `hardness ${vehicle.hardness}`,
    vehicle.speed ? `Speed ${vehicle.speed}` : "",
    vehicle.crew ? `Crew ${vehicle.crew}` : "",
    vehicle.passengers ? `Passengers ${vehicle.passengers}` : "",
    vehicle.priceGp ? `${vehicle.priceGp.toLocaleString()} gp` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Strip the structural HTML used by the generated compendium down to a short,
 * readable plain-text summary for hover cards and search results.
 */
export function stripHtml(value: string | null | undefined, maxLength = 220): string {
  const source = String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(source, maxLength);
}
