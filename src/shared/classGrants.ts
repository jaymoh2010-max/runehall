import type {
  CharacterDraft,
  ClassData,
  ClassGrant,
  ClassGrantFeat,
  ClassGrantSpell,
  Deity,
} from "./types";
import { activeGrantChoiceGroups } from "./classGrantChoices";

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

function curriculum(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "curriculum", source };
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
      "Runelord: the chosen sin grants its focus spell and rank-0/rank-1 sin curriculum. Personal rune, arcane bond, polearm/spear training, higher-rank sin curriculum, and Runelord Dedication remain manual.",
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
    notes: ["Rooted Wisdom: choose one secondary branch; its curriculum remains manual."],
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

const CLASS_NOTES: Record<string, string[]> = {
  champion: [
    "The devotion spell choice is filtered by your deity's divine font; Lay on Hands requires heal, Touch of the Void requires harm, and Shields of the Spirit is always legal. Cause sanctification, blessings, and higher-level focus spells remain manual.",
  ],
  wizard: [
    "Rank-0 and rank-1 school curriculum spells are granted automatically, including the chosen Runelord sin's focus spell and rank-0/rank-1 sin curriculum. Higher-rank curriculum, Rooted Wisdom branch spells, personal runes, and arcane bonds remain manual.",
  ],
  sorcerer: [
    "The fixed bloodline cantrip and 1st-rank gift are granted automatically; Elemental's chosen element grants its cantrip and 1st-rank gift. Higher-rank and advanced bloodline gifts remain manual.",
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
      if (item.kind === "focus") {
        // Focus wins over an earlier repertoire/curriculum grant of the same spell.
        const duplicate = result.spells.findIndex(
          (spell) => spell.id === item.id && spell.kind !== "focus"
        );
        if (duplicate >= 0) {
          const [removed] = result.spells.splice(duplicate, 1);
          spellKeys.delete(spellKey(removed));
        }
      } else if (result.spells.some((spell) => spell.id === item.id && spell.kind === "focus")) {
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
