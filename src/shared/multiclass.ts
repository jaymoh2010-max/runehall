import type { AbilityKey, SpellTradition } from "./types";

export interface MulticlassDedication {
  featId: string;
  className: string;
  tradition: SpellTradition;
  ability: AbilityKey;
  cantripLimit: number;
}

type DedicationData = Omit<MulticlassDedication, "featId">;

/**
 * Spellcasting archetype dedications with a fixed tradition and key ability.
 * Sorcerer, witch, and summoner dedications depend on a chosen bloodline,
 * patron, or eidolon, so their archetype spellcasting remains manual.
 */
const DEDICATIONS: Record<string, DedicationData> = {
  "feat:dIH771mt4PcVTyAs": {
    className: "Bard",
    tradition: "occult",
    ability: "cha",
    cantripLimit: 2,
  },
  "feat:smCDaPlpRDA47xjK": {
    className: "Cleric",
    tradition: "divine",
    ability: "wis",
    cantripLimit: 2,
  },
  "feat:vhw3n86TEs6laopA": {
    className: "Druid",
    tradition: "primal",
    ability: "wis",
    cantripLimit: 2,
  },
  "feat:TxKWgxor49xntDlU": {
    className: "Magus",
    tradition: "arcane",
    ability: "int",
    cantripLimit: 2,
  },
  "feat:OUNj8nXTHwGcEdlh": {
    className: "Oracle",
    tradition: "divine",
    ability: "cha",
    cantripLimit: 2,
  },
  "feat:OW3W2vMARiojda7e": {
    className: "Psychic",
    tradition: "occult",
    ability: "int",
    cantripLimit: 1,
  },
  "feat:oQ6EZRFXbHWCx08C": {
    className: "Wizard",
    tradition: "arcane",
    ability: "int",
    cantripLimit: 2,
  },
  "feat:Tt6WVxyR4YjmvZLO": {
    className: "Necromancer",
    tradition: "occult",
    ability: "int",
    cantripLimit: 2,
  },
  "feat:5hFFM5TmhKYSQwtG": {
    className: "Animist",
    tradition: "divine",
    ability: "wis",
    cantripLimit: 2,
  },
};

export function multiclassDedicationFor(featIds: Iterable<string>): MulticlassDedication | null {
  for (const featId of featIds) {
    const data = DEDICATIONS[featId];
    if (data) return { featId, ...data };
  }
  return null;
}

/** Multiclass archetype spell proficiency is trained, then expert at 12 and master at 18. */
export function multiclassProficiencyRank(level: number): number {
  if (level >= 18) return 3;
  if (level >= 12) return 2;
  return 1;
}
