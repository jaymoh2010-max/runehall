import type {
  CharacterDraft,
  ClassData,
  ClassGrant,
  ClassGrantFeat,
  ClassGrantSpell,
} from "./types";

export type { ClassGrant, ClassGrantFeat, ClassGrantSpell, ClassGrantSpellKind } from "./types";

export interface SelectedClassGrants {
  feats: ClassGrantFeat[];
  spells: ClassGrantSpell[];
  focusPoints: number;
  notes: string[];
}

function feat(id: string, name: string, level = 1, source?: string): ClassGrantFeat {
  return { id, name, level, source };
}

function focus(id: string, name: string, source?: string): ClassGrantSpell {
  return { id, name, rank: 1, kind: "focus", source };
}

function repertoire(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "repertoire", source };
}

/**
 * Curated level-1 class-choice grants for the options whose mechanics are
 * prose-only in the generated compendium. Fixed grants live here; free choices
 * (domains, devotion spells, variable bloodline gifts, curriculum variants)
 * stay explicit notes until they have their own draft controls.
 */
export const CLASS_GRANTS: Record<string, ClassGrant> = {
  // Druid orders
  "cf:POBvoXifa9HaejAg": {
    feats: [feat("feat:f2Pl5dWEL9ZvEyI1", "Animal Companion")],
    spells: [focus("spell:Zmh4ynfnCtwKeAYl", "Heal Animal")],
  },
  "cf:IiYUhFGqq2Nw0b5Y": {
    feats: [feat("feat:7y1BCJLrdk9mKXlc", "Leshy Familiar")],
    spells: [focus("spell:vQuwLqtFFYt0K15N", "Cornucopia")],
  },
  "cf:NdeFvIXdHwKYLiUj": {
    feats: [feat("feat:yOloZIGkulrrPYG4", "Fire Lung")],
    spells: [focus("spell:jks2h5pMsm8pCi8e", "Wildfire")],
  },
  "cf:u4nlOzPj2WHkIj9l": {
    feats: [feat("feat:7y1BCJLrdk9mKXlc", "Leshy Familiar")],
    spells: [focus("spell:vQuwLqtFFYt0K15N", "Cornucopia")],
  },
  "cf:X0k3njLOLX0322Po": {
    feats: [feat("feat:7y1BCJLrdk9mKXlc", "Leshy Familiar")],
    spells: [focus("spell:xCfOskoogDf9LBlD", "Mushroom Patch")],
  },
  "cf:fKTewWlYgFuhl4KA": {
    feats: [feat("feat:QEOe9AhQzdqIx1ei", "Steadying Stone")],
    spells: [focus("spell:AiWtiVmyasyL42J8", "Crushing Ground")],
  },
  "cf:acqqlYmti8D9QJi0": {
    feats: [feat("feat:UpEjRfQkCJCruAfb", "Storm Born")],
    spells: [focus("spell:ho1jSoYKrHUNnM90", "Tempest Surge")],
  },
  "cf:v0EjtiwdeMj8ykI0": {
    feats: [feat("feat:VaIHQzOE5ibmbtqU", "Untamed Form")],
    spells: [focus("spell:0xR9vrt6uDFl0Umo", "Untamed Shift")],
  },
  "cf:FuUXyv2yBs7zRgqT": {
    feats: [feat("feat:kS4wxSKrZxcOvSNK", "Shore Step")],
    spells: [focus("spell:zTN6zuruDUKOea6h", "Rising Surf")],
  },

  // Bard muses (the muse spell is repertoire, not focus)
  "cf:4ripp6EfdVpS0d60": {
    feats: [feat("feat:uVXEZblPRuCyPRua", "Bardic Lore")],
    spells: [repertoire("spell:Gb7SeieEvd0pL2Eh", "Sure Strike")],
  },
  "cf:YMBsi4bndRAk5CX4": {
    feats: [feat("feat:sVjATEo8eqkAosNp", "Lingering Composition")],
    spells: [repertoire("spell:szIyEsvihc5e1w8n", "Soothe")],
  },
  "cf:y0jGimYdMGDJWrEq": {
    feats: [feat("feat:jBp91q4uzwd4FeSX", "Versatile Performance")],
    spells: [repertoire("spell:xqmHD8JIjak15lRk", "Phantasmal Minion")],
  },
  "cf:N03BtRvjX9TeHRa4": {
    feats: [feat("feat:q1iP3SjAF5uceI0M", "Martial Performance")],
    spells: [repertoire("spell:4koZzrnMXhhosn0D", "Fear")],
  },
  "cf:jHOlcSnGyjCnwoPP": {
    feats: [feat("feat:VjQfJKeDc46cWtgk", "Zoophonic Communication")],
    spells: [repertoire("spell:4YnON9JHYqtLzccu", "Summon Animal")],
  },

  // Wizard arcane schools: initial focus spell. Curriculum remains a manual note.
  "cf:srcPBNjhq7FBSmi3": { spells: [focus("spell:AzTFMy9E9HQcLNRg", "Debilitating Terror")] },
  "cf:HYTaibaCGE85rhbZ": {
    notes: [
      "Runelord: choose your sin, personal rune, and arcane bond; polearm/spear training remains manual.",
    ],
  },
  "cf:wObrT6PytPdS5aUi": { spells: [focus("spell:lY9fOk1qBDDhBT8s", "Protective Wards")] },
  "cf:E4GZDMn4DYk6qSEV": { spells: [focus("spell:Hu38hoAUSYeFpkVa", "Force Bolt")] },
  "cf:YZ2XPmx1WHyWtM0g": { spells: [focus("spell:ffz6wlSMzhaDpjg6", "Earthworks")] },
  "cf:a7yKDVnAYduaKIrL": { spells: [focus("spell:dweKouFW8OdZ3LXZ", "Control Currents")] },
  "cf:XXnGHBxNZvRsdkKM": { spells: [focus("spell:cCFDnmFB1EGeQUeA", "Friendly Push")] },
  "cf:jtAqb5rnhQblZuM8": { spells: [focus("spell:KR8WgdazifDBjDkW", "Unexpected Windfall")] },
  "cf:bCj5dSlq9VpjWXkU": { spells: [focus("spell:p8HnYqIi6sl8AJT2", "Fact Check")] },
  "cf:dPAwM9IdabdH68mW": { spells: [focus("spell:pSepsfCrrAKuwA0N", "Augmented Body")] },
  "cf:L5FiuXsfW6Sa31gO": { spells: [focus("spell:KMFRKzNCq7hVNH7H", "Charming Push")] },
  "cf:Eygg2xIAFtc4xZgQ": {
    spells: [focus("spell:AfZ1dV4pcxYmaWnH", "Extradimensional Cover")],
  },
  "cf:ZBFICTkzUjE4BDGJ": { spells: [focus("spell:XcMObj2p9nIBp53b", "Scramble Body")] },
  "cf:X8BINW8OLQpIPpys": { spells: [focus("spell:fwPNYmpOyzRehEY4", "Circle of Weakness")] },
  "cf:KGkWSv9rARpwWzXW": {
    spells: [focus("spell:IERHT6v4o5ISvuJG", "Halcyon Mists")],
    notes: ["Rooted Wisdom: the secondary branch choices remain manual."],
  },
  "cf:0QAFC61tpP63GUQa": { spells: [focus("spell:NIAHICPpNILGzTd0", "The Night is Mine")] },
  "cf:ZpFCZnVzIfZLfNii": { spells: [focus("spell:tWzxuJdbXqvskdIo", "Fortify Summoning")] },
  "cf:n2LRzksKVSzOuzqN": { spells: [focus("spell:cQgPIohUja0DUiRL", "Grasping Vine")] },
  "cf:xYYhJtGhFSWNifcO": {
    spells: [focus("spell:bSDTWUIvgXkBaEv8", "Hand of the Apprentice")],
    notes: [
      "Unified Magical Theory: choose one additional 1st-level wizard feat and one 1st-rank spell.",
    ],
  },

  // Wizard theses
  "cf:SNZ46g3u7U6x0XJj": {
    feats: [feat("feat:bcxIg7wi8ZAhvhOD", "Familiar")],
  },
  "cf:89zWKD2CN7nRu2xp": {
    notes: ["Experimental Spellshaping: choose one 1st-level spellshape wizard feat."],
  },
  "cf:OAcxS625AXSGrQIC": {
    notes: ["Spell Blending: spell-slot trade remains manual."],
  },
  "cf:QzWXMCSGNfvvpYgF": {
    notes: ["Spell Substitution: prepared-spell swapping remains manual."],
  },
  "cf:Klb35AwlkNrq1gpB": {
    notes: ["Staff Nexus: makeshift staff and its chosen spells remain manual."],
  },

  // Sorcerer bloodlines: initial bloodline focus spell. Gifts stay a manual note.
  "cf:3qqvnC2U8W26yae7": { spells: [focus("spell:i8PBZsnoCrK7IWph", "Tentacular Limbs")] },
  "cf:TFihgf3jDhmKd0fa": { spells: [focus("spell:dQ7LrD2HxJoCzi2M", "Barbed Spear")] },
  "cf:vhW3glAaEfq2DKrw": { spells: [focus("spell:w3uGXDVEdbLFZVO0", "Angelic Halo")] },
  "cf:w5koctOVrEcpxTIq": { spells: [focus("spell:SdXFiQ4Py8761sNO", "Glutton's Jaws")] },
  "cf:o39zQMIdERWtmBSB": { spells: [focus("spell:Vctwx1ewa8HUOA94", "Diabolic Edict")] },
  "cf:ZHabYxSgYK0XbjhM": {
    spells: [focus("spell:K8vvrOgW4bGakXxm", "Flurry of Claws")],
    notes: ["Draconic: choose your exemplar, tradition, and second bloodline skill."],
  },
  "cf:RXRnJcG4XSabZ35a": {
    spells: [focus("spell:0JUOgbbFCapp3HlW", "Elemental Toss")],
    notes: ["Elemental: choose your element and its granted cantrip/1st-rank gift."],
  },
  "cf:eW3cfCH7Wpx2vik2": { spells: [focus("spell:IkS3lDGUpIOMug7v", "Faerie Dust")] },
  "cf:tYOMBiH3HbViNWwn": {
    spells: [focus("spell:OyiKIbWllLZC6sGz", "Genie's Veil")],
    notes: ["Genie: choose your genie type and later gift spells."],
  },
  "cf:O0uXZRWMNliDbkxU": { spells: [focus("spell:kvm68hVtmADiIvN4", "Jealous Hex")] },
  "cf:b6hyZTs1rVGHDexz": { spells: [focus("spell:PaHxcqXihXkkXPsB", "Unraveling Blast")] },
  "cf:ZEtJJ5UOlV5oTWWp": { spells: [focus("spell:dtOUkMC57izf93z5", "Ancestral Memories")] },
  "cf:5Wxjghw7lHuCxjZz": { spells: [focus("spell:pHrVvoTKygXeczVG", "Nymph's Token")] },
  "cf:TWR1wbPJuCLnGdFZ": {
    spells: [focus("spell:lZx8jZfKrMEtyGY0", "Rejuvenating Flames")],
  },
  "cf:PpzH9tJULk5ksX9w": { spells: [focus("spell:3mINzPzup2m9qzFU", "Sepulchral Mask")] },
  "cf:uoQOm41BVdSo6pAS": { spells: [focus("spell:6UafOE1ZUbHamsZJ", "Dim the Light")] },
  "cf:7WBZ2kkhZ7JorWu2": { spells: [focus("spell:FedTjedva2rYk33r", "Undeath's Blessing")] },
  "cf:dKTb959aCQIzSIXj": {
    spells: [focus("spell:K8vvrOgW4bGakXxm", "Flurry of Claws")],
  },

  // Cleric doctrines
  "cf:ZZzLMOUAtBVgV1DF": {
    feats: [feat("feat:hT4INKGtly4QY8KN", "Domain Initiate")],
    focusPoints: 1,
    notes: ["Choose a deity domain and its initial domain spell on the Spells step."],
  },
  "cf:0Aocw3igLwna9cjp": {
    feats: [feat("feat:jM72TjJ965jocBV8", "Shield Block")],
    notes: [
      "Deadly Simplicity is only granted when your deity's favored weapon is simple or unarmed.",
    ],
  },
  "cf:49CkgA3kj7Im6gZ5": {
    notes: [
      "Battle Creed: Battle Harbinger spellcasting and conditional Deadly Simplicity remain manual.",
    ],
  },
};

const CLASS_NOTES: Record<string, string[]> = {
  champion: [
    "Choose Lay on Hands, Touch of the Void, or Shields of the Spirit as your devotion spell; deity font decides which are legal.",
  ],
  wizard: [
    "Arcane school curriculum spells are listed in the class description; add the ones your table uses on the Spells step.",
  ],
  sorcerer: [
    "Bloodline gift spells are listed in the bloodline description; add the fixed cantrip and 1st-rank gift on the Spells step.",
  ],
  cleric: [
    "Divine font slots are heal-or-harm only and are tracked separately from ordinary slots.",
  ],
};

function spellKey(spell: ClassGrantSpell): string {
  return `${spell.id}:${spell.kind}`;
}

export function selectedClassGrants(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): SelectedClassGrants {
  const result: SelectedClassGrants = { feats: [], spells: [], focusPoints: 0, notes: [] };
  if (!classData) return result;
  const featIds = new Set<string>();
  const spellKeys = new Set<string>();
  const addGrant = (grant: ClassGrant | undefined) => {
    if (!grant) return;
    for (const item of grant.feats ?? []) {
      if (item.level > draft.level || featIds.has(item.id)) continue;
      featIds.add(item.id);
      result.feats.push(item);
    }
    for (const item of grant.spells ?? []) {
      const key = spellKey(item);
      if (item.rank > Math.ceil(draft.level / 2) || spellKeys.has(key)) continue;
      // A spell granted as focus stays focus even if another table entry lists
      // it as a repertoire/curriculum option.
      if (result.spells.some((spell) => spell.id === item.id && spell.kind === "focus")) {
        continue;
      }
      spellKeys.add(key);
      result.spells.push(item);
    }
    result.focusPoints = Math.max(result.focusPoints, grant.focusPoints ?? 0);
    for (const note of grant.notes ?? []) {
      if (!result.notes.includes(note)) result.notes.push(note);
    }
  };

  for (const group of classData.choiceGroups) {
    if ((group.sourceFeature?.level ?? 0) > draft.level) continue;
    for (const id of draft.classChoices[group.key] ?? []) {
      const option = group.options.find((entry) => entry.id === id);
      if (option && option.level <= draft.level) addGrant(CLASS_GRANTS[option.id]);
    }
  }
  for (const note of CLASS_NOTES[classData.name.toLowerCase()] ?? []) {
    if (!result.notes.includes(note)) result.notes.push(note);
  }
  return result;
}

export function selectedClassGrantFeatIds(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): Set<string> {
  return new Set(selectedClassGrants(draft, classData).feats.map((feat) => feat.id));
}

export function selectedClassGrantSpells(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): ClassGrantSpell[] {
  return selectedClassGrants(draft, classData).spells;
}
