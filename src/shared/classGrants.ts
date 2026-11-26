import type {
  CharacterDraft,
  ClassData,
  ClassGrant,
  ClassGrantFeat,
  ClassGrantSpell,
  Deity,
  StudiousSlotSpell,
} from "./types";
import { activeGrantChoiceGroups } from "./classGrantChoices";
import {
  ORACLE_MYSTERY_SPELLS,
  SORCERER_BLOODLINE_FOCUS,
  SORCERER_BLOODLINE_SPELLS,
  WIZARD_CURRICULUM_SPELLS,
} from "./classSpellData";

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

/** A focus cantrip is castable at will and does not spend a Focus Point. */
function focusCantrip(id: string, name: string, source?: string): ClassGrantSpell {
  return { id, name, rank: 0, kind: "focusCantrip", source };
}

function repertoire(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "repertoire", source };
}

function curriculum(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "curriculum", source };
}

/**
 * Curated level-1 class-choice grants for the options whose mechanics are
 * prose-only in the generated compendium. Fixed grants live here; free choices
 * (domains, devotion spells, variable bloodline gifts, curriculum variants)
 * stay explicit notes until they have their own draft controls.
 */
export const MAGUS_STUDIOUS_BASE: Array<{ level: 7 | 11 | 13; spell: StudiousSlotSpell }> = [
  { level: 7, spell: { id: "spell:5KobTMrZeZxuXMgl", name: "Gecko Grip", rank: 2 } },
  { level: 11, spell: { id: "spell:o6YCGx4lycsYpww4", name: "Haste", rank: 3 } },
  { level: 13, spell: { id: "spell:A2JfEKe6BZcTG1S8", name: "Fly", rank: 4 } },
];

/**
 * Hybrid-study studious spells. The class grants these in addition to Gecko
 * Grip, Haste, and Fly; the special slots only accept this list.
 */
export const MAGUS_STUDIOUS_BY_STUDY: Record<
  string,
  Partial<Record<"7" | "11" | "13", StudiousSlotSpell>>
> = {
  // Aloof Firmament
  "cf:9CC5Ek0Mq768Lhgx": {
    "7": { id: "spell:Seaah9amXg70RKw2", name: "Water Walk", rank: 2 },
    "11": { id: "spell:it4ZsAi6XgvGcodc", name: "Wall of Wind", rank: 3 },
    "13": { id: "spell:DcmWrD0V5PWQQyDm", name: "Variable Gravity", rank: 4 },
  },
  // Inexorable Iron
  "cf:ZslXrvYRxHBXc1Ds": {
    "7": { id: "spell:wzctak6BxOW8xvFV", name: "Enlarge", rank: 2 },
    "11": { id: "spell:gPvtmKMRpg9I9D7H", name: "Earthbind", rank: 3 },
    "13": { id: "spell:ksLCg62cLOojw3gN", name: "Planar Tether", rank: 4 },
  },
  // Laughing Shadow
  "cf:3gVDqDPSz4fB5T9G": {
    "7": { id: "spell:3JG1t3T4mWn6vTke", name: "Blur", rank: 2 },
    "11": { id: "spell:AMEu5zzLN7uCX645", name: "Ghostly Weapon", rank: 3 },
    "13": { id: "spell:VlNcjmYyu95vOUe8", name: "Translocate", rank: 4 },
  },
  // Resurgent Maelstrom
  "cf:X3nPGnqh6rkRJ75i": {
    "7": { id: "spell:Seaah9amXg70RKw2", name: "Water Walk", rank: 2 },
    "11": { id: "spell:oUDNCArkQTdhllxD", name: "Aqueous Orb", rank: 3 },
    "13": { id: "spell:aqRYNoSvxsVfqglH", name: "Unfettered Movement", rank: 4 },
  },
  // Sparkling Targe
  "cf:maGzhKLmgubAdUlN": {
    "7": { id: "spell:Fr58LDSrbndgld9n", name: "Resist Energy", rank: 2 },
    "11": { id: "spell:CIjj9CU5ekeq1oLT", name: "Warding Aggression", rank: 3 },
    "13": { id: "spell:2BV2yYPfVJ5zirZt", name: "Mountain Resilience", rank: 4 },
  },
  // Starlit Span
  "cf:Pew7duAozEeAemif": {
    "7": { id: "spell:mrDi3v933gsmnw25", name: "Telekinetic Maneuver", rank: 2 },
    "11": { id: "spell:it4ZsAi6XgvGcodc", name: "Wall of Wind", rank: 3 },
    "13": { id: "spell:aqRYNoSvxsVfqglH", name: "Unfettered Movement", rank: 4 },
  },
  // Twisting Tree
  "cf:6YJ8KFl7THkVy6Gm": {
    "7": { id: "spell:YWrfKetOqDwVFut7", name: "Oaken Resilience", rank: 2 },
    "11": { id: "spell:WsUwpfmhKrKwoIe3", name: "Slow", rank: 3 },
    "13": { id: "spell:zR67Rt3UMHKC5evy", name: "Flicker", rank: 4 },
  },
  // Twofold Tine
  "cf:h6WJ9Se8ahvOG3XB": {
    "7": { id: "spell:3JG1t3T4mWn6vTke", name: "Blur", rank: 2 },
    "11": { id: "spell:06pzGkKTyPE3tHR8", name: "Gravity Well", rank: 3 },
    "13": { id: "spell:aqRYNoSvxsVfqglH", name: "Unfettered Movement", rank: 4 },
  },
  // Unfurling Brocade
  "cf:y0WQzzshwGIymZsr": {
    "7": { id: "spell:9s5tqqXNzcoKamWx", name: "Web", rank: 2 },
    "11": { id: "spell:k9x6bXXpIgAXMDsx", name: "Whirling Scarves", rank: 3 },
    "13": { id: "spell:ksLCg62cLOojw3gN", name: "Planar Tether", rank: 4 },
  },
  // Volatile Spark
  "cf:aRDNtB0mh6MMRSKf": {
    "7": { id: "spell:J6vNvrUT3b1hx2iA", name: "Entangling Flora", rank: 2 },
    "11": { id: "spell:gPvtmKMRpg9I9D7H", name: "Earthbind", rank: 3 },
    "13": { id: "spell:gfKhtVsXF3HKSdmY", name: "Seal Fate", rank: 4 },
  },
};

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

  // Bard composition spells: one focus spell and one extra composition
  // cantrip that does not count against the bard's normal cantrip limit.
  "cf:s0VbbQJNlSgPocui": {
    focusPoints: 1,
    spells: [
      focus("spell:WILXkjU5Yq3yw10r", "Counter Performance"),
      repertoire("spell:IAjvwqgiDr3qGYxY", "Courageous Anthem", 0),
    ],
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

  // Wizard arcane schools: initial focus spell plus fixed rank-0/rank-1
  // curriculum spells. Higher-rank curriculum and divisive sub-choices stay
  // manual notes.
  "cf:srcPBNjhq7FBSmi3": {
    spells: [
      focus("spell:AzTFMy9E9HQcLNRg", "Debilitating Terror"),
      curriculum("spell:0zU8CPejjQFnhZFI", "Figment", 0),
      curriculum("spell:MPxbKoR54gkYkqLO", "Gouging Claw", 0),
      curriculum("spell:aEM2cttJ2eYcLssW", "Fleet Step"),
      curriculum("spell:i35dpZFI7jZcRoBo", "Illusory Disguise"),
      curriculum("spell:Gb7SeieEvd0pL2Eh", "Sure Strike"),
    ],
  },
  "cf:HYTaibaCGE85rhbZ": {
    focusPoints: 1,
    spells: [
      curriculum("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      curriculum("spell:AUctDF2fqPZN2w4W", "Sigil", 0),
      curriculum("spell:aAbfKn8maGjJjk2W", "Mystic Armor"),
      curriculum("spell:EE7Q5BHIrfWNCPtT", "Runic Body"),
      curriculum("spell:TFitdEOpQC4SzKQQ", "Runic Weapon"),
      curriculum("spell:Gb7SeieEvd0pL2Eh", "Sure Strike"),
    ],
    notes: [
      "Runelord: the chosen sin grants its focus spell and full sin curriculum. Personal rune, arcane bond, and polearm/spear training remain manual.",
    ],
  },
  "cf:wObrT6PytPdS5aUi": {
    spells: [
      focus("spell:lY9fOk1qBDDhBT8s", "Protective Wards"),
      curriculum("spell:vLzFcIaSXs7YTIqJ", "Message", 0),
      curriculum("spell:AUctDF2fqPZN2w4W", "Sigil", 0),
      curriculum("spell:aIHY2DArKFweIrpf", "Command"),
      curriculum("spell:PRrZ7anETWPm90YY", "Disguise Magic"),
      curriculum("spell:EE7Q5BHIrfWNCPtT", "Runic Body"),
      curriculum("spell:TFitdEOpQC4SzKQQ", "Runic Weapon"),
    ],
  },
  "cf:E4GZDMn4DYk6qSEV": {
    spells: [
      focus("spell:Hu38hoAUSYeFpkVa", "Force Bolt"),
      curriculum("spell:TVKNbcgTee19PXZR", "Shield", 0),
      curriculum("spell:60sgbuMWN0268dB7", "Telekinetic Projectile", 0),
      curriculum("spell:y6rAdMK6EFlV6U0t", "Breathe Fire"),
      curriculum("spell:gKKqvLohtrSJj3BM", "Force Barrage"),
      curriculum("spell:aAbfKn8maGjJjk2W", "Mystic Armor"),
    ],
  },
  "cf:YZ2XPmx1WHyWtM0g": {
    spells: [
      focus("spell:ffz6wlSMzhaDpjg6", "Earthworks"),
      curriculum("spell:Qw3fnUlaUbnn7ipC", "Prestidigitation", 0),
      curriculum("spell:OhD2Z6rIGGD5ocZA", "Read Aura", 0),
      curriculum("spell:jfVCuOpzC6mUrf6f", "Hydraulic Push"),
      curriculum("spell:Rn2LkoSq1XhLsODV", "Pummeling Rubble"),
      curriculum("spell:lKcsmeOrgHtK4xQa", "Summon Construct"),
    ],
  },
  "cf:a7yKDVnAYduaKIrL": {
    spells: [
      focus("spell:dweKouFW8OdZ3LXZ", "Control Currents"),
      curriculum("spell:vLzFcIaSXs7YTIqJ", "Message", 0),
      curriculum("spell:eSL5hVT9gXrnRLtd", "Spout", 0),
      curriculum("spell:g8QqHpv2CWDwmIm1", "Gust of Wind"),
      curriculum("spell:jfVCuOpzC6mUrf6f", "Hydraulic Push"),
      curriculum("spell:vUEkyqkjDwBDLMZZ", "Rude Awakening"),
    ],
    notes: ["Corentyn Armada: the 3rd-rank aquatic arsenal spell is not in the compendium."],
  },
  "cf:XXnGHBxNZvRsdkKM": {
    spells: [
      focus("spell:cCFDnmFB1EGeQUeA", "Friendly Push"),
      curriculum("spell:vLzFcIaSXs7YTIqJ", "Message", 0),
      curriculum("spell:pwzdSlJgYqN7bs2w", "Telekinetic Hand", 0),
      curriculum("spell:aEM2cttJ2eYcLssW", "Fleet Step"),
      curriculum("spell:Azoh0BSoCASrA1lr", "Lock"),
      curriculum("spell:qTr2oCgIXl703Whb", "Thoughtful Gift"),
    ],
  },
  "cf:jtAqb5rnhQblZuM8": {
    spells: [
      focus("spell:KR8WgdazifDBjDkW", "Unexpected Windfall"),
      curriculum("spell:Qw3fnUlaUbnn7ipC", "Prestidigitation", 0),
      curriculum("spell:OhD2Z6rIGGD5ocZA", "Read Aura", 0),
      curriculum("spell:4WAib3GichxLjp5p", "Alarm"),
      curriculum("spell:vLA0q0WOK2YPuJs6", "Charm"),
      curriculum("spell:4ZGte0i9YbLh4dRi", "Item Facade"),
    ],
  },
  "cf:bCj5dSlq9VpjWXkU": {
    spells: [
      focus("spell:p8HnYqIi6sl8AJT2", "Fact Check"),
      curriculum("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      curriculum("spell:AUctDF2fqPZN2w4W", "Sigil", 0),
      curriculum("spell:PRrZ7anETWPm90YY", "Disguise Magic"),
      curriculum("spell:i35dpZFI7jZcRoBo", "Illusory Disguise"),
      curriculum("spell:D442XMADp01qJ7Cs", "Mindlink"),
    ],
  },
  "cf:dPAwM9IdabdH68mW": {
    spells: [
      focus("spell:pSepsfCrrAKuwA0N", "Augmented Body"),
      curriculum("spell:iYRDFxeVpJ5KIjmr", "Needle Darts", 0),
      curriculum("spell:TVKNbcgTee19PXZR", "Shield", 0),
      curriculum("spell:dINQzhqGmIsqGMUY", "Mending"),
      curriculum("spell:TFitdEOpQC4SzKQQ", "Runic Weapon"),
      curriculum("spell:lKcsmeOrgHtK4xQa", "Summon Construct"),
    ],
  },
  "cf:L5FiuXsfW6Sa31gO": {
    spells: [
      focus("spell:KMFRKzNCq7hVNH7H", "Charming Push"),
      curriculum("spell:4gBIw4IDrSfFHik4", "Daze", 0),
      curriculum("spell:0zU8CPejjQFnhZFI", "Figment", 0),
      curriculum("spell:UKsIOWmMx4hSpafl", "Dizzying Colors"),
      curriculum("spell:o4lRVTwSxnOOn5vl", "Sleep"),
      curriculum("spell:Gb7SeieEvd0pL2Eh", "Sure Strike"),
    ],
  },
  "cf:Eygg2xIAFtc4xZgQ": {
    spells: [
      focus("spell:AfZ1dV4pcxYmaWnH", "Extradimensional Cover"),
      curriculum("spell:5gophZ4AOKW4VW27", "Phase Bolt", 0),
      curriculum("spell:sX2g6WFSQPNW9jzx", "Warp Step", 0),
      curriculum("spell:4WAib3GichxLjp5p", "Alarm"),
      curriculum("spell:F1nlmqOIucch3Cmt", "Pet Cache"),
      curriculum("spell:qTr2oCgIXl703Whb", "Thoughtful Gift"),
    ],
  },
  "cf:ZBFICTkzUjE4BDGJ": {
    spells: [
      focus("spell:XcMObj2p9nIBp53b", "Scramble Body"),
      curriculum("spell:MPxbKoR54gkYkqLO", "Gouging Claw", 0),
      curriculum("spell:uZK2BYzPnxUBnDjr", "Tangle Vine", 0),
      curriculum("spell:Q7QQ91vQtyi1Ux36", "Jump"),
      curriculum("spell:gfPjmG6Fe6D3MFjl", "Pest Form"),
      curriculum("spell:DYdvMZ8G2LiSLVWw", "Spider Sting"),
    ],
  },
  "cf:X8BINW8OLQpIPpys": {
    spells: [
      focus("spell:fwPNYmpOyzRehEY4", "Circle of Weakness"),
      curriculum("spell:dDiOnjcsBFbAvP6t", "Gale Blast", 0),
      curriculum("spell:zA0jNIBRgLsyTpbm", "Scatter Scree", 0),
      curriculum("spell:nPb8DDs4rZpBLWIb", "Cradle Aloft"),
      curriculum("spell:TTwOKGqmZeKSyNMH", "Gentle Landing"),
      curriculum("spell:Rn2LkoSq1XhLsODV", "Pummeling Rubble"),
    ],
  },
  "cf:KGkWSv9rARpwWzXW": {
    spells: [
      focus("spell:IERHT6v4o5ISvuJG", "Halcyon Mists"),
      curriculum("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      curriculum("spell:4WAib3GichxLjp5p", "Alarm"),
    ],
    notes: ["Rooted Wisdom: the chosen secondary branch's additional curriculum is granted."],
  },
  "cf:0QAFC61tpP63GUQa": {
    spells: [
      focus("spell:NIAHICPpNILGzTd0", "The Night is Mine"),
      curriculum("spell:0zU8CPejjQFnhZFI", "Figment", 0),
      curriculum("spell:IxhGEKl63R4QBvkj", "Frostbite", 0),
      curriculum("spell:PRrZ7anETWPm90YY", "Disguise Magic"),
      curriculum("spell:MiDbBU5uupWqjYzm", "Gloom Mantle"),
      curriculum("spell:2oH5IufzdESuYxat", "Illusory Object"),
    ],
  },
  "cf:ZpFCZnVzIfZLfNii": {
    spells: [
      focus("spell:tWzxuJdbXqvskdIo", "Fortify Summoning"),
      curriculum("spell:pwzdSlJgYqN7bs2w", "Telekinetic Hand", 0),
      curriculum("spell:mAMEt4FFbdqoRnkN", "Void Warp", 0),
      curriculum("spell:k34hDOfIIMAxNL4a", "Grim Tendrils"),
      curriculum("spell:xqmHD8JIjak15lRk", "Phantasmal Minion"),
      curriculum("spell:9WGeBwIIbbUuWKq0", "Summon Undead"),
    ],
  },
  "cf:n2LRzksKVSzOuzqN": {
    spells: [
      focus("spell:cQgPIohUja0DUiRL", "Grasping Vine"),
      curriculum("spell:pwzdSlJgYqN7bs2w", "Telekinetic Hand", 0),
      curriculum("spell:60sgbuMWN0268dB7", "Telekinetic Projectile", 0),
      curriculum("spell:aEM2cttJ2eYcLssW", "Fleet Step"),
      curriculum("spell:g8QqHpv2CWDwmIm1", "Gust of Wind"),
      curriculum("spell:dINQzhqGmIsqGMUY", "Mending"),
    ],
  },
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

  // Sorcerer bloodlines: initial focus spell plus fixed cantrip and 1st-rank
  // gift. Variable gifts (Elemental) and higher-rank gifts stay manual notes.
  "cf:3qqvnC2U8W26yae7": {
    spells: [
      focus("spell:i8PBZsnoCrK7IWph", "Tentacular Limbs"),
      repertoire("spell:4gBIw4IDrSfFHik4", "Daze", 0),
      repertoire("spell:R8bqnYiThB6MYTxD", "Phantom Pain"),
    ],
  },
  "cf:TFihgf3jDhmKd0fa": {
    spells: [
      focus("spell:dQ7LrD2HxJoCzi2M", "Barbed Spear"),
      repertoire("spell:TVKNbcgTee19PXZR", "Shield", 0),
      repertoire("spell:aAbfKn8maGjJjk2W", "Mystic Armor"),
    ],
  },
  "cf:vhW3glAaEfq2DKrw": {
    spells: [
      focus("spell:w3uGXDVEdbLFZVO0", "Angelic Halo"),
      repertoire("spell:WBmvzNDfpwka3qT4", "Light", 0),
      repertoire("spell:rfZpqmj0AIIdkVIs", "Heal"),
    ],
  },
  "cf:w5koctOVrEcpxTIq": {
    spells: [
      focus("spell:SdXFiQ4Py8761sNO", "Glutton's Jaws"),
      repertoire("spell:thAHF1zxNplLCJPO", "Caustic Blast", 0),
      repertoire("spell:4koZzrnMXhhosn0D", "Fear"),
    ],
    notes: ["Demonic: Caustic Blast is off-tradition but still granted by the bloodline."],
  },
  "cf:o39zQMIdERWtmBSB": {
    spells: [
      focus("spell:Vctwx1ewa8HUOA94", "Diabolic Edict"),
      repertoire("spell:6DfLZBl8wKIV03Iq", "Ignition", 0),
      repertoire("spell:vLA0q0WOK2YPuJs6", "Charm"),
    ],
    notes: ["Diabolic: Ignition and Charm are off-tradition but still granted by the bloodline."],
  },
  "cf:ZHabYxSgYK0XbjhM": {
    spells: [
      focus("spell:K8vvrOgW4bGakXxm", "Flurry of Claws"),
      repertoire("spell:TVKNbcgTee19PXZR", "Shield", 0),
      repertoire("spell:4koZzrnMXhhosn0D", "Fear"),
    ],
    notes: [
      "Draconic: choose your exemplar, tradition, and second bloodline skill; 2nd/5th/8th-level gifts remain manual.",
    ],
  },
  "cf:RXRnJcG4XSabZ35a": {
    spells: [focus("spell:0JUOgbbFCapp3HlW", "Elemental Toss")],
    notes: [
      "Elemental: choose air, earth, fire, metal, water, or wood. The chosen element grants its cantrip and 1st-rank gift; blood magic damage and higher-rank gifts remain manual.",
    ],
  },
  "cf:eW3cfCH7Wpx2vik2": {
    spells: [
      focus("spell:IkS3lDGUpIOMug7v", "Faerie Dust"),
      repertoire("spell:0zU8CPejjQFnhZFI", "Figment", 0),
      repertoire("spell:vLA0q0WOK2YPuJs6", "Charm"),
    ],
    notes: ["Fey: Figment is off-tradition but still granted by the bloodline."],
  },
  "cf:tYOMBiH3HbViNWwn": {
    spells: [
      focus("spell:OyiKIbWllLZC6sGz", "Genie's Veil"),
      repertoire("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      repertoire("spell:i35dpZFI7jZcRoBo", "Illusory Disguise"),
    ],
    notes: ["Genie: level-1 gifts are fixed; choose your genie type for 2nd/5th/8th-level gifts."],
  },
  "cf:O0uXZRWMNliDbkxU": {
    spells: [
      focus("spell:kvm68hVtmADiIvN4", "Jealous Hex"),
      repertoire("spell:4gBIw4IDrSfFHik4", "Daze", 0),
      repertoire("spell:i35dpZFI7jZcRoBo", "Illusory Disguise"),
    ],
  },
  "cf:b6hyZTs1rVGHDexz": {
    spells: [
      focus("spell:PaHxcqXihXkkXPsB", "Unraveling Blast"),
      repertoire("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      repertoire("spell:6ZIKB0151LUR19Rw", "Ill Omen"),
    ],
  },
  "cf:ZEtJJ5UOlV5oTWWp": {
    spells: [
      focus("spell:dtOUkMC57izf93z5", "Ancestral Memories"),
      repertoire("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      repertoire("spell:gKKqvLohtrSJj3BM", "Force Barrage"),
    ],
    notes: ["Imperial: the advanced bloodline spell Extend is not in the compendium."],
  },
  "cf:5Wxjghw7lHuCxjZz": {
    spells: [
      focus("spell:pHrVvoTKygXeczVG", "Nymph's Token"),
      repertoire("spell:uZK2BYzPnxUBnDjr", "Tangle Vine", 0),
      repertoire("spell:vLA0q0WOK2YPuJs6", "Charm"),
    ],
  },
  "cf:TWR1wbPJuCLnGdFZ": {
    spells: [
      focus("spell:lZx8jZfKrMEtyGY0", "Rejuvenating Flames"),
      repertoire("spell:gpzpAAAJ1Lza2JVl", "Detect Magic", 0),
      repertoire("spell:y6rAdMK6EFlV6U0t", "Breathe Fire"),
    ],
  },
  "cf:PpzH9tJULk5ksX9w": {
    spells: [
      focus("spell:3mINzPzup2m9qzFU", "Sepulchral Mask"),
      repertoire("spell:kcelf6IHl3L9VXXg", "Vitality Lash", 0),
      repertoire("spell:rfZpqmj0AIIdkVIs", "Heal"),
    ],
  },
  "cf:uoQOm41BVdSo6pAS": {
    spells: [
      focus("spell:6UafOE1ZUbHamsZJ", "Dim the Light"),
      repertoire("spell:mAMEt4FFbdqoRnkN", "Void Warp", 0),
      repertoire("spell:k34hDOfIIMAxNL4a", "Grim Tendrils"),
    ],
  },
  "cf:7WBZ2kkhZ7JorWu2": {
    spells: [
      focus("spell:FedTjedva2rYk33r", "Undeath's Blessing"),
      repertoire("spell:mAMEt4FFbdqoRnkN", "Void Warp", 0),
      repertoire("spell:wdA52JJnsuQWeyqz", "Harm"),
    ],
  },
  "cf:dKTb959aCQIzSIXj": {
    spells: [
      focus("spell:K8vvrOgW4bGakXxm", "Flurry of Claws"),
      repertoire("spell:OhD2Z6rIGGD5ocZA", "Read Aura", 0),
      repertoire("spell:aAbfKn8maGjJjk2W", "Mystic Armor"),
    ],
    notes: ["Wyrmblessed: choose your dragon type; it does not change the level-1 gifts."],
  },

  // Psychic conscious minds. The listed 1st-rank spell is an extra repertoire
  // entry; the psi cantrips are granted cantrips and their amps spend focus.
  "cf:1rlBo3LcwIuPDCvz": {
    spells: [
      repertoire("spell:sPHcuLIKj9SDaDAD", "Kinetic Ram"),
      focusCantrip("spell:pwzdSlJgYqN7bs2w", "Telekinetic Hand"),
      focusCantrip("spell:60sgbuMWN0268dB7", "Telekinetic Projectile"),
      focusCantrip("spell:yyz029C9eqfY38PT", "Telekinetic Rend"),
    ],
    notes: ["Distant Grasp: amps are tracked; higher-level unique psi cantrips remain manual."],
  },
  "cf:rvpTsj9epRuNH3uB": {
    spells: [
      repertoire("spell:Gb7SeieEvd0pL2Eh", "Sure Strike"),
      focusCantrip("spell:gpzpAAAJ1Lza2JVl", "Detect Magic"),
      focusCantrip("spell:izcxFQFwf3woCnFs", "Guidance"),
      focusCantrip("spell:cNnHV97gPqxJ3Rrr", "Glimpse Weakness"),
    ],
    notes: ["Infinite Eye: amps are tracked; higher-level unique psi cantrips remain manual."],
  },
  "cf:5tSR0WzMPFn5s3Xs": {
    spells: [
      repertoire("spell:y6rAdMK6EFlV6U0t", "Breathe Fire"),
      focusCantrip("spell:IxhGEKl63R4QBvkj", "Frostbite"),
      focusCantrip("spell:6DfLZBl8wKIV03Iq", "Ignition"),
      focusCantrip("spell:dhpXpzt7TCm8TbHM", "Thermal Stasis"),
    ],
    notes: ["Oscillating Wave: amps are tracked; higher-level unique psi cantrips remain manual."],
  },
  "cf:rdWWlqvxXgfWDaSO": {
    spells: [
      repertoire("spell:D442XMADp01qJ7Cs", "Mindlink"),
      focusCantrip("spell:4gBIw4IDrSfFHik4", "Daze"),
      focusCantrip("spell:vLzFcIaSXs7YTIqJ", "Message"),
      focusCantrip("spell:lpoWfblSMLcJfxsZ", "Forbidden Thought"),
    ],
    notes: ["Silent Whisper: amps are tracked; higher-level unique psi cantrips remain manual."],
  },
  "cf:8dAm3ULUqaK4N5a7": {
    spells: [
      repertoire("spell:UKsIOWmMx4hSpafl", "Dizzying Colors"),
      focusCantrip("spell:0zU8CPejjQFnhZFI", "Figment"),
      focusCantrip("spell:TVKNbcgTee19PXZR", "Shield"),
      focusCantrip("spell:sUr5KCpeE6AXfvPp", "Imaginary Weapon"),
    ],
    notes: ["Tangible Dream: amps are tracked; higher-level unique psi cantrips remain manual."],
  },
  "cf:FaSY47siV1x6CAQp": {
    spells: [
      repertoire("spell:qTr2oCgIXl703Whb", "Thoughtful Gift"),
      focusCantrip("spell:5gophZ4AOKW4VW27", "Phase Bolt"),
      focusCantrip("spell:sX2g6WFSQPNW9jzx", "Warp Step"),
      focusCantrip("spell:WOM9alxiTdp0HEVD", "Distortion Lens"),
    ],
    notes: ["Unbound Step: amps are tracked; higher-level unique psi cantrips remain manual."],
  },

  // Necromancer grave spells
  "cf:oa47wZGEpPlVwPVz": {
    spells: [focus("spell:cg1l2AxBenLU6JFE", "Necrotic Bomb")],
    focusPoints: 2,
    notes: ["Thralls, grave spell effects, and additional grave spells remain manual."],
  },
  "cf:gyN8OZZ3txxIAKLf": {
    spells: [focus("spell:tFWa3ouvMC5Zz3P0", "Blood Infusion")],
  },
  "cf:4Y2Bt7bvuOeptAqS": {
    spells: [focus("spell:4JXxqBXigKECcpTm", "Bone Spear")],
  },
  "cf:nJLKij2UY2nxVmb9": {
    spells: [focus("spell:4kQMFyRKj5Gv13zl", "Dead Weight")],
  },
  "cf:qle7hjEReQK0nByC": {
    spells: [focus("spell:fgmxDC2PH2TEYGKG", "Life Tap")],
  },

  // Summoner link spells: the link cantrip is at will and does not cost focus.
  "cf:wguqw300DB5XdD8W": {
    spells: [
      focus("spell:lV8FkHZtzZu7Cy6j", "Evolution Surge"),
      focusCantrip("spell:HStu2Yhw3iQER9tY", "Boost Eidolon"),
    ],
    focusPoints: 1,
    notes: ["Eidolon abilities, tandem actions, and link cantrip amps remain manual."],
  },

  // Cleric doctrines
  "cf:ZZzLMOUAtBVgV1DF": {
    feats: [feat("feat:hT4INKGtly4QY8KN", "Domain Initiate")],
    focusPoints: 1,
    notes: ["Choose one of your deity's domains on the Class step; its initial spell is granted."],
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

// The compendium descriptions list every bloodline gift, mystery spell, and
// school curriculum entry. Use the generated data as the source of truth so
// higher-rank grants stay in sync with the class features.
for (const [featureId, spells] of Object.entries(SORCERER_BLOODLINE_SPELLS)) {
  const grant = CLASS_GRANTS[featureId] ?? {};
  CLASS_GRANTS[featureId] = grant;
  const initial = SORCERER_BLOODLINE_FOCUS[featureId]?.initial;
  grant.spells = [
    ...(initial ? [focus(initial.id, initial.name)] : []),
    ...spells.map((spell) => repertoire(spell.id, spell.name, spell.rank)),
  ];
}

for (const [featureId, spells] of Object.entries(ORACLE_MYSTERY_SPELLS)) {
  const grant = CLASS_GRANTS[featureId] ?? {};
  CLASS_GRANTS[featureId] = grant;
  grant.spells = spells.map((spell) => repertoire(spell.id, spell.name, spell.rank));
}

for (const [featureId, spells] of Object.entries(WIZARD_CURRICULUM_SPELLS)) {
  const grant = CLASS_GRANTS[featureId] ?? {};
  CLASS_GRANTS[featureId] = grant;
  grant.spells = [
    ...(grant.spells ?? []).filter((spell) => spell.kind !== "curriculum"),
    ...spells.map((spell) => curriculum(spell.id, spell.name, spell.rank)),
  ];
}

const CLASS_NOTES: Record<string, string[]> = {
  champion: [
    "The devotion spell choice is filtered by your deity's divine font; Lay on Hands requires heal, Touch of the Void requires harm, and Shields of the Spirit is always legal. Cause sanctification, blessings, and higher-level focus spells remain manual.",
  ],
  wizard: [
    "School curriculum spells are granted at every rank, including the chosen Runelord sin and Rooted Wisdom branch. Personal runes, arcane bonds, and spellbook accounting remain manual.",
  ],
  sorcerer: [
    "Bloodline gifts are granted at every rank. Elemental influence, genie type, and draconic tradition choices fill in their variable gifts; advanced and greater bloodline spells are chosen on the Class step after taking their feats.",
  ],
  cleric: [
    "Divine font slots are heal-or-harm only and are tracked separately from ordinary slots.",
    "Spells granted by your deity are included as available cleric spells; prepare them like any other divine spell.",
  ],
  magus: [
    "Studious spell slots are not tracked separately; add their specific spells manually.",
    "Spellstrike, Arcane Cascade, and conflux spell recharge remain manual.",
  ],
  animist: [
    "Prepared animist slots and spontaneous apparition slots are tracked separately; attune apparitions during daily preparations. The primary apparition's vessel focus spell is granted automatically.",
  ],
  psychic: [
    "Psi cantrips and their amps are granted and amp casting spends 1 Focus Point; higher-level unique psi cantrips remain manual.",
  ],
  necromancer: [
    "Thralls and the full grave-spell effects remain manual; the granted grave spells and focus pool are tracked.",
  ],
  summoner: [
    "The link cantrip is castable at will. Eidolon abilities and tandem actions remain manual.",
  ],
};

function spellKey(spell: ClassGrantSpell): string {
  return `${spell.id}:${spell.kind}`;
}

export function selectedClassGrants(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  deity?: Deity | null
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
      if (item.rank > Math.ceil(draft.level / 2)) continue;
      const focusLike = item.kind === "focus" || item.kind === "focusCantrip";
      if (focusLike) {
        // Focus and focus-cantrip grants win over an earlier repertoire or
        // curriculum grant of the same spell.
        const duplicate = result.spells.findIndex(
          (spell) => spell.id === item.id && spell.kind !== "focus" && spell.kind !== "focusCantrip"
        );
        if (duplicate >= 0) {
          const [removed] = result.spells.splice(duplicate, 1);
          spellKeys.delete(spellKey(removed));
        }
      } else if (
        result.spells.some(
          (spell) =>
            spell.id === item.id && (spell.kind === "focus" || spell.kind === "focusCantrip")
        )
      ) {
        continue;
      }
      const key = spellKey(item);
      if (spellKeys.has(key)) continue;
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

  // Fixed grants can also hang off a class feature that every member gets,
  // such as a bard's composition spells or a witch's starting hex.
  for (const feature of classData.features) {
    if (feature.level <= draft.level) addGrant(CLASS_GRANTS[feature.id]);
  }

  for (const group of activeGrantChoiceGroups(
    draft,
    classData,
    deity,
    result.feats.map((feat) => feat.id)
  )) {
    addGrant(group.baseGrant);
    const picks = [...new Set(draft.grantChoices[group.key] ?? [])].slice(0, group.count);
    for (const pick of picks) {
      const option = group.options.find((entry) => entry.id === pick);
      if (option) addGrant(option.grant);
    }
  }

  // A cleric can prepare spells granted by their deity in addition to the
  // divine list. Treat them as granted repertoire entries so the builder and
  // daily-preparations picker offer them without changing the deity data.
  if (classData.name.toLowerCase() === "cleric" && deity) {
    for (const [rankKey, entry] of Object.entries(deity.spells ?? {})) {
      const rank = Number(rankKey);
      if (!Number.isInteger(rank) || rank < 1 || rank > 10 || !entry?.id) continue;
      addGrant({
        spells: [
          {
            id: entry.id,
            name: entry.name,
            rank,
            kind: "repertoire",
            source: "Deity spells",
          },
        ],
      });
    }
  }

  for (const note of CLASS_NOTES[classData.name.toLowerCase()] ?? []) {
    if (!result.notes.includes(note)) result.notes.push(note);
  }
  return result;
}

export function selectedClassGrantFeatIds(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  deity?: Deity | null
): Set<string> {
  return new Set(selectedClassGrants(draft, classData, deity).feats.map((feat) => feat.id));
}

export function selectedClassGrantSpells(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  deity?: Deity | null
): ClassGrantSpell[] {
  return selectedClassGrants(draft, classData, deity).spells;
}
