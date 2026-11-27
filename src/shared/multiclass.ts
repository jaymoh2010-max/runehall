import type { AbilityKey, SpellTradition } from "./types";

export interface MulticlassDedication {
  featId: string;
  className: string;
  tradition: SpellTradition | null;
  /** True when the tradition comes from a bloodline, patron, or eidolon choice. */
  variableTradition?: boolean;
  ability: AbilityKey;
  cantripLimit: number;
  basicFeatId: string;
  expertFeatId: string;
  masterFeatId: string;
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
    basicFeatId: "feat:NSyzjkDdQU2A75mX",
    expertFeatId: "feat:0RB3f3J7gOEv3fni",
    masterFeatId: "feat:eJNzP21lFPV3zWkm",
  },
  "feat:smCDaPlpRDA47xjK": {
    className: "Cleric",
    tradition: "divine",
    ability: "wis",
    cantripLimit: 2,
    basicFeatId: "feat:gc24C5CyWgqn1Lbl",
    expertFeatId: "feat:PLTOCEAvqBS05pZu",
    masterFeatId: "feat:bc6tcXSzakyCbQsS",
  },
  "feat:vhw3n86TEs6laopA": {
    className: "Druid",
    tradition: "primal",
    ability: "wis",
    cantripLimit: 2,
    basicFeatId: "feat:PNG7e39mEhq1MorG",
    expertFeatId: "feat:saEwTvJuiemEIfLm",
    masterFeatId: "feat:218WeRqUqdnguRdS",
  },
  "feat:TxKWgxor49xntDlU": {
    className: "Magus",
    tradition: "arcane",
    ability: "int",
    cantripLimit: 2,
    basicFeatId: "feat:oIfCpkpH0Jb1mzj9",
    expertFeatId: "feat:JmHHdGC1p53BBedu",
    masterFeatId: "feat:AJRWIcBGCIxXG0RS",
  },
  "feat:OUNj8nXTHwGcEdlh": {
    className: "Oracle",
    tradition: "divine",
    ability: "cha",
    cantripLimit: 2,
    basicFeatId: "feat:7ycF0fgSw1ovUPit",
    expertFeatId: "feat:FtO8DjjMLBtWiRhZ",
    masterFeatId: "feat:ZkGhDEpqe7fzJuSr",
  },
  "feat:OW3W2vMARiojda7e": {
    className: "Psychic",
    tradition: "occult",
    ability: "int",
    cantripLimit: 1,
    basicFeatId: "feat:ePKe13FzKWaQqLo6",
    expertFeatId: "feat:RJmnFuaGLXfhX3It",
    masterFeatId: "feat:PzbfpOQXOjpUWKkL",
  },
  "feat:oQ6EZRFXbHWCx08C": {
    className: "Wizard",
    tradition: "arcane",
    ability: "int",
    cantripLimit: 2,
    basicFeatId: "feat:SHUfHzElHZPXJFiP",
    expertFeatId: "feat:hpCBELEKGA4ynYv4",
    masterFeatId: "feat:PMckhnGYMyiwUNiL",
  },
  "feat:Tt6WVxyR4YjmvZLO": {
    className: "Necromancer",
    tradition: "occult",
    ability: "int",
    cantripLimit: 2,
    basicFeatId: "feat:EwXyc7vjIDpIDtc2",
    expertFeatId: "feat:GoFebeHcKrYfLhRj",
    masterFeatId: "feat:10W1pS3GeyBkie1o",
  },
  "feat:5hFFM5TmhKYSQwtG": {
    className: "Animist",
    tradition: "divine",
    ability: "wis",
    cantripLimit: 2,
    basicFeatId: "feat:l64p70oQ6a3AtMq9",
    expertFeatId: "feat:UrFeYPLjbWNYMpYA",
    masterFeatId: "feat:WXEOriht1LBz55R0",
  },
  "feat:5UQagWB13Z8xR5Z6": {
    className: "Sorcerer",
    tradition: null,
    variableTradition: true,
    ability: "cha",
    cantripLimit: 2,
    basicFeatId: "feat:AvfswILmh3BwNbyR",
    expertFeatId: "feat:1k5PZAYth8u4Fqyr",
    masterFeatId: "feat:phD0PbElkEeldZ2U",
  },
  "feat:y0vdu6DGhKKElmE6": {
    className: "Witch",
    tradition: null,
    variableTradition: true,
    ability: "int",
    // The dedication's familiar knows two cantrips, but the character can
    // prepare only one of them each day.
    cantripLimit: 1,
    basicFeatId: "feat:nU5Pow4HMzoDHa8Z",
    expertFeatId: "feat:x7vMKBSrxXmfs5C2",
    masterFeatId: "feat:i7ibUqJCl1GXRFEa",
  },
  "feat:SwzPqEsLzZpNufvm": {
    className: "Summoner",
    tradition: null,
    variableTradition: true,
    ability: "cha",
    cantripLimit: 2,
    basicFeatId: "feat:YY7wmYQ9ccAO8fut",
    expertFeatId: "feat:s6y6JzPW2K8k4m8k",
    masterFeatId: "feat:kPsJIz19viZy8YjO",
  },
};

export function multiclassDedicationFor(featIds: Iterable<string>): MulticlassDedication | null {
  for (const featId of featIds) {
    const data = DEDICATIONS[featId];
    if (data) return { featId, ...data };
  }
  return null;
}

/**
 * Slots granted by the basic, expert, and master spellcasting archetype feats.
 * A character who takes a later feat immediately gains every lower-rank slot
 * its level qualifies for.
 */
export function multiclassSlotCounts(
  level: number,
  feats: { basic: boolean; expert: boolean; master: boolean }
): number[] {
  const slots = [0, 0, 0, 0, 0, 0, 0, 0];
  if (feats.basic) {
    if (level >= 4) slots[0] += 1;
    if (level >= 6) slots[1] += 1;
    if (level >= 8) slots[2] += 1;
  }
  if (feats.expert) {
    if (level >= 12) slots[3] += 1;
    if (level >= 14) slots[4] += 1;
    if (level >= 16) slots[5] += 1;
  }
  if (feats.master) {
    if (level >= 18) slots[6] += 1;
    if (level >= 20) slots[7] += 1;
  }
  return slots;
}

/**
 * Multiclass archetype spell proficiency starts trained, then improves only
 * when the matching Expert/Master Spellcasting feat is present. Levels alone
 * must not promote the dedication's DC or spell attack.
 */
export function multiclassProficiencyRank(
  level: number,
  feats: { expert: boolean; master: boolean }
): number {
  if (feats.master && level >= 18) return 3;
  if (feats.expert && level >= 12) return 2;
  return 1;
}
