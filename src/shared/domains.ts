// ---------------------------------------------------------------------------
// Domain reference data generated from the Foundry PF2e journals pack.
// ---------------------------------------------------------------------------

export interface DomainSpellRef {
  id: string | null;
  name: string;
}

export interface DomainEntry {
  id: string;
  name: string;
  type: "domain";
  description: string;
  domainSpell: DomainSpellRef;
  advancedDomainSpell: DomainSpellRef;
  deities: string[];
  alternateDeities: string[];
  covenants: string[];
  alternateCovenants: string[];
  pantheons: string[];
  alternatePantheons: string[];
  mysteries: string[];
  /** Legacy names that still appear in older deity data. */
  aliases: string[];
  rarity: string;
  traits: string[];
  source: string;
  license: string;
  remaster: boolean;
}

/** Legacy domain names used by older deity records. */
export const DOMAIN_ALIASES: Record<string, string> = {
  delirium: "disorientation",
  void: "nothingness",
  wyrmkin: "dragon",
};

export function domainSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+domain$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function canonicalDomainKey(value: string): string {
  const key = domainSlug(value);
  return DOMAIN_ALIASES[key] ?? key;
}

export function domainIdForName(value: string): string {
  return `domain:${canonicalDomainKey(value)}`;
}
