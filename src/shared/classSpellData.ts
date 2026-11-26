// Generated from the class-feature descriptions in data/compendium by
// scripts/build-class-spell-data.cjs. Re-run that script after compendium updates.
// Every id was resolved against data/compendium/spells.json; entries the data
// cannot resolve are recorded in the review document instead of guessed.

export interface ClassSpellData {
  id: string;
  name: string;
  rank: number;
}

export interface ClassFocusSpell {
  id: string;
  name: string;
}

export interface ClassFocusData {
  name: string;
  initial: ClassFocusSpell;
  advanced?: ClassFocusSpell;
  greater?: ClassFocusSpell;
}

export const SORCERER_BLOODLINE_SPELLS: Record<string, ClassSpellData[]> = {
  "cf:3qqvnC2U8W26yae7": [
    {
      id: "spell:4gBIw4IDrSfFHik4",
      name: "Daze",
      rank: 0,
    },
    {
      id: "spell:R8bqnYiThB6MYTxD",
      name: "Phantom Pain",
      rank: 1,
    },
    {
      id: "spell:CQb8HtQ1BPeZmu9h",
      name: "Stupefy",
      rank: 2,
    },
    {
      id: "spell:N1Z1oLPdBxaSgrEE",
      name: "Vampiric Feast",
      rank: 3,
    },
    {
      id: "spell:LiGbewa9pO0yjbsY",
      name: "Confusion",
      rank: 4,
    },
    {
      id: "spell:xFp4EwVcYwSG336t",
      name: "Slither",
      rank: 5,
    },
    {
      id: "spell:5BbU1V6wGSGbrmRD",
      name: "Never Mind",
      rank: 6,
    },
    {
      id: "spell:8kJbiBEjMWG4VUjs",
      name: "Warp Mind",
      rank: 7,
    },
    {
      id: "spell:Jvyy6oVIQsD34MHB",
      name: "Uncontrollable Dance",
      rank: 8,
    },
    {
      id: "spell:FmNDwqMEjeTEGPrY",
      name: "Unfathomable Song",
      rank: 9,
    },
  ],
  "cf:TFihgf3jDhmKd0fa": [
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:aAbfKn8maGjJjk2W",
      name: "Mystic Armor",
      rank: 1,
    },
    {
      id: "spell:WPu3UE3kTXSLqO40",
      name: "Spiritual Armament",
      rank: 2,
    },
    {
      id: "spell:KqvqNAfGIE5a9wSv",
      name: "Heroism",
      rank: 3,
    },
    {
      id: "spell:gfKhtVsXF3HKSdmY",
      name: "Seal Fate",
      rank: 4,
    },
    {
      id: "spell:hghGRzOSzEl4UXdS",
      name: "Invoke Spirits",
      rank: 5,
    },
    {
      id: "spell:NhGXgmI3AjkkwnPk",
      name: "Blinding Fury",
      rank: 6,
    },
    {
      id: "spell:Z9OrRXKgAPv6Hn5l",
      name: "Execute",
      rank: 7,
    },
    {
      id: "spell:Ht35SDf9PDStJfoC",
      name: "Spirit Song",
      rank: 8,
    },
    {
      id: "spell:10VcmSYNBrvBphu1",
      name: "Massacre",
      rank: 9,
    },
  ],
  "cf:vhW3glAaEfq2DKrw": [
    {
      id: "spell:WBmvzNDfpwka3qT4",
      name: "Light",
      rank: 0,
    },
    {
      id: "spell:rfZpqmj0AIIdkVIs",
      name: "Heal",
      rank: 1,
    },
    {
      id: "spell:WPu3UE3kTXSLqO40",
      name: "Spiritual Armament",
      rank: 2,
    },
    {
      id: "spell:DyiD239dNS7RIxZE",
      name: "Holy Light",
      rank: 3,
    },
    {
      id: "spell:hVU9msO9yGkxKZ3J",
      name: "Divine Wrath",
      rank: 4,
    },
    {
      id: "spell:A16eFTRh82xIjMu8",
      name: "Divine Immolation",
      rank: 5,
    },
    {
      id: "spell:jj5d830iUi2ZlQfs",
      name: "Blessed Boundary",
      rank: 6,
    },
    {
      id: "spell:sX2o0HH4RjJDAZ8C",
      name: "Divine Decree",
      rank: 7,
    },
    {
      id: "spell:4MOew29Z1oCX8O28",
      name: "Moment of Renewal",
      rank: 8,
    },
    {
      id: "spell:qsNeG9KZpODSACMq",
      name: "Foresight",
      rank: 9,
    },
  ],
  "cf:w5koctOVrEcpxTIq": [
    {
      id: "spell:thAHF1zxNplLCJPO",
      name: "Caustic Blast",
      rank: 0,
    },
    {
      id: "spell:4koZzrnMXhhosn0D",
      name: "Fear",
      rank: 1,
    },
    {
      id: "spell:wzctak6BxOW8xvFV",
      name: "Enlarge",
      rank: 2,
    },
    {
      id: "spell:WsUwpfmhKrKwoIe3",
      name: "Slow",
      rank: 3,
    },
    {
      id: "spell:hVU9msO9yGkxKZ3J",
      name: "Divine Wrath",
      rank: 4,
    },
    {
      id: "spell:59NR1hA2jPSgg2sW",
      name: "Blister",
      rank: 5,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:sX2o0HH4RjJDAZ8C",
      name: "Divine Decree",
      rank: 7,
    },
    {
      id: "spell:qlxM7Ik3uUeUIOcv",
      name: "Canticle of Everlasting Grief",
      rank: 8,
    },
    {
      id: "spell:4WS7HrFjwNvTn8T2",
      name: "Implosion",
      rank: 9,
    },
  ],
  "cf:o39zQMIdERWtmBSB": [
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:2ZdHjnpEQJuqOYSG",
      name: "Floating Flame",
      rank: 2,
    },
    {
      id: "spell:IihxWhRfpsBgQ5jS",
      name: "Enthrall",
      rank: 3,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:GaRQlC9Yw1BGKHfN",
      name: "Wave of Despair",
      rank: 5,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:sX2o0HH4RjJDAZ8C",
      name: "Divine Decree",
      rank: 7,
    },
    {
      id: "spell:KtTGLbLG9nqMbUYL",
      name: "Divine Inspiration",
      rank: 8,
    },
    {
      id: "spell:jrBa9deU2ULFWvSl",
      name: "Falling Stars",
      rank: 9,
    },
  ],
  "cf:ZHabYxSgYK0XbjhM": [
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:4koZzrnMXhhosn0D",
      name: "Fear",
      rank: 1,
    },
    {
      id: "spell:o6YCGx4lycsYpww4",
      name: "Haste",
      rank: 3,
    },
    {
      id: "spell:A2JfEKe6BZcTG1S8",
      name: "Fly",
      rank: 4,
    },
    {
      id: "spell:5c692cCcTDXjSEzk",
      name: "Dragon Form",
      rank: 6,
    },
    {
      id: "spell:O6VQC1Bs4aSYDa6R",
      name: "Mask of Terror",
      rank: 7,
    },
    {
      id: "spell:fkDeKktdmbeplYRY",
      name: "Overwhelming Presence",
      rank: 9,
    },
  ],
  "cf:RXRnJcG4XSabZ35a": [
    {
      id: "spell:Fr58LDSrbndgld9n",
      name: "Resist Energy",
      rank: 2,
    },
    {
      id: "spell:aqRYNoSvxsVfqglH",
      name: "Unfettered Movement",
      rank: 4,
    },
    {
      id: "spell:1K6AYGisvo9gqdhs",
      name: "Elemental Form",
      rank: 5,
    },
    {
      id: "spell:m2xFMNyQiUKQDRaj",
      name: "Energy Aegis",
      rank: 7,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
    {
      id: "spell:yLJROsQtyrPIKcDx",
      name: "Wrathful Storm",
      rank: 9,
    },
  ],
  "cf:eW3cfCH7Wpx2vik2": [
    {
      id: "spell:0zU8CPejjQFnhZFI",
      name: "Figment",
      rank: 0,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:tlSE7Ly8vi1Dgddv",
      name: "Laughing Fit",
      rank: 2,
    },
    {
      id: "spell:IihxWhRfpsBgQ5jS",
      name: "Enthrall",
      rank: 3,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:U58aQWJ47VrI36yP",
      name: "Hallucination",
      rank: 5,
    },
    {
      id: "spell:WPXzPl7YbMEIGWfi",
      name: "Mislead",
      rank: 6,
    },
    {
      id: "spell:jBGAYmR0BkkbpJvG",
      name: "Visions of Danger",
      rank: 7,
    },
    {
      id: "spell:Jvyy6oVIQsD34MHB",
      name: "Uncontrollable Dance",
      rank: 8,
    },
    {
      id: "spell:pswdik31kuHEvdno",
      name: "Metamorphosis",
      rank: 9,
    },
  ],
  "cf:tYOMBiH3HbViNWwn": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:i35dpZFI7jZcRoBo",
      name: "Illusory Disguise",
      rank: 1,
    },
    {
      id: "spell:IihxWhRfpsBgQ5jS",
      name: "Enthrall",
      rank: 3,
    },
    {
      id: "spell:TUj8eugNqAvB1vVR",
      name: "Creation",
      rank: 4,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:m2xFMNyQiUKQDRaj",
      name: "Energy Aegis",
      rank: 7,
    },
    {
      id: "spell:KPDHmmjJiw7PhTYF",
      name: "Resplendent Mansion",
      rank: 9,
    },
  ],
  "cf:O0uXZRWMNliDbkxU": [
    {
      id: "spell:4gBIw4IDrSfFHik4",
      name: "Daze",
      rank: 0,
    },
    {
      id: "spell:i35dpZFI7jZcRoBo",
      name: "Illusory Disguise",
      rank: 1,
    },
    {
      id: "spell:CQb8HtQ1BPeZmu9h",
      name: "Stupefy",
      rank: 2,
    },
    {
      id: "spell:VosLNn2M8S7JH67D",
      name: "Blindness",
      rank: 3,
    },
    {
      id: "spell:KSAEhNfZyXMO7Z7V",
      name: "Outcast's Curse",
      rank: 4,
    },
    {
      id: "spell:z2mfh3oPnfYqXflY",
      name: "Mariner's Curse",
      rank: 5,
    },
    {
      id: "spell:dN8QBNuTiaBHCKUe",
      name: "Cursed Metamorphosis",
      rank: 6,
    },
    {
      id: "spell:8kJbiBEjMWG4VUjs",
      name: "Warp Mind",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:MJx7DmjsWYzDZ3a4",
      name: "Phantasmagoria",
      rank: 9,
    },
  ],
  "cf:b6hyZTs1rVGHDexz": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:6ZIKB0151LUR19Rw",
      name: "Ill Omen",
      rank: 1,
    },
    {
      id: "spell:41TZEjhO6D1nWw2X",
      name: "Augury",
      rank: 2,
    },
    {
      id: "spell:ppA1StEigPLKEQqR",
      name: "Wanderer's Guide",
      rank: 3,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:tcwT97RWKxsJiefG",
      name: "Shadow Siphon",
      rank: 5,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:qDjeG6dxT4aEEC6J",
      name: "Weird",
      rank: 9,
    },
  ],
  "cf:ZEtJJ5UOlV5oTWWp": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:gKKqvLohtrSJj3BM",
      name: "Force Barrage",
      rank: 1,
    },
    {
      id: "spell:9HpwDN4MYQJnW0LG",
      name: "Dispel Magic",
      rank: 2,
    },
    {
      id: "spell:o6YCGx4lycsYpww4",
      name: "Haste",
      rank: 3,
    },
    {
      id: "spell:VlNcjmYyu95vOUe8",
      name: "Translocate",
      rank: 4,
    },
    {
      id: "spell:Ek5XI0aEdZhBgm21",
      name: "Scouting Eye",
      rank: 5,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:4WS7HrFjwNvTn8T2",
      name: "Implosion",
      rank: 9,
    },
  ],
  "cf:5Wxjghw7lHuCxjZz": [
    {
      id: "spell:uZK2BYzPnxUBnDjr",
      name: "Tangle Vine",
      rank: 0,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:b515AZlB0sridKSq",
      name: "Calm",
      rank: 2,
    },
    {
      id: "spell:1HfusQ8NDWutGvMx",
      name: "Animal Vision",
      rank: 3,
    },
    {
      id: "spell:ikSb3LRGnrwXJBVX",
      name: "Vital Beacon",
      rank: 4,
    },
    {
      id: "spell:GaRQlC9Yw1BGKHfN",
      name: "Wave of Despair",
      rank: 5,
    },
    {
      id: "spell:yrZA4k2VAqEP8xx7",
      name: "Repulsion",
      rank: 6,
    },
    {
      id: "spell:bVtkBJvGLP69qVGI",
      name: "Unfettered Pack",
      rank: 7,
    },
    {
      id: "spell:4MOew29Z1oCX8O28",
      name: "Moment of Renewal",
      rank: 8,
    },
    {
      id: "spell:fkDeKktdmbeplYRY",
      name: "Overwhelming Presence",
      rank: 9,
    },
  ],
  "cf:TWR1wbPJuCLnGdFZ": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
    {
      id: "spell:SUKaxVZW2TlM8lu0",
      name: "Cleanse Affliction",
      rank: 4,
    },
    {
      id: "spell:Hnc7eGi7vyZenAIm",
      name: "Breath of Life",
      rank: 5,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:WG91Z5TiR6oO5FOw",
      name: "Contingency",
      rank: 7,
    },
    {
      id: "spell:4MOew29Z1oCX8O28",
      name: "Moment of Renewal",
      rank: 8,
    },
    {
      id: "spell:jrBa9deU2ULFWvSl",
      name: "Falling Stars",
      rank: 9,
    },
  ],
  "cf:PpzH9tJULk5ksX9w": [
    {
      id: "spell:kcelf6IHl3L9VXXg",
      name: "Vitality Lash",
      rank: 0,
    },
    {
      id: "spell:rfZpqmj0AIIdkVIs",
      name: "Heal",
      rank: 1,
    },
    {
      id: "spell:b515AZlB0sridKSq",
      name: "Calm",
      rank: 2,
    },
    {
      id: "spell:DyiD239dNS7RIxZE",
      name: "Holy Light",
      rank: 3,
    },
    {
      id: "spell:ksLCg62cLOojw3gN",
      name: "Planar Tether",
      rank: 4,
    },
    {
      id: "spell:YvXKGlHOt7mdW2jZ",
      name: "Death Ward",
      rank: 5,
    },
    {
      id: "spell:PHVHBbdHeQRfjLmE",
      name: "Spirit Blast",
      rank: 6,
    },
    {
      id: "spell:Z9OrRXKgAPv6Hn5l",
      name: "Execute",
      rank: 7,
    },
    {
      id: "spell:Ht35SDf9PDStJfoC",
      name: "Spirit Song",
      rank: 8,
    },
    {
      id: "spell:10VcmSYNBrvBphu1",
      name: "Massacre",
      rank: 9,
    },
  ],
  "cf:uoQOm41BVdSo6pAS": [
    {
      id: "spell:mAMEt4FFbdqoRnkN",
      name: "Void Warp",
      rank: 0,
    },
    {
      id: "spell:k34hDOfIIMAxNL4a",
      name: "Grim Tendrils",
      rank: 1,
    },
    {
      id: "spell:4GE2ZdODgIQtg51c",
      name: "Darkness",
      rank: 2,
    },
    {
      id: "spell:sRfSBHWHdbIa0aGc",
      name: "Chilling Darkness",
      rank: 3,
    },
    {
      id: "spell:tlcrVRqW1MSKJ5IC",
      name: "Phantasmal Killer",
      rank: 4,
    },
    {
      id: "spell:tcwT97RWKxsJiefG",
      name: "Shadow Siphon",
      rank: 5,
    },
    {
      id: "spell:c3XygMbzrZMgV1y3",
      name: "Collective Transposition",
      rank: 6,
    },
    {
      id: "spell:73rToy0v5Ra9NvL6",
      name: "Duplicate Foe",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:qDjeG6dxT4aEEC6J",
      name: "Weird",
      rank: 9,
    },
  ],
  "cf:7WBZ2kkhZ7JorWu2": [
    {
      id: "spell:mAMEt4FFbdqoRnkN",
      name: "Void Warp",
      rank: 0,
    },
    {
      id: "spell:wdA52JJnsuQWeyqz",
      name: "Harm",
      rank: 1,
    },
    {
      id: "spell:GUeRTriJkMlMlVrk",
      name: "Bind Undead",
      rank: 3,
    },
    {
      id: "spell:FM3SmEW8N1FCRjqt",
      name: "Talking Corpse",
      rank: 4,
    },
    {
      id: "spell:hghGRzOSzEl4UXdS",
      name: "Invoke Spirits",
      rank: 5,
    },
    {
      id: "spell:fd31tAHSSGXyOxW6",
      name: "Vampiric Exsanguination",
      rank: 6,
    },
    {
      id: "spell:Z9OrRXKgAPv6Hn5l",
      name: "Execute",
      rank: 7,
    },
    {
      id: "spell:qlxM7Ik3uUeUIOcv",
      name: "Canticle of Everlasting Grief",
      rank: 8,
    },
    {
      id: "spell:FEsuyf203wTNE2et",
      name: "Wails of the Damned",
      rank: 9,
    },
  ],
  "cf:dKTb959aCQIzSIXj": [
    {
      id: "spell:OhD2Z6rIGGD5ocZA",
      name: "Read Aura",
      rank: 0,
    },
    {
      id: "spell:aAbfKn8maGjJjk2W",
      name: "Mystic Armor",
      rank: 1,
    },
    {
      id: "spell:Fr58LDSrbndgld9n",
      name: "Resist Energy",
      rank: 2,
    },
    {
      id: "spell:o6YCGx4lycsYpww4",
      name: "Haste",
      rank: 3,
    },
    {
      id: "spell:Mv5L4201uk8hnAtD",
      name: "Reflective Scales",
      rank: 4,
    },
    {
      id: "spell:TCk2MDwf5L5OYjFC",
      name: "Cloak of Colors",
      rank: 5,
    },
    {
      id: "spell:yrZA4k2VAqEP8xx7",
      name: "Repulsion",
      rank: 6,
    },
    {
      id: "spell:O6VQC1Bs4aSYDa6R",
      name: "Mask of Terror",
      rank: 7,
    },
    {
      id: "spell:KtTGLbLG9nqMbUYL",
      name: "Divine Inspiration",
      rank: 8,
    },
    {
      id: "spell:fkDeKktdmbeplYRY",
      name: "Overwhelming Presence",
      rank: 9,
    },
  ],
};

export const SORCERER_BLOODLINE_FOCUS: Record<string, ClassFocusData> = {
  "cf:3qqvnC2U8W26yae7": {
    name: "Aberrant",
    initial: {
      id: "spell:i8PBZsnoCrK7IWph",
      name: "Tentacular Limbs",
    },
    advanced: {
      id: "spell:qhJfRnkCRrMI4G1O",
      name: "Aberrant Whispers",
    },
    greater: {
      id: "spell:ddKBoCjmSyPSHcws",
      name: "Unusual Anatomy",
    },
  },
  "cf:TFihgf3jDhmKd0fa": {
    name: "Aesir",
    initial: {
      id: "spell:dQ7LrD2HxJoCzi2M",
      name: "Barbed Spear",
    },
    advanced: {
      id: "spell:9ZwpT9RDwCxhYQXd",
      name: "Wings of the Valkyrie",
    },
    greater: {
      id: "spell:USKnG2ZSzVs4xn85",
      name: "Let Not the Fallen Rest",
    },
  },
  "cf:vhW3glAaEfq2DKrw": {
    name: "Angelic",
    initial: {
      id: "spell:w3uGXDVEdbLFZVO0",
      name: "Angelic Halo",
    },
    advanced: {
      id: "spell:kRsmUlSWhi6PJvZ7",
      name: "Angelic Wings",
    },
    greater: {
      id: "spell:9WlTR9JlEcjRmGiD",
      name: "Celestial Brand",
    },
  },
  "cf:w5koctOVrEcpxTIq": {
    name: "Demonic",
    initial: {
      id: "spell:SdXFiQ4Py8761sNO",
      name: "Glutton's Jaws",
    },
    advanced: {
      id: "spell:iQD8OhhkwhvD8Blw",
      name: "Swamp of Sloth",
    },
    greater: {
      id: "spell:crF4g9jRN1y84MSD",
      name: "Chthonian Wrath",
    },
  },
  "cf:o39zQMIdERWtmBSB": {
    name: "Diabolic",
    initial: {
      id: "spell:Vctwx1ewa8HUOA94",
      name: "Diabolic Edict",
    },
    advanced: {
      id: "spell:ilGsyGLGjjIPHbyP",
      name: "Embrace the Pit",
    },
    greater: {
      id: "spell:9LHr9SuDLTicdbXs",
      name: "Hellfire Plume",
    },
  },
  "cf:ZHabYxSgYK0XbjhM": {
    name: "Draconic",
    initial: {
      id: "spell:K8vvrOgW4bGakXxm",
      name: "Flurry of Claws",
    },
    advanced: {
      id: "spell:JcobNl4iE9HmMYtE",
      name: "Dragon Breath",
    },
    greater: {
      id: "spell:HWJODX2zPg5cg34F",
      name: "Dragon Wings",
    },
  },
  "cf:RXRnJcG4XSabZ35a": {
    name: "Elemental",
    initial: {
      id: "spell:0JUOgbbFCapp3HlW",
      name: "Elemental Toss",
    },
    advanced: {
      id: "spell:B8aCUMCHCIMUCEVK",
      name: "Elemental Motion",
    },
    greater: {
      id: "spell:Qlp8G3knwLGhAxQ0",
      name: "Elemental Blast",
    },
  },
  "cf:eW3cfCH7Wpx2vik2": {
    name: "Fey",
    initial: {
      id: "spell:IkS3lDGUpIOMug7v",
      name: "Faerie Dust",
    },
    advanced: {
      id: "spell:mBojKJatf9PTYC38",
      name: "Fey Disappearance",
    },
    greater: {
      id: "spell:DdXKfIjDtORUtUvY",
      name: "Fey Glamour",
    },
  },
  "cf:tYOMBiH3HbViNWwn": {
    name: "Genie",
    initial: {
      id: "spell:OyiKIbWllLZC6sGz",
      name: "Genie's Veil",
    },
    advanced: {
      id: "spell:PVXqMko4yGgw90uo",
      name: "Heart's Desire",
    },
    greater: {
      id: "spell:B3tbO85GBpzQ3u8l",
      name: "Wish-Twisted Form",
    },
  },
  "cf:O0uXZRWMNliDbkxU": {
    name: "Hag",
    initial: {
      id: "spell:kvm68hVtmADiIvN4",
      name: "Jealous Hex",
    },
    advanced: {
      id: "spell:aZg3amDcrXz3cLCz",
      name: "Horrific Visage",
    },
    greater: {
      id: "spell:x2LALaHXO7644GQA",
      name: "You're Mine",
    },
  },
  "cf:b6hyZTs1rVGHDexz": {
    name: "Harrow",
    initial: {
      id: "spell:PaHxcqXihXkkXPsB",
      name: "Unraveling Blast",
    },
    advanced: {
      id: "spell:82gDiXTKsCmdIF6Q",
      name: "Invoke the Harrow",
    },
    greater: {
      id: "spell:BAu5AgqoO556clyK",
      name: "Rewrite Possibility",
    },
  },
  "cf:ZEtJJ5UOlV5oTWWp": {
    name: "Imperial",
    initial: {
      id: "spell:dtOUkMC57izf93z5",
      name: "Ancestral Memories",
    },
  },
  "cf:5Wxjghw7lHuCxjZz": {
    name: "Nymph",
    initial: {
      id: "spell:pHrVvoTKygXeczVG",
      name: "Nymph's Token",
    },
    advanced: {
      id: "spell:Q56HLIHVKY6bC5W3",
      name: "Blinding Beauty",
    },
    greater: {
      id: "spell:XlQBVvlDWGrGlApl",
      name: "Establish Ward",
    },
  },
  "cf:TWR1wbPJuCLnGdFZ": {
    name: "Phoenix",
    initial: {
      id: "spell:lZx8jZfKrMEtyGY0",
      name: "Rejuvenating Flames",
    },
    advanced: {
      id: "spell:Q1OWufw6dUiY8yEI",
      name: "Shroud of Flame",
    },
    greater: {
      id: "spell:tf4PMMMzR5xxJDun",
      name: "Cleansing Flames",
    },
  },
  "cf:PpzH9tJULk5ksX9w": {
    name: "Psychopomp",
    initial: {
      id: "spell:3mINzPzup2m9qzFU",
      name: "Sepulchral Mask",
    },
    advanced: {
      id: "spell:pQ3NIzZXeIIcU81C",
      name: "Spirit Veil",
    },
    greater: {
      id: "spell:SzKkzq3Rr6vKIxbp",
      name: "Shepherd of Souls",
    },
  },
  "cf:uoQOm41BVdSo6pAS": {
    name: "Shadow",
    initial: {
      id: "spell:6UafOE1ZUbHamsZJ",
      name: "Dim the Light",
    },
    advanced: {
      id: "spell:0chL1b4OFIZxpN3v",
      name: "Steal Shadow",
    },
    greater: {
      id: "spell:HMTloW1hvRFJ5Z2D",
      name: "Consuming Darkness",
    },
  },
  "cf:7WBZ2kkhZ7JorWu2": {
    name: "Undead",
    initial: {
      id: "spell:FedTjedva2rYk33r",
      name: "Undeath's Blessing",
    },
    advanced: {
      id: "spell:cqdmSmQnM0q6wbWG",
      name: "Drain Life",
    },
    greater: {
      id: "spell:2YIr0S2Gt14PMMQp",
      name: "Grasping Grave",
    },
  },
  "cf:dKTb959aCQIzSIXj": {
    name: "Wyrmblessed",
    initial: {
      id: "spell:K8vvrOgW4bGakXxm",
      name: "Flurry of Claws",
    },
    advanced: {
      id: "spell:JcobNl4iE9HmMYtE",
      name: "Dragon Breath",
    },
    greater: {
      id: "spell:HWJODX2zPg5cg34F",
      name: "Dragon Wings",
    },
  },
};

export const SORCERER_ELEMENT_GIFTS: Record<string, ClassSpellData[]> = {
  air: [
    {
      id: "spell:dDiOnjcsBFbAvP6t",
      name: "Gale Blast",
      rank: 0,
    },
    {
      id: "spell:KcLVELhCUcKXxiKE",
      name: "Tailwind",
      rank: 1,
    },
    {
      id: "spell:it4ZsAi6XgvGcodc",
      name: "Wall of Wind",
      rank: 3,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
  ],
  earth: [
    {
      id: "spell:zA0jNIBRgLsyTpbm",
      name: "Scatter Scree",
      rank: 0,
    },
    {
      id: "spell:Rn2LkoSq1XhLsODV",
      name: "Pummeling Rubble",
      rank: 1,
    },
    {
      id: "spell:gPvtmKMRpg9I9D7H",
      name: "Earthbind",
      rank: 3,
    },
    {
      id: "spell:znv4ECL7ZtuiagtA",
      name: "Petrify",
      rank: 6,
    },
  ],
  fire: [
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
    {
      id: "spell:u5FAOOXuqK7fLqKW",
      name: "Tree of Seasons",
      rank: 6,
    },
  ],
  metal: [
    {
      id: "spell:kBhaPuzLUSwS6vVf",
      name: "Electric Arc",
      rank: 0,
    },
    {
      id: "spell:zDJS8E66UI0himqV",
      name: "Thunderstrike",
      rank: 1,
    },
    {
      id: "spell:9AAkVUCwF6WVNNY2",
      name: "Lightning Bolt",
      rank: 3,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
  ],
  water: [
    {
      id: "spell:IxhGEKl63R4QBvkj",
      name: "Frostbite",
      rank: 0,
    },
    {
      id: "spell:jfVCuOpzC6mUrf6f",
      name: "Hydraulic Push",
      rank: 1,
    },
    {
      id: "spell:oUDNCArkQTdhllxD",
      name: "Aqueous Orb",
      rank: 3,
    },
    {
      id: "spell:9W2Qv0wXLg6tQg3y",
      name: "Scintillating Safeguard",
      rank: 6,
    },
  ],
  wood: [
    {
      id: "spell:uZK2BYzPnxUBnDjr",
      name: "Tangle Vine",
      rank: 0,
    },
    {
      id: "spell:qXTB7Ec9yYh5JPPV",
      name: "Cleanse Cuisine",
      rank: 1,
    },
    {
      id: "spell:KsWhliKfUs3IpW3c",
      name: "Wall of Thorns",
      rank: 3,
    },
    {
      id: "spell:JbAcSLu62TU1OgNF",
      name: "Tangling Creepers",
      rank: 6,
    },
  ],
};

export const SORCERER_GENIE_GIFTS: Record<string, ClassSpellData[]> = {
  janni: [
    {
      id: "spell:Mt6ZzkVX8Q4xigFq",
      name: "Create Food",
      rank: 2,
    },
    {
      id: "spell:bay4AfSu2iIozNNW",
      name: "Banishment",
      rank: 5,
    },
    {
      id: "spell:uEyfLoFQsRKBRIcB",
      name: "Confusing Colors",
      rank: 8,
    },
  ],
  jaathoom: [
    {
      id: "spell:XXqE1eY3w3z6xJCB",
      name: "Invisibility",
      rank: 2,
    },
    {
      id: "spell:Ucf8eynbZMfUucjE",
      name: "Illusory Scene",
      rank: 5,
    },
    {
      id: "spell:wi405lBjPcbF1DeR",
      name: "Punishing Winds",
      rank: 8,
    },
  ],
  ifrit: [
    {
      id: "spell:wzctak6BxOW8xvFV",
      name: "Enlarge",
      rank: 2,
    },
    {
      id: "spell:1K6AYGisvo9gqdhs",
      name: "Elemental Form",
      rank: 5,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
  ],
  faydhaan: [
    {
      id: "spell:Seaah9amXg70RKw2",
      name: "Water Walk",
      rank: 2,
    },
    {
      id: "spell:zfn5RqAdF63neqpP",
      name: "Control Water",
      rank: 5,
    },
    {
      id: "spell:M0jQlpQYUr0pp2Sv",
      name: "Desiccate",
      rank: 8,
    },
  ],
  jabali: [
    {
      id: "spell:0qaqksrGGDj74HXE",
      name: "Revealing Light",
      rank: 2,
    },
    {
      id: "spell:kOa055FIrO9Smnya",
      name: "Wall of Stone",
      rank: 5,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
  ],
};

export const SORCERER_DRACONIC_GIFTS: Record<string, ClassSpellData[]> = {
  arcane: [
    {
      id: "spell:ZxHC7V7HtjUsB8zH",
      name: "Blazing Bolt",
      rank: 2,
    },
    {
      id: "spell:GP3wewkQXEPrLxYj",
      name: "Subconscious Suggestion",
      rank: 5,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
  ],
  divine: [
    {
      id: "spell:41TZEjhO6D1nWw2X",
      name: "Augury",
      rank: 2,
    },
    {
      id: "spell:A16eFTRh82xIjMu8",
      name: "Divine Immolation",
      rank: 5,
    },
    {
      id: "spell:KtTGLbLG9nqMbUYL",
      name: "Divine Inspiration",
      rank: 8,
    },
  ],
  occult: [
    {
      id: "spell:TaaMEYdZXQXF0Sks",
      name: "Blood Vendetta",
      rank: 2,
    },
    {
      id: "spell:xFp4EwVcYwSG336t",
      name: "Slither",
      rank: 5,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
  ],
  primal: [
    {
      id: "spell:1xbFBQDRs0hT5xZ9",
      name: "Shatter",
      rank: 2,
    },
    {
      id: "spell:xxWhyl81w3ckslAU",
      name: "Howling Blizzard",
      rank: 5,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
  ],
};

export const ORACLE_MYSTERY_SPELLS: Record<string, ClassSpellData[]> = {
  "cf:qvRlih3u7vK3FYUR": [
    {
      id: "spell:izcxFQFwf3woCnFs",
      name: "Guidance",
      rank: 0,
    },
    {
      id: "spell:6ZIKB0151LUR19Rw",
      name: "Ill Omen",
      rank: 1,
    },
    {
      id: "spell:rthC6dGm3nNrt1xN",
      name: "Ghostly Carrier",
      rank: 2,
    },
    {
      id: "spell:y0Vy7iNL3ET8K00C",
      name: "Dreaming Potential",
      rank: 5,
    },
  ],
  "cf:g3HTg0z3doXZZzAV": [
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:9XHmC2JgTUIQ1CCm",
      name: "Mist",
      rank: 2,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
  ],
  "cf:gjOGOR30Czpnx3tM": [
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:Gb7SeieEvd0pL2Eh",
      name: "Sure Strike",
      rank: 1,
    },
    {
      id: "spell:mrDi3v933gsmnw25",
      name: "Telekinetic Maneuver",
      rank: 2,
    },
    {
      id: "spell:8M03UxGXjYyDFAoy",
      name: "Weapon Storm",
      rank: 4,
    },
  ],
  "cf:1PHDn7WJFtR3NgTr": [
    {
      id: "spell:thAHF1zxNplLCJPO",
      name: "Caustic Blast",
      rank: 0,
    },
    {
      id: "spell:1meVElIu1CEVYWkv",
      name: "Noxious Vapors",
      rank: 1,
    },
    {
      id: "spell:3VxVbZqIRvpKkg3O",
      name: "Fungal Infestation",
      rank: 2,
    },
    {
      id: "spell:MlpbeZ61Euhl0d60",
      name: "Toxic Cloud",
      rank: 5,
    },
  ],
  "cf:IaxmCkdsPlA52spu": [
    {
      id: "spell:mAMEt4FFbdqoRnkN",
      name: "Void Warp",
      rank: 0,
    },
    {
      id: "spell:k34hDOfIIMAxNL4a",
      name: "Grim Tendrils",
      rank: 1,
    },
    {
      id: "spell:8ViwItUgwT4lOvvb",
      name: "False Vitality",
      rank: 2,
    },
    {
      id: "spell:AMEu5zzLN7uCX645",
      name: "Ghostly Weapon",
      rank: 3,
    },
  ],
  "cf:RI2EMRBBPNSoTJXu": [
    {
      id: "spell:WBmvzNDfpwka3qT4",
      name: "Light",
      rank: 0,
    },
    {
      id: "spell:UKsIOWmMx4hSpafl",
      name: "Dizzying Colors",
      rank: 1,
    },
    {
      id: "spell:4GE2ZdODgIQtg51c",
      name: "Darkness",
      rank: 2,
    },
    {
      id: "spell:YtesyvfAIwXOqISq",
      name: "Moon Frenzy",
      rank: 5,
    },
  ],
  "cf:GTSvbFb36InvuH0w": [
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:ZxHC7V7HtjUsB8zH",
      name: "Blazing Bolt",
      rank: 2,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
  ],
  "cf:o1gGG36wpn9mxeop": [
    {
      id: "spell:kcelf6IHl3L9VXXg",
      name: "Vitality Lash",
      rank: 0,
    },
    {
      id: "spell:szIyEsvihc5e1w8n",
      name: "Soothe",
      rank: 1,
    },
    {
      id: "spell:8ViwItUgwT4lOvvb",
      name: "False Vitality",
      rank: 2,
    },
    {
      id: "spell:d9sBzPOXX3KT8uTu",
      name: "Grisly Growths",
      rank: 5,
    },
  ],
  "cf:tZBb3Kh4nJcNoUFI": [
    {
      id: "spell:OhD2Z6rIGGD5ocZA",
      name: "Read Aura",
      rank: 0,
    },
    {
      id: "spell:D442XMADp01qJ7Cs",
      name: "Mindlink",
      rank: 1,
    },
    {
      id: "spell:ZYoC630tNGutgbE0",
      name: "Hypercognition",
      rank: 3,
    },
    {
      id: "spell:5BbU1V6wGSGbrmRD",
      name: "Never Mind",
      rank: 6,
    },
  ],
  "cf:W9cF7wZztLDb1WGY": [
    {
      id: "spell:kBhaPuzLUSwS6vVf",
      name: "Electric Arc",
      rank: 0,
    },
    {
      id: "spell:zDJS8E66UI0himqV",
      name: "Thunderstrike",
      rank: 1,
    },
    {
      id: "spell:Y3G6Y6EDgCY0s3fq",
      name: "Hydraulic Torrent",
      rank: 4,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
  ],
  "cf:EslxR2sbDK9XJaAl": [
    {
      id: "spell:BvNbDwFYaidKJG9j",
      name: "Time Sense",
      rank: 0,
    },
    {
      id: "spell:rerNA6YZsdxuJYt3",
      name: "Déjà Vu",
      rank: 1,
    },
    {
      id: "spell:0Rl3W7kiq9xVZRcr",
      name: "Time Pocket",
      rank: 3,
    },
    {
      id: "spell:G56DJkxlUjFv0C4Z",
      name: "Time Beacon",
      rank: 7,
    },
  ],
};

export const ORACLE_REVELATIONS: Record<string, ClassFocusData> = {
  "cf:qvRlih3u7vK3FYUR": {
    name: "Ancestors",
    initial: {
      id: "spell:d2pi7laQkzlr3wrS",
      name: "Ancestral Touch",
    },
    advanced: {
      id: "spell:J5KrjQKCg2PrF1vz",
      name: "Ancestral Defense",
    },
    greater: {
      id: "spell:xEjGEBvTfDJECSki",
      name: "Ancestral Form",
    },
  },
  "cf:g3HTg0z3doXZZzAV": {
    name: "Ashes",
    initial: {
      id: "spell:NtzNCW32UlPdY2xS",
      name: "Ashen Wind",
    },
    advanced: {
      id: "spell:OTd17oXwJH9qb1cS",
      name: "Incendiary Ashes",
    },
    greater: {
      id: "spell:2B0C22OuX9YrIJ5y",
      name: "Ash Form",
    },
  },
  "cf:gjOGOR30Czpnx3tM": {
    name: "Battle",
    initial: {
      id: "spell:RpGB961b8FjXbGHi",
      name: "Weapon Trance",
    },
    advanced: {
      id: "spell:2jWVNdVlbJq84dfT",
      name: "Battlefield Persistence",
    },
    greater: {
      id: "spell:Eed8QBWBtpufl1iP",
      name: "Revel in Retribution",
    },
  },
  "cf:1PHDn7WJFtR3NgTr": {
    name: "Blight",
    initial: {
      id: "spell:DnVTBGCsai6zqMwL",
      name: "Ulcerous Canker",
    },
    advanced: {
      id: "spell:CBPcGH1FFDG9vf4Z",
      name: "Purging Toxins",
    },
    greater: {
      id: "spell:rqoWAxQv4RWbwyAr",
      name: "Accelerated Decomposition",
    },
  },
  "cf:IaxmCkdsPlA52spu": {
    name: "Bones",
    initial: {
      id: "spell:D6T17BdazhNy3KPm",
      name: "Soul Siphon",
    },
    advanced: {
      id: "spell:pSNLufPPsReKQtJR",
      name: "Armor of Bones",
    },
    greater: {
      id: "spell:GzN9bG6cKZ96YC6l",
      name: "Claim Undead",
    },
  },
  "cf:RI2EMRBBPNSoTJXu": {
    name: "Cosmos",
    initial: {
      id: "spell:mlNYROcFrUF8nFgk",
      name: "Spray of Stars",
    },
    advanced: {
      id: "spell:L37RTc7K79OUpZ7X",
      name: "Interstellar Void",
    },
    greater: {
      id: "spell:In2A7GCyxxaqZdPI",
      name: "Moonlight Bridge",
    },
  },
  "cf:GTSvbFb36InvuH0w": {
    name: "Flames",
    initial: {
      id: "spell:AspA30tzKCHFWRf0",
      name: "Incendiary Aura",
    },
    advanced: {
      id: "spell:Wi2HcreCfujKiCvW",
      name: "Whirling Flames",
    },
    greater: {
      id: "spell:bynT1UKaDqr8dLNM",
      name: "Flaming Fusillade",
    },
  },
  "cf:o1gGG36wpn9mxeop": {
    name: "Life",
    initial: {
      id: "spell:2gQYrCPwBmwau26O",
      name: "Life Link",
    },
    advanced: {
      id: "spell:ziHDISWkFSwz3pmn",
      name: "Delay Affliction",
    },
    greater: {
      id: "spell:9kOI14Jep97TzGO7",
      name: "Life-Giving Form",
    },
  },
  "cf:tZBb3Kh4nJcNoUFI": {
    name: "Lore",
    initial: {
      id: "spell:k2QrUk7jWMAWozMh",
      name: "Brain Drain",
    },
    advanced: {
      id: "spell:LbPLNWlLCxKCo5gF",
      name: "Access Lore",
    },
    greater: {
      id: "spell:XULNb8ItUsfupxqH",
      name: "Dread Secret",
    },
  },
  "cf:W9cF7wZztLDb1WGY": {
    name: "Tempest",
    initial: {
      id: "spell:EzB9i7R6aBRAtJCh",
      name: "Tempest Touch",
    },
    advanced: {
      id: "spell:LFSwMtQVP05EzlZe",
      name: "Thunderburst",
    },
    greater: {
      id: "spell:zhqnMOVPzVvWSUbC",
      name: "Tempest Form",
    },
  },
  "cf:EslxR2sbDK9XJaAl": {
    name: "Time",
    initial: {
      id: "spell:UbHK19RYbxRXWgWX",
      name: "Temporal Distortion",
    },
    advanced: {
      id: "spell:LbqunTurwXB3u9Vp",
      name: "Time Skip",
    },
    greater: {
      id: "spell:MT8usUfwudDVUm5H",
      name: "Manifold Lives",
    },
  },
};

export const WIZARD_CURRICULUM_SPELLS: Record<string, ClassSpellData[]> = {
  "cf:srcPBNjhq7FBSmi3": [
    {
      id: "spell:0zU8CPejjQFnhZFI",
      name: "Figment",
      rank: 0,
    },
    {
      id: "spell:MPxbKoR54gkYkqLO",
      name: "Gouging Claw",
      rank: 0,
    },
    {
      id: "spell:aEM2cttJ2eYcLssW",
      name: "Fleet Step",
      rank: 1,
    },
    {
      id: "spell:i35dpZFI7jZcRoBo",
      name: "Illusory Disguise",
      rank: 1,
    },
    {
      id: "spell:Gb7SeieEvd0pL2Eh",
      name: "Sure Strike",
      rank: 1,
    },
    {
      id: "spell:XXqE1eY3w3z6xJCB",
      name: "Invisibility",
      rank: 2,
    },
    {
      id: "spell:9XHmC2JgTUIQ1CCm",
      name: "Mist",
      rank: 2,
    },
    {
      id: "spell:HXhWYJviWalN5tQ2",
      name: "Clairaudience",
      rank: 3,
    },
    {
      id: "spell:DCQHaLrYXMI37dvW",
      name: "Paralyze",
      rank: 3,
    },
    {
      id: "spell:zvKWclOZ7A53DObE",
      name: "Clairvoyance",
      rank: 4,
    },
    {
      id: "spell:VlNcjmYyu95vOUe8",
      name: "Translocate",
      rank: 4,
    },
    {
      id: "spell:U58aQWJ47VrI36yP",
      name: "Hallucination",
      rank: 5,
    },
    {
      id: "spell:Ucf8eynbZMfUucjE",
      name: "Illusory Scene",
      rank: 5,
    },
    {
      id: "spell:WPXzPl7YbMEIGWfi",
      name: "Mislead",
      rank: 6,
    },
    {
      id: "spell:0XP2XOxT9VSiXFDr",
      name: "Phantasmal Calamity",
      rank: 6,
    },
    {
      id: "spell:73rToy0v5Ra9NvL6",
      name: "Duplicate Foe",
      rank: 7,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:MJx7DmjsWYzDZ3a4",
      name: "Phantasmagoria",
      rank: 9,
    },
  ],
  "cf:HYTaibaCGE85rhbZ": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:AUctDF2fqPZN2w4W",
      name: "Sigil",
      rank: 0,
    },
    {
      id: "spell:aAbfKn8maGjJjk2W",
      name: "Mystic Armor",
      rank: 1,
    },
    {
      id: "spell:EE7Q5BHIrfWNCPtT",
      name: "Runic Body",
      rank: 1,
    },
    {
      id: "spell:TFitdEOpQC4SzKQQ",
      name: "Runic Weapon",
      rank: 1,
    },
    {
      id: "spell:Gb7SeieEvd0pL2Eh",
      name: "Sure Strike",
      rank: 1,
    },
    {
      id: "spell:pZTqGY1MLRjgKasV",
      name: "Darkvision",
      rank: 2,
    },
    {
      id: "spell:HXhWYJviWalN5tQ2",
      name: "Clairaudience",
      rank: 3,
    },
    {
      id: "spell:EoKBlgf6Smt8opaU",
      name: "Veil of Privacy",
      rank: 3,
    },
    {
      id: "spell:zvKWclOZ7A53DObE",
      name: "Clairvoyance",
      rank: 4,
    },
    {
      id: "spell:A2JfEKe6BZcTG1S8",
      name: "Fly",
      rank: 4,
    },
    {
      id: "spell:9BnhadUO8FMLmeZ3",
      name: "Mind Probe",
      rank: 5,
    },
    {
      id: "spell:R9xqCBblkS5KE4y7",
      name: "Sending",
      rank: 5,
    },
    {
      id: "spell:r784cIz17eWujtQj",
      name: "Scrying",
      rank: 6,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:WG91Z5TiR6oO5FOw",
      name: "Contingency",
      rank: 7,
    },
    {
      id: "spell:9igi8LcrNQKwljK7",
      name: "Spell Riposte",
      rank: 7,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:C2w3YfBKjIRS07DP",
      name: "Hidden Mind",
      rank: 8,
    },
    {
      id: "spell:qsNeG9KZpODSACMq",
      name: "Foresight",
      rank: 9,
    },
  ],
  "cf:wObrT6PytPdS5aUi": [
    {
      id: "spell:vLzFcIaSXs7YTIqJ",
      name: "Message",
      rank: 0,
    },
    {
      id: "spell:AUctDF2fqPZN2w4W",
      name: "Sigil",
      rank: 0,
    },
    {
      id: "spell:aIHY2DArKFweIrpf",
      name: "Command",
      rank: 1,
    },
    {
      id: "spell:PRrZ7anETWPm90YY",
      name: "Disguise Magic",
      rank: 1,
    },
    {
      id: "spell:EE7Q5BHIrfWNCPtT",
      name: "Runic Body",
      rank: 1,
    },
    {
      id: "spell:TFitdEOpQC4SzKQQ",
      name: "Runic Weapon",
      rank: 1,
    },
    {
      id: "spell:9HpwDN4MYQJnW0LG",
      name: "Dispel Magic",
      rank: 2,
    },
    {
      id: "spell:vTQvfYu2llKQedmY",
      name: "Translate",
      rank: 2,
    },
    {
      id: "spell:IihxWhRfpsBgQ5jS",
      name: "Enthrall",
      rank: 3,
    },
    {
      id: "spell:EoKBlgf6Smt8opaU",
      name: "Veil of Privacy",
      rank: 3,
    },
    {
      id: "spell:JOdOpbPDl7nqvJUm",
      name: "Dispelling Globe",
      rank: 4,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:R9xqCBblkS5KE4y7",
      name: "Sending",
      rank: 5,
    },
    {
      id: "spell:SwUiVavHKMWG7t5K",
      name: "Truespeech",
      rank: 5,
    },
    {
      id: "spell:yrZA4k2VAqEP8xx7",
      name: "Repulsion",
      rank: 6,
    },
    {
      id: "spell:8Umt1AzYfFbC4fui",
      name: "Spellwrack",
      rank: 6,
    },
    {
      id: "spell:WG91Z5TiR6oO5FOw",
      name: "Contingency",
      rank: 7,
    },
    {
      id: "spell:XZE4BawIlTf88Yl9",
      name: "Planar Seal",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:kUSShxXzY1sPtJA0",
      name: "Detonate Magic",
      rank: 9,
    },
  ],
  "cf:E4GZDMn4DYk6qSEV": [
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:60sgbuMWN0268dB7",
      name: "Telekinetic Projectile",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:gKKqvLohtrSJj3BM",
      name: "Force Barrage",
      rank: 1,
    },
    {
      id: "spell:aAbfKn8maGjJjk2W",
      name: "Mystic Armor",
      rank: 1,
    },
    {
      id: "spell:9XHmC2JgTUIQ1CCm",
      name: "Mist",
      rank: 2,
    },
    {
      id: "spell:Fr58LDSrbndgld9n",
      name: "Resist Energy",
      rank: 2,
    },
    {
      id: "spell:gPvtmKMRpg9I9D7H",
      name: "Earthbind",
      rank: 3,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
    {
      id: "spell:IarZrgCeaiUqOuRu",
      name: "Wall of Fire",
      rank: 4,
    },
    {
      id: "spell:8M03UxGXjYyDFAoy",
      name: "Weapon Storm",
      rank: 4,
    },
    {
      id: "spell:xxWhyl81w3ckslAU",
      name: "Howling Blizzard",
      rank: 5,
    },
    {
      id: "spell:oXeEbcUdgJGWHGEJ",
      name: "Impaling Spike",
      rank: 5,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:m2xFMNyQiUKQDRaj",
      name: "Energy Aegis",
      rank: 7,
    },
    {
      id: "spell:AlbpWWN87yGegoAF",
      name: "True Target",
      rank: 7,
    },
    {
      id: "spell:C2GYCH3TtUFqPfdX",
      name: "Arctic Rift",
      rank: 8,
    },
    {
      id: "spell:M0jQlpQYUr0pp2Sv",
      name: "Desiccate",
      rank: 8,
    },
    {
      id: "spell:jrBa9deU2ULFWvSl",
      name: "Falling Stars",
      rank: 9,
    },
  ],
  "cf:YZ2XPmx1WHyWtM0g": [
    {
      id: "spell:Qw3fnUlaUbnn7ipC",
      name: "Prestidigitation",
      rank: 0,
    },
    {
      id: "spell:OhD2Z6rIGGD5ocZA",
      name: "Read Aura",
      rank: 0,
    },
    {
      id: "spell:jfVCuOpzC6mUrf6f",
      name: "Hydraulic Push",
      rank: 1,
    },
    {
      id: "spell:Rn2LkoSq1XhLsODV",
      name: "Pummeling Rubble",
      rank: 1,
    },
    {
      id: "spell:lKcsmeOrgHtK4xQa",
      name: "Summon Construct",
      rank: 1,
    },
    {
      id: "spell:0qaqksrGGDj74HXE",
      name: "Revealing Light",
      rank: 2,
    },
    {
      id: "spell:Seaah9amXg70RKw2",
      name: "Water Walk",
      rank: 2,
    },
    {
      id: "spell:mwPfoYfVGSMAaUec",
      name: "Cozy Cabin",
      rank: 3,
    },
    {
      id: "spell:IFuEzfmmWyNwVbhY",
      name: "Safe Passage",
      rank: 3,
    },
    {
      id: "spell:TUj8eugNqAvB1vVR",
      name: "Creation",
      rank: 4,
    },
    {
      id: "spell:aqRYNoSvxsVfqglH",
      name: "Unfettered Movement",
      rank: 4,
    },
    {
      id: "spell:zfn5RqAdF63neqpP",
      name: "Control Water",
      rank: 5,
    },
    {
      id: "spell:kOa055FIrO9Smnya",
      name: "Wall of Stone",
      rank: 5,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:7Iela4GgVeO3LfAo",
      name: "Wall of Force",
      rank: 6,
    },
    {
      id: "spell:vPWMEyVTreMOoFnm",
      name: "Planar Palace",
      rank: 7,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
    {
      id: "spell:CeSh8QcVnqP5OlLj",
      name: "Pinpoint",
      rank: 8,
    },
    {
      id: "spell:qsNeG9KZpODSACMq",
      name: "Foresight",
      rank: 9,
    },
  ],
  "cf:a7yKDVnAYduaKIrL": [
    {
      id: "spell:vLzFcIaSXs7YTIqJ",
      name: "Message",
      rank: 0,
    },
    {
      id: "spell:eSL5hVT9gXrnRLtd",
      name: "Spout",
      rank: 0,
    },
    {
      id: "spell:g8QqHpv2CWDwmIm1",
      name: "Gust of Wind",
      rank: 1,
    },
    {
      id: "spell:jfVCuOpzC6mUrf6f",
      name: "Hydraulic Push",
      rank: 1,
    },
    {
      id: "spell:vUEkyqkjDwBDLMZZ",
      name: "Rude Awakening",
      rank: 1,
    },
    {
      id: "spell:MZGkMsPBztFN0pUO",
      name: "Water Breathing",
      rank: 2,
    },
    {
      id: "spell:Seaah9amXg70RKw2",
      name: "Water Walk",
      rank: 2,
    },
    {
      id: "spell:T4QKmtYPeCgYxVGe",
      name: "Crashing Wave",
      rank: 3,
    },
    {
      id: "spell:kHyjQbibRGPNCixx",
      name: "Ice Storm",
      rank: 4,
    },
    {
      id: "spell:HqTI6wRrck1YXp3F",
      name: "Telepathy",
      rank: 4,
    },
    {
      id: "spell:zfn5RqAdF63neqpP",
      name: "Control Water",
      rank: 5,
    },
    {
      id: "spell:QYWhY5q9zKTk10ru",
      name: "Searing Rain",
      rank: 5,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:m2xFMNyQiUKQDRaj",
      name: "Energy Aegis",
      rank: 7,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:C2GYCH3TtUFqPfdX",
      name: "Arctic Rift",
      rank: 8,
    },
    {
      id: "spell:M0jQlpQYUr0pp2Sv",
      name: "Desiccate",
      rank: 8,
    },
    {
      id: "spell:yLJROsQtyrPIKcDx",
      name: "Wrathful Storm",
      rank: 9,
    },
  ],
  "cf:XXnGHBxNZvRsdkKM": [
    {
      id: "spell:vLzFcIaSXs7YTIqJ",
      name: "Message",
      rank: 0,
    },
    {
      id: "spell:pwzdSlJgYqN7bs2w",
      name: "Telekinetic Hand",
      rank: 0,
    },
    {
      id: "spell:aEM2cttJ2eYcLssW",
      name: "Fleet Step",
      rank: 1,
    },
    {
      id: "spell:Azoh0BSoCASrA1lr",
      name: "Lock",
      rank: 1,
    },
    {
      id: "spell:qTr2oCgIXl703Whb",
      name: "Thoughtful Gift",
      rank: 1,
    },
    {
      id: "spell:6Ot4N22t5tPD51BO",
      name: "Knock",
      rank: 2,
    },
    {
      id: "spell:UtINSoEJ0u630ia4",
      name: "Warping Pull",
      rank: 2,
    },
    {
      id: "spell:LpMeT0CW1OEKdaQL",
      name: "Echo Jump",
      rank: 3,
    },
    {
      id: "spell:rSpGzCyYrTMiWQoG",
      name: "Trade Items",
      rank: 3,
    },
    {
      id: "spell:zR67Rt3UMHKC5evy",
      name: "Flicker",
      rank: 4,
    },
    {
      id: "spell:VlNcjmYyu95vOUe8",
      name: "Translocate",
      rank: 4,
    },
    {
      id: "spell:vM8oBYaEPgEXBimM",
      name: "King's Castle",
      rank: 5,
    },
    {
      id: "spell:115Xp9E38CJENhNS",
      name: "Magic Passage",
      rank: 5,
    },
    {
      id: "spell:c3XygMbzrZMgV1y3",
      name: "Collective Transposition",
      rank: 6,
    },
    {
      id: "spell:69L70wKfGDY66Mk9",
      name: "Teleport",
      rank: 6,
    },
    {
      id: "spell:5bTt2CvYHPvaR7QQ",
      name: "Interplanar Teleport",
      rank: 7,
    },
    {
      id: "spell:XZE4BawIlTf88Yl9",
      name: "Planar Seal",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:2DFtBRLyYMPrimp7",
      name: "Sudden Transposition",
      rank: 8,
    },
    {
      id: "spell:oKC36WjFD1jgqUN5",
      name: "Forest of Gates",
      rank: 9,
    },
  ],
  "cf:jtAqb5rnhQblZuM8": [
    {
      id: "spell:Qw3fnUlaUbnn7ipC",
      name: "Prestidigitation",
      rank: 0,
    },
    {
      id: "spell:OhD2Z6rIGGD5ocZA",
      name: "Read Aura",
      rank: 0,
    },
    {
      id: "spell:4WAib3GichxLjp5p",
      name: "Alarm",
      rank: 1,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:4ZGte0i9YbLh4dRi",
      name: "Item Facade",
      rank: 1,
    },
    {
      id: "spell:rthC6dGm3nNrt1xN",
      name: "Ghostly Carrier",
      rank: 2,
    },
    {
      id: "spell:XXqE1eY3w3z6xJCB",
      name: "Invisibility",
      rank: 2,
    },
    {
      id: "spell:HXhWYJviWalN5tQ2",
      name: "Clairaudience",
      rank: 3,
    },
    {
      id: "spell:EoKBlgf6Smt8opaU",
      name: "Veil of Privacy",
      rank: 3,
    },
    {
      id: "spell:KSAEhNfZyXMO7Z7V",
      name: "Outcast's Curse",
      rank: 4,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:PERUlvKPtF7dMzN4",
      name: "Imaginary Lockbox",
      rank: 5,
    },
    {
      id: "spell:GP3wewkQXEPrLxYj",
      name: "Subconscious Suggestion",
      rank: 5,
    },
    {
      id: "spell:yrZA4k2VAqEP8xx7",
      name: "Repulsion",
      rank: 6,
    },
    {
      id: "spell:r784cIz17eWujtQj",
      name: "Scrying",
      rank: 6,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:C2w3YfBKjIRS07DP",
      name: "Hidden Mind",
      rank: 8,
    },
    {
      id: "spell:KPDHmmjJiw7PhTYF",
      name: "Resplendent Mansion",
      rank: 9,
    },
  ],
  "cf:bCj5dSlq9VpjWXkU": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:AUctDF2fqPZN2w4W",
      name: "Sigil",
      rank: 0,
    },
    {
      id: "spell:PRrZ7anETWPm90YY",
      name: "Disguise Magic",
      rank: 1,
    },
    {
      id: "spell:i35dpZFI7jZcRoBo",
      name: "Illusory Disguise",
      rank: 1,
    },
    {
      id: "spell:D442XMADp01qJ7Cs",
      name: "Mindlink",
      rank: 1,
    },
    {
      id: "spell:6Ot4N22t5tPD51BO",
      name: "Knock",
      rank: 2,
    },
    {
      id: "spell:HXhWYJviWalN5tQ2",
      name: "Clairaudience",
      rank: 3,
    },
    {
      id: "spell:LQzlKbYjZSMFQawP",
      name: "Locate",
      rank: 3,
    },
    {
      id: "spell:zvKWclOZ7A53DObE",
      name: "Clairvoyance",
      rank: 4,
    },
    {
      id: "spell:AnWCohzPgK4L9GVl",
      name: "Detect Scrying",
      rank: 4,
    },
    {
      id: "spell:9BnhadUO8FMLmeZ3",
      name: "Mind Probe",
      rank: 5,
    },
    {
      id: "spell:Ek5XI0aEdZhBgm21",
      name: "Scouting Eye",
      rank: 5,
    },
    {
      id: "spell:r784cIz17eWujtQj",
      name: "Scrying",
      rank: 6,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:AlbpWWN87yGegoAF",
      name: "True Target",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:CeSh8QcVnqP5OlLj",
      name: "Pinpoint",
      rank: 8,
    },
    {
      id: "spell:qsNeG9KZpODSACMq",
      name: "Foresight",
      rank: 9,
    },
  ],
  "cf:dPAwM9IdabdH68mW": [
    {
      id: "spell:iYRDFxeVpJ5KIjmr",
      name: "Needle Darts",
      rank: 0,
    },
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:dINQzhqGmIsqGMUY",
      name: "Mending",
      rank: 1,
    },
    {
      id: "spell:TFitdEOpQC4SzKQQ",
      name: "Runic Weapon",
      rank: 1,
    },
    {
      id: "spell:lKcsmeOrgHtK4xQa",
      name: "Summon Construct",
      rank: 1,
    },
    {
      id: "spell:WqPhJNzLa8vSjrH6",
      name: "Animated Assault",
      rank: 2,
    },
    {
      id: "spell:jW2asKFchuoxniSH",
      name: "Dismantle",
      rank: 2,
    },
    {
      id: "spell:kWh8sJH7yawidMyW",
      name: "Shrink Item",
      rank: 3,
    },
    {
      id: "spell:aUMmmtPmBdCdVDed",
      name: "Wooden Double",
      rank: 3,
    },
    {
      id: "spell:TUj8eugNqAvB1vVR",
      name: "Creation",
      rank: 4,
    },
    {
      id: "spell:8M03UxGXjYyDFAoy",
      name: "Weapon Storm",
      rank: 4,
    },
    {
      id: "spell:oXeEbcUdgJGWHGEJ",
      name: "Impaling Spike",
      rank: 5,
    },
    {
      id: "spell:kOa055FIrO9Smnya",
      name: "Wall of Stone",
      rank: 5,
    },
    {
      id: "spell:MLYTWHfewOpI3Cz7",
      name: "Field of Razors",
      rank: 6,
    },
    {
      id: "spell:znv4ECL7ZtuiagtA",
      name: "Petrify",
      rank: 6,
    },
    {
      id: "spell:dKWc83KKiXoIJkhp",
      name: "Beheading Buzz Saw",
      rank: 7,
    },
    {
      id: "spell:HES5jvGiNZZnJycK",
      name: "Lifewood Cage",
      rank: 7,
    },
    {
      id: "spell:89Hj5QuqvcwVXcqj",
      name: "Ferrous Form",
      rank: 8,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:KPDHmmjJiw7PhTYF",
      name: "Resplendent Mansion",
      rank: 9,
    },
  ],
  "cf:L5FiuXsfW6Sa31gO": [
    {
      id: "spell:4gBIw4IDrSfFHik4",
      name: "Daze",
      rank: 0,
    },
    {
      id: "spell:0zU8CPejjQFnhZFI",
      name: "Figment",
      rank: 0,
    },
    {
      id: "spell:UKsIOWmMx4hSpafl",
      name: "Dizzying Colors",
      rank: 1,
    },
    {
      id: "spell:o4lRVTwSxnOOn5vl",
      name: "Sleep",
      rank: 1,
    },
    {
      id: "spell:Gb7SeieEvd0pL2Eh",
      name: "Sure Strike",
      rank: 1,
    },
    {
      id: "spell:f8SBoXiXQjlCKqly",
      name: "Illusory Creature",
      rank: 2,
    },
    {
      id: "spell:CQb8HtQ1BPeZmu9h",
      name: "Stupefy",
      rank: 2,
    },
    {
      id: "spell:yM3KTTSAIHhyuP14",
      name: "Dream Message",
      rank: 3,
    },
    {
      id: "spell:KHnhPHL4x1AQHfbC",
      name: "Mind Reading",
      rank: 3,
    },
    {
      id: "spell:Uqj344bezBq3ESdq",
      name: "Nightmare",
      rank: 4,
    },
    {
      id: "spell:Jmxru8zMdYMRuO5n",
      name: "Vision of Death",
      rank: 4,
    },
    {
      id: "spell:U58aQWJ47VrI36yP",
      name: "Hallucination",
      rank: 5,
    },
    {
      id: "spell:Ucf8eynbZMfUucjE",
      name: "Illusory Scene",
      rank: 5,
    },
    {
      id: "spell:5BbU1V6wGSGbrmRD",
      name: "Never Mind",
      rank: 6,
    },
    {
      id: "spell:0XP2XOxT9VSiXFDr",
      name: "Phantasmal Calamity",
      rank: 6,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:8kJbiBEjMWG4VUjs",
      name: "Warp Mind",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:Jvyy6oVIQsD34MHB",
      name: "Uncontrollable Dance",
      rank: 8,
    },
    {
      id: "spell:MJx7DmjsWYzDZ3a4",
      name: "Phantasmagoria",
      rank: 9,
    },
  ],
  "cf:Eygg2xIAFtc4xZgQ": [
    {
      id: "spell:5gophZ4AOKW4VW27",
      name: "Phase Bolt",
      rank: 0,
    },
    {
      id: "spell:sX2g6WFSQPNW9jzx",
      name: "Warp Step",
      rank: 0,
    },
    {
      id: "spell:4WAib3GichxLjp5p",
      name: "Alarm",
      rank: 1,
    },
    {
      id: "spell:F1nlmqOIucch3Cmt",
      name: "Pet Cache",
      rank: 1,
    },
    {
      id: "spell:qTr2oCgIXl703Whb",
      name: "Thoughtful Gift",
      rank: 1,
    },
    {
      id: "spell:PnZQsPSYFtTQFiU1",
      name: "Dimensional Drop",
      rank: 2,
    },
    {
      id: "spell:tvUfRH7q4NSvTFTx",
      name: "Vanish Weapon",
      rank: 2,
    },
    {
      id: "spell:mwPfoYfVGSMAaUec",
      name: "Cozy Cabin",
      rank: 3,
    },
    {
      id: "spell:zLtu2ipfuJECS4gq",
      name: "Far Reach",
      rank: 3,
    },
    {
      id: "spell:zR67Rt3UMHKC5evy",
      name: "Flicker",
      rank: 4,
    },
    {
      id: "spell:OM5NeD7a1CYNqy8S",
      name: "Liminal Doorway",
      rank: 4,
    },
    {
      id: "spell:bay4AfSu2iIozNNW",
      name: "Banishment",
      rank: 5,
    },
    {
      id: "spell:CVyAG7mXrs868UyB",
      name: "Space Fold Gate",
      rank: 5,
    },
    {
      id: "spell:c3XygMbzrZMgV1y3",
      name: "Collective Transposition",
      rank: 6,
    },
    {
      id: "spell:KESXD0D8XNDGzHBM",
      name: "Proximal Shift",
      rank: 6,
    },
    {
      id: "spell:5bTt2CvYHPvaR7QQ",
      name: "Interplanar Teleport",
      rank: 7,
    },
    {
      id: "spell:vPWMEyVTreMOoFnm",
      name: "Planar Palace",
      rank: 7,
    },
    {
      id: "spell:o4ew3prcQTQ8suoa",
      name: "Stars of Another Sky",
      rank: 8,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:KPDHmmjJiw7PhTYF",
      name: "Resplendent Mansion",
      rank: 9,
    },
  ],
  "cf:ZBFICTkzUjE4BDGJ": [
    {
      id: "spell:MPxbKoR54gkYkqLO",
      name: "Gouging Claw",
      rank: 0,
    },
    {
      id: "spell:uZK2BYzPnxUBnDjr",
      name: "Tangle Vine",
      rank: 0,
    },
    {
      id: "spell:Q7QQ91vQtyi1Ux36",
      name: "Jump",
      rank: 1,
    },
    {
      id: "spell:gfPjmG6Fe6D3MFjl",
      name: "Pest Form",
      rank: 1,
    },
    {
      id: "spell:DYdvMZ8G2LiSLVWw",
      name: "Spider Sting",
      rank: 1,
    },
    {
      id: "spell:wzctak6BxOW8xvFV",
      name: "Enlarge",
      rank: 2,
    },
    {
      id: "spell:2qGqa33E4GPUCbMV",
      name: "Humanoid Form",
      rank: 2,
    },
    {
      id: "spell:RvBlSIJmxiqfCpR9",
      name: "Feet to Fins",
      rank: 3,
    },
    {
      id: "spell:N1Z1oLPdBxaSgrEE",
      name: "Vampiric Feast",
      rank: 3,
    },
    {
      id: "spell:2BV2yYPfVJ5zirZt",
      name: "Mountain Resilience",
      rank: 4,
    },
    {
      id: "spell:V8wXOsoejQhe6CyG",
      name: "Vapor Form",
      rank: 4,
    },
    {
      id: "spell:1K6AYGisvo9gqdhs",
      name: "Elemental Form",
      rank: 5,
    },
    {
      id: "spell:MlpbeZ61Euhl0d60",
      name: "Toxic Cloud",
      rank: 5,
    },
    {
      id: "spell:dN8QBNuTiaBHCKUe",
      name: "Cursed Metamorphosis",
      rank: 6,
    },
    {
      id: "spell:znv4ECL7ZtuiagtA",
      name: "Petrify",
      rank: 6,
    },
    {
      id: "spell:73rToy0v5Ra9NvL6",
      name: "Duplicate Foe",
      rank: 7,
    },
    {
      id: "spell:XS7Wyh5YC0NWeWyB",
      name: "Fiery Body",
      rank: 7,
    },
    {
      id: "spell:M0jQlpQYUr0pp2Sv",
      name: "Desiccate",
      rank: 8,
    },
    {
      id: "spell:8AMvNVOUEtxBCDvJ",
      name: "Monstrosity Form",
      rank: 8,
    },
    {
      id: "spell:pswdik31kuHEvdno",
      name: "Metamorphosis",
      rank: 9,
    },
  ],
  "cf:X8BINW8OLQpIPpys": [
    {
      id: "spell:dDiOnjcsBFbAvP6t",
      name: "Gale Blast",
      rank: 0,
    },
    {
      id: "spell:zA0jNIBRgLsyTpbm",
      name: "Scatter Scree",
      rank: 0,
    },
    {
      id: "spell:nPb8DDs4rZpBLWIb",
      name: "Cradle Aloft",
      rank: 1,
    },
    {
      id: "spell:TTwOKGqmZeKSyNMH",
      name: "Gentle Landing",
      rank: 1,
    },
    {
      id: "spell:Rn2LkoSq1XhLsODV",
      name: "Pummeling Rubble",
      rank: 1,
    },
    {
      id: "spell:jW2asKFchuoxniSH",
      name: "Dismantle",
      rank: 2,
    },
    {
      id: "spell:gC3oEJ4WByq1LRO8",
      name: "Unrelenting Gravity",
      rank: 2,
    },
    {
      id: "spell:ANtTpeXo9nw7BnEb",
      name: "Chosen Gravity",
      rank: 3,
    },
    {
      id: "spell:94IYF1lHbki390VN",
      name: "Inertia Lock",
      rank: 3,
    },
    {
      id: "spell:qJQADktwD0x8kLAy",
      name: "Containment",
      rank: 4,
    },
    {
      id: "spell:ygZHabZRS1ypucaw",
      name: "Living Terrain",
      rank: 4,
    },
    {
      id: "spell:zfn5RqAdF63neqpP",
      name: "Control Water",
      rank: 5,
    },
    {
      id: "spell:kOa055FIrO9Smnya",
      name: "Wall of Stone",
      rank: 5,
    },
    {
      id: "spell:yrZA4k2VAqEP8xx7",
      name: "Repulsion",
      rank: 6,
    },
    {
      id: "spell:7Iela4GgVeO3LfAo",
      name: "Wall of Force",
      rank: 6,
    },
    {
      id: "spell:29tJyuEfFP43lMcM",
      name: "Infinitesimal Collapse Field",
      rank: 7,
    },
    {
      id: "spell:XZE4BawIlTf88Yl9",
      name: "Planar Seal",
      rank: 7,
    },
    {
      id: "spell:C2GYCH3TtUFqPfdX",
      name: "Arctic Rift",
      rank: 8,
    },
    {
      id: "spell:uZmUhjgqiX6d0Dv6",
      name: "Earthbreaker Stride",
      rank: 8,
    },
    {
      id: "spell:4WS7HrFjwNvTn8T2",
      name: "Implosion",
      rank: 9,
    },
  ],
  "cf:KGkWSv9rARpwWzXW": [
    {
      id: "spell:gpzpAAAJ1Lza2JVl",
      name: "Detect Magic",
      rank: 0,
    },
    {
      id: "spell:4WAib3GichxLjp5p",
      name: "Alarm",
      rank: 1,
    },
    {
      id: "spell:9HpwDN4MYQJnW0LG",
      name: "Dispel Magic",
      rank: 2,
    },
    {
      id: "spell:IFuEzfmmWyNwVbhY",
      name: "Safe Passage",
      rank: 3,
    },
    {
      id: "spell:2BV2yYPfVJ5zirZt",
      name: "Mountain Resilience",
      rank: 4,
    },
    {
      id: "spell:zfn5RqAdF63neqpP",
      name: "Control Water",
      rank: 5,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:m2xFMNyQiUKQDRaj",
      name: "Energy Aegis",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
  ],
  "cf:0QAFC61tpP63GUQa": [
    {
      id: "spell:0zU8CPejjQFnhZFI",
      name: "Figment",
      rank: 0,
    },
    {
      id: "spell:IxhGEKl63R4QBvkj",
      name: "Frostbite",
      rank: 0,
    },
    {
      id: "spell:PRrZ7anETWPm90YY",
      name: "Disguise Magic",
      rank: 1,
    },
    {
      id: "spell:MiDbBU5uupWqjYzm",
      name: "Gloom Mantle",
      rank: 1,
    },
    {
      id: "spell:2oH5IufzdESuYxat",
      name: "Illusory Object",
      rank: 1,
    },
    {
      id: "spell:4GE2ZdODgIQtg51c",
      name: "Darkness",
      rank: 2,
    },
    {
      id: "spell:f8SBoXiXQjlCKqly",
      name: "Illusory Creature",
      rank: 2,
    },
    {
      id: "spell:8cuqRFB3mWBOgy61",
      name: "Shadow Projectile",
      rank: 3,
    },
    {
      id: "spell:I0j56TNRmGcTyoqJ",
      name: "Shared Invisibility",
      rank: 3,
    },
    {
      id: "spell:OM5NeD7a1CYNqy8S",
      name: "Liminal Doorway",
      rank: 4,
    },
    {
      id: "spell:HBJPsonQnWcC3qdX",
      name: "Mirage",
      rank: 4,
    },
    {
      id: "spell:IqJ9URobmJ9L9UBG",
      name: "Shadow Blast",
      rank: 5,
    },
    {
      id: "spell:xFp4EwVcYwSG336t",
      name: "Slither",
      rank: 5,
    },
    {
      id: "spell:WPXzPl7YbMEIGWfi",
      name: "Mislead",
      rank: 6,
    },
    {
      id: "spell:0XP2XOxT9VSiXFDr",
      name: "Phantasmal Calamity",
      rank: 6,
    },
    {
      id: "spell:O6VQC1Bs4aSYDa6R",
      name: "Mask of Terror",
      rank: 7,
    },
    {
      id: "spell:4MoAAkdH7RV8BDy9",
      name: "Shadow Form",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:MJx7DmjsWYzDZ3a4",
      name: "Phantasmagoria",
      rank: 9,
    },
  ],
  "cf:ZpFCZnVzIfZLfNii": [
    {
      id: "spell:pwzdSlJgYqN7bs2w",
      name: "Telekinetic Hand",
      rank: 0,
    },
    {
      id: "spell:mAMEt4FFbdqoRnkN",
      name: "Void Warp",
      rank: 0,
    },
    {
      id: "spell:k34hDOfIIMAxNL4a",
      name: "Grim Tendrils",
      rank: 1,
    },
    {
      id: "spell:xqmHD8JIjak15lRk",
      name: "Phantasmal Minion",
      rank: 1,
    },
    {
      id: "spell:9WGeBwIIbbUuWKq0",
      name: "Summon Undead",
      rank: 1,
    },
    {
      id: "spell:4GE2ZdODgIQtg51c",
      name: "Darkness",
      rank: 2,
    },
    {
      id: "spell:GUeRTriJkMlMlVrk",
      name: "Bind Undead",
      rank: 3,
    },
    {
      id: "spell:AMEu5zzLN7uCX645",
      name: "Ghostly Weapon",
      rank: 3,
    },
    {
      id: "spell:zR67Rt3UMHKC5evy",
      name: "Flicker",
      rank: 4,
    },
    {
      id: "spell:VlNcjmYyu95vOUe8",
      name: "Translocate",
      rank: 4,
    },
    {
      id: "spell:bay4AfSu2iIozNNW",
      name: "Banishment",
      rank: 5,
    },
    {
      id: "spell:hghGRzOSzEl4UXdS",
      name: "Invoke Spirits",
      rank: 5,
    },
    {
      id: "spell:69L70wKfGDY66Mk9",
      name: "Teleport",
      rank: 6,
    },
    {
      id: "spell:fd31tAHSSGXyOxW6",
      name: "Vampiric Exsanguination",
      rank: 6,
    },
    {
      id: "spell:0jadeyQIItIuRgeH",
      name: "Eclipse Burst",
      rank: 7,
    },
    {
      id: "spell:5bTt2CvYHPvaR7QQ",
      name: "Interplanar Teleport",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:10VcmSYNBrvBphu1",
      name: "Massacre",
      rank: 9,
    },
  ],
  "cf:n2LRzksKVSzOuzqN": [
    {
      id: "spell:pwzdSlJgYqN7bs2w",
      name: "Telekinetic Hand",
      rank: 0,
    },
    {
      id: "spell:60sgbuMWN0268dB7",
      name: "Telekinetic Projectile",
      rank: 0,
    },
    {
      id: "spell:aEM2cttJ2eYcLssW",
      name: "Fleet Step",
      rank: 1,
    },
    {
      id: "spell:g8QqHpv2CWDwmIm1",
      name: "Gust of Wind",
      rank: 1,
    },
    {
      id: "spell:dINQzhqGmIsqGMUY",
      name: "Mending",
      rank: 1,
    },
    {
      id: "spell:6Ot4N22t5tPD51BO",
      name: "Knock",
      rank: 2,
    },
    {
      id: "spell:PEGECeEtEmXEzwBT",
      name: "Mental Map",
      rank: 2,
    },
    {
      id: "spell:LQzlKbYjZSMFQawP",
      name: "Locate",
      rank: 3,
    },
    {
      id: "spell:LJHrndGJRmLdxgXD",
      name: "Overwhelming Memory",
      rank: 3,
    },
    {
      id: "spell:VUUWjeapcyLZabVA",
      name: "Bridge of Vines",
      rank: 4,
    },
    {
      id: "spell:McnPlLFvKtQVXNcG",
      name: "Shape Stone",
      rank: 4,
    },
    {
      id: "spell:9BnhadUO8FMLmeZ3",
      name: "Mind Probe",
      rank: 5,
    },
    {
      id: "spell:Ek5XI0aEdZhBgm21",
      name: "Scouting Eye",
      rank: 5,
    },
    {
      id: "spell:uqlxMQQeSGWEVjki",
      name: "Truesight",
      rank: 6,
    },
    {
      id: "spell:7Iela4GgVeO3LfAo",
      name: "Wall of Force",
      rank: 6,
    },
    {
      id: "spell:ljo9CEmnCMZXqfOQ",
      name: "Restore Ground",
      rank: 7,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:CeSh8QcVnqP5OlLj",
      name: "Pinpoint",
      rank: 8,
    },
    {
      id: "spell:y2cQYLr5mljDSu1G",
      name: "Unrelenting Observation",
      rank: 8,
    },
    {
      id: "spell:pswdik31kuHEvdno",
      name: "Metamorphosis",
      rank: 9,
    },
  ],
};

export const WIZARD_BRANCH_SPELLS: Record<string, ClassSpellData[]> = {
  "cf:4fmks2barqWlLtik": [
    {
      id: "spell:60sgbuMWN0268dB7",
      name: "Telekinetic Projectile",
      rank: 0,
    },
    {
      id: "spell:gKKqvLohtrSJj3BM",
      name: "Force Barrage",
      rank: 1,
    },
    {
      id: "spell:aAbfKn8maGjJjk2W",
      name: "Mystic Armor",
      rank: 1,
    },
    {
      id: "spell:mrDi3v933gsmnw25",
      name: "Telekinetic Maneuver",
      rank: 2,
    },
    {
      id: "spell:fI20AVwOzJMHXRdo",
      name: "Levitate",
      rank: 3,
    },
    {
      id: "spell:zR67Rt3UMHKC5evy",
      name: "Flicker",
      rank: 4,
    },
    {
      id: "spell:tpLTLbJUrYcMWGld",
      name: "Telekinetic Haul",
      rank: 5,
    },
    {
      id: "spell:dN8QBNuTiaBHCKUe",
      name: "Cursed Metamorphosis",
      rank: 6,
    },
    {
      id: "spell:WG91Z5TiR6oO5FOw",
      name: "Contingency",
      rank: 7,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:CeSh8QcVnqP5OlLj",
      name: "Pinpoint",
      rank: 8,
    },
    {
      id: "spell:kUSShxXzY1sPtJA0",
      name: "Detonate Magic",
      rank: 9,
    },
  ],
  "cf:JhczMKRuy53BxqBi": [
    {
      id: "spell:yvs1zN5Pai5U4CJX",
      name: "Summon Instrument",
      rank: 0,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:PRrZ7anETWPm90YY",
      name: "Disguise Magic",
      rank: 1,
    },
    {
      id: "spell:0qaqksrGGDj74HXE",
      name: "Revealing Light",
      rank: 2,
    },
    {
      id: "spell:K2WpC3FFoHrqX9Q5",
      name: "Hypnotize",
      rank: 3,
    },
    {
      id: "spell:LiGbewa9pO0yjbsY",
      name: "Confusion",
      rank: 4,
    },
    {
      id: "spell:Ek5XI0aEdZhBgm21",
      name: "Scouting Eye",
      rank: 5,
    },
    {
      id: "spell:r784cIz17eWujtQj",
      name: "Scrying",
      rank: 6,
    },
    {
      id: "spell:AlbpWWN87yGegoAF",
      name: "True Target",
      rank: 7,
    },
    {
      id: "spell:wfleiawxsfhpRRwf",
      name: "Disappearance",
      rank: 8,
    },
    {
      id: "spell:qsNeG9KZpODSACMq",
      name: "Foresight",
      rank: 9,
    },
  ],
  "cf:Oa0ENh8Zh7BftViG": [
    {
      id: "spell:WBmvzNDfpwka3qT4",
      name: "Light",
      rank: 0,
    },
    {
      id: "spell:dINQzhqGmIsqGMUY",
      name: "Mending",
      rank: 1,
    },
    {
      id: "spell:4YnON9JHYqtLzccu",
      name: "Summon Animal",
      rank: 1,
    },
    {
      id: "spell:CXICME10TkEJxz0P",
      name: "Shape Wood",
      rank: 2,
    },
    {
      id: "spell:mwPfoYfVGSMAaUec",
      name: "Cozy Cabin",
      rank: 3,
    },
    {
      id: "spell:OM5NeD7a1CYNqy8S",
      name: "Liminal Doorway",
      rank: 4,
    },
    {
      id: "spell:aqRYNoSvxsVfqglH",
      name: "Unfettered Movement",
      rank: 4,
    },
    {
      id: "spell:115Xp9E38CJENhNS",
      name: "Magic Passage",
      rank: 5,
    },
    {
      id: "spell:kghwmH3tQjMIhdH1",
      name: "Summon Dragon",
      rank: 5,
    },
    {
      id: "spell:TDNlDWbYb58Y55Da",
      name: "Chain Lightning",
      rank: 6,
    },
    {
      id: "spell:vPWMEyVTreMOoFnm",
      name: "Planar Palace",
      rank: 7,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
    {
      id: "spell:pswdik31kuHEvdno",
      name: "Metamorphosis",
      rank: 9,
    },
  ],
  "cf:bYooavyooaCqdhYJ": [
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:y6rAdMK6EFlV6U0t",
      name: "Breathe Fire",
      rank: 1,
    },
    {
      id: "spell:aEM2cttJ2eYcLssW",
      name: "Fleet Step",
      rank: 1,
    },
    {
      id: "spell:ZxHC7V7HtjUsB8zH",
      name: "Blazing Bolt",
      rank: 2,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
    {
      id: "spell:A2JfEKe6BZcTG1S8",
      name: "Fly",
      rank: 4,
    },
    {
      id: "spell:1K6AYGisvo9gqdhs",
      name: "Elemental Form",
      rank: 5,
    },
    {
      id: "spell:7Iela4GgVeO3LfAo",
      name: "Wall of Force",
      rank: 6,
    },
    {
      id: "spell:XS7Wyh5YC0NWeWyB",
      name: "Fiery Body",
      rank: 7,
    },
    {
      id: "spell:8AMvNVOUEtxBCDvJ",
      name: "Monstrosity Form",
      rank: 8,
    },
    {
      id: "spell:4WS7HrFjwNvTn8T2",
      name: "Implosion",
      rank: 9,
    },
  ],
  "cf:ivtpFSNKYZGvApBe": [
    {
      id: "spell:4gBIw4IDrSfFHik4",
      name: "Daze",
      rank: 0,
    },
    {
      id: "spell:D442XMADp01qJ7Cs",
      name: "Mindlink",
      rank: 1,
    },
    {
      id: "spell:yV7Ouzaoe7DHLESI",
      name: "Ventriloquism",
      rank: 1,
    },
    {
      id: "spell:yo1eB5Xz21AYfWCI",
      name: "Kgalaserke's Axes",
      rank: 2,
    },
    {
      id: "spell:P7AToTm0ulueRk63",
      name: "Ibex's Harvest",
      rank: 3,
    },
    {
      id: "spell:HqTI6wRrck1YXp3F",
      name: "Telepathy",
      rank: 4,
    },
    {
      id: "spell:9BnhadUO8FMLmeZ3",
      name: "Mind Probe",
      rank: 5,
    },
    {
      id: "spell:SwUiVavHKMWG7t5K",
      name: "Truespeech",
      rank: 5,
    },
    {
      id: "spell:WPXzPl7YbMEIGWfi",
      name: "Mislead",
      rank: 6,
    },
    {
      id: "spell:rsZ5c0AUyywe5yoK",
      name: "Retrocognition",
      rank: 7,
    },
    {
      id: "spell:C2w3YfBKjIRS07DP",
      name: "Hidden Mind",
      rank: 8,
    },
    {
      id: "spell:MJx7DmjsWYzDZ3a4",
      name: "Phantasmagoria",
      rank: 9,
    },
  ],
};

export const RUNELORD_SIN_SPELLS: Record<string, ClassSpellData[]> = {
  envy: [
    {
      id: "spell:TVKNbcgTee19PXZR",
      name: "Shield",
      rank: 0,
    },
    {
      id: "spell:uZK2BYzPnxUBnDjr",
      name: "Tangle Vine",
      rank: 0,
    },
    {
      id: "spell:8E97SA9KAWCNdXfO",
      name: "Schadenfreude",
      rank: 1,
    },
    {
      id: "spell:J7Y7tl0bbdz7TcCc",
      name: "Enfeeble",
      rank: 1,
    },
    {
      id: "spell:9HpwDN4MYQJnW0LG",
      name: "Dispel Magic",
      rank: 2,
    },
    {
      id: "spell:CQb8HtQ1BPeZmu9h",
      name: "Stupefy",
      rank: 2,
    },
    {
      id: "spell:gPvtmKMRpg9I9D7H",
      name: "Earthbind",
      rank: 3,
    },
    {
      id: "spell:uGi6t3cypb93mgyV",
      name: "Thief of Fortune",
      rank: 3,
    },
    {
      id: "spell:qJQADktwD0x8kLAy",
      name: "Containment",
      rank: 4,
    },
    {
      id: "spell:KSAEhNfZyXMO7Z7V",
      name: "Outcast's Curse",
      rank: 4,
    },
    {
      id: "spell:bay4AfSu2iIozNNW",
      name: "Banishment",
      rank: 5,
    },
    {
      id: "spell:d9sBzPOXX3KT8uTu",
      name: "Grisly Growths",
      rank: 5,
    },
    {
      id: "spell:dN8QBNuTiaBHCKUe",
      name: "Cursed Metamorphosis",
      rank: 6,
    },
    {
      id: "spell:8Umt1AzYfFbC4fui",
      name: "Spellwrack",
      rank: 6,
    },
    {
      id: "spell:73rToy0v5Ra9NvL6",
      name: "Duplicate Foe",
      rank: 7,
    },
    {
      id: "spell:XZE4BawIlTf88Yl9",
      name: "Planar Seal",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:kUSShxXzY1sPtJA0",
      name: "Detonate Magic",
      rank: 9,
    },
  ],
  gluttony: [
    {
      id: "spell:thAHF1zxNplLCJPO",
      name: "Caustic Blast",
      rank: 0,
    },
    {
      id: "spell:mAMEt4FFbdqoRnkN",
      name: "Void Warp",
      rank: 0,
    },
    {
      id: "spell:k34hDOfIIMAxNL4a",
      name: "Grim Tendrils",
      rank: 1,
    },
    {
      id: "spell:9WGeBwIIbbUuWKq0",
      name: "Summon Undead",
      rank: 1,
    },
    {
      id: "spell:Mt6ZzkVX8Q4xigFq",
      name: "Create Food",
      rank: 2,
    },
    {
      id: "spell:JhRuR7Jj3ViShpq7",
      name: "Ghoulish Cravings",
      rank: 2,
    },
    {
      id: "spell:0JWyMwVnLxX9CDYQ",
      name: "Rouse Skeletons",
      rank: 3,
    },
    {
      id: "spell:N1Z1oLPdBxaSgrEE",
      name: "Vampiric Feast",
      rank: 3,
    },
    {
      id: "spell:gfKhtVsXF3HKSdmY",
      name: "Seal Fate",
      rank: 4,
    },
    {
      id: "spell:07xYlmGX32XtHGEt",
      name: "Vampiric Maiden",
      rank: 4,
    },
    {
      id: "spell:BlfOg9Ceymgjstjm",
      name: "Corrosive Muck",
      rank: 5,
    },
    {
      id: "spell:xFp4EwVcYwSG336t",
      name: "Slither",
      rank: 5,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:fd31tAHSSGXyOxW6",
      name: "Vampiric Exsanguination",
      rank: 6,
    },
    {
      id: "spell:EAuUxxnDV4v3KDAC",
      name: "Devouring Void",
      rank: 7,
    },
    {
      id: "spell:0jadeyQIItIuRgeH",
      name: "Eclipse Burst",
      rank: 7,
    },
    {
      id: "spell:M0jQlpQYUr0pp2Sv",
      name: "Desiccate",
      rank: 8,
    },
    {
      id: "spell:10VcmSYNBrvBphu1",
      name: "Massacre",
      rank: 9,
    },
  ],
  greed: [
    {
      id: "spell:Vbj8bTQ1nwrOBbYF",
      name: "Live Wire",
      rank: 0,
    },
    {
      id: "spell:OhD2Z6rIGGD5ocZA",
      name: "Read Aura",
      rank: 0,
    },
    {
      id: "spell:X9dkmh23lFwMjrYd",
      name: "Ant Haul",
      rank: 1,
    },
    {
      id: "spell:2tHYKoVc5YhSewDO",
      name: "Leaden Steps",
      rank: 1,
    },
    {
      id: "spell:wzctak6BxOW8xvFV",
      name: "Enlarge",
      rank: 2,
    },
    {
      id: "spell:L0GoJpHxSD0wRY5k",
      name: "Phantasmal Treasure",
      rank: 2,
    },
    {
      id: "spell:vh1RpbWfqdNC4L3P",
      name: "One with Stone",
      rank: 3,
    },
    {
      id: "spell:kWh8sJH7yawidMyW",
      name: "Shrink Item",
      rank: 3,
    },
    {
      id: "spell:NzXpEzcZAjuDTZjK",
      name: "Aerial Form",
      rank: 4,
    },
    {
      id: "spell:McnPlLFvKtQVXNcG",
      name: "Shape Stone",
      rank: 4,
    },
    {
      id: "spell:1K6AYGisvo9gqdhs",
      name: "Elemental Form",
      rank: 5,
    },
    {
      id: "spell:oXeEbcUdgJGWHGEJ",
      name: "Impaling Spike",
      rank: 5,
    },
    {
      id: "spell:5c692cCcTDXjSEzk",
      name: "Dragon Form",
      rank: 6,
    },
    {
      id: "spell:znv4ECL7ZtuiagtA",
      name: "Petrify",
      rank: 6,
    },
    {
      id: "spell:hvV6IruyW4MAr0Ub",
      name: "Chrysopoetic Curse",
      rank: 7,
    },
    {
      id: "spell:HES5jvGiNZZnJycK",
      name: "Lifewood Cage",
      rank: 7,
    },
    {
      id: "spell:8AMvNVOUEtxBCDvJ",
      name: "Monstrosity Form",
      rank: 8,
    },
    {
      id: "spell:pswdik31kuHEvdno",
      name: "Metamorphosis",
      rank: 9,
    },
  ],
  lust: [
    {
      id: "spell:4gBIw4IDrSfFHik4",
      name: "Daze",
      rank: 0,
    },
    {
      id: "spell:vLzFcIaSXs7YTIqJ",
      name: "Message",
      rank: 0,
    },
    {
      id: "spell:vLA0q0WOK2YPuJs6",
      name: "Charm",
      rank: 1,
    },
    {
      id: "spell:aIHY2DArKFweIrpf",
      name: "Command",
      rank: 1,
    },
    {
      id: "spell:UirEIHILQgip87qv",
      name: "Charitable Urge",
      rank: 2,
    },
    {
      id: "spell:CQb8HtQ1BPeZmu9h",
      name: "Stupefy",
      rank: 2,
    },
    {
      id: "spell:yM3KTTSAIHhyuP14",
      name: "Dream Message",
      rank: 3,
    },
    {
      id: "spell:IihxWhRfpsBgQ5jS",
      name: "Enthrall",
      rank: 3,
    },
    {
      id: "spell:LiGbewa9pO0yjbsY",
      name: "Confusion",
      rank: 4,
    },
    {
      id: "spell:qwlh6aDgi86U3Q7H",
      name: "Suggestion",
      rank: 4,
    },
    {
      id: "spell:9BnhadUO8FMLmeZ3",
      name: "Mind Probe",
      rank: 5,
    },
    {
      id: "spell:GP3wewkQXEPrLxYj",
      name: "Subconscious Suggestion",
      rank: 5,
    },
    {
      id: "spell:OsOhx3TGIZ7AhD0P",
      name: "Dominate",
      rank: 6,
    },
    {
      id: "spell:5BbU1V6wGSGbrmRD",
      name: "Never Mind",
      rank: 6,
    },
    {
      id: "spell:flKde7BHrZnRheMl",
      name: "Love's Sacrifice",
      rank: 7,
    },
    {
      id: "spell:8kJbiBEjMWG4VUjs",
      name: "Warp Mind",
      rank: 7,
    },
    {
      id: "spell:Jvyy6oVIQsD34MHB",
      name: "Uncontrollable Dance",
      rank: 8,
    },
    {
      id: "spell:ItZgGznUBhgWBwFG",
      name: "Telepathic Demand",
      rank: 9,
    },
  ],
  pride: [
    {
      id: "spell:W02bHXylIpoXbO4e",
      name: "Bullhorn",
      rank: 0,
    },
    {
      id: "spell:0zU8CPejjQFnhZFI",
      name: "Figment",
      rank: 0,
    },
    {
      id: "spell:UKsIOWmMx4hSpafl",
      name: "Dizzying Colors",
      rank: 1,
    },
    {
      id: "spell:i35dpZFI7jZcRoBo",
      name: "Illusory Disguise",
      rank: 1,
    },
    {
      id: "spell:f8SBoXiXQjlCKqly",
      name: "Illusory Creature",
      rank: 2,
    },
    {
      id: "spell:XXqE1eY3w3z6xJCB",
      name: "Invisibility",
      rank: 2,
    },
    {
      id: "spell:VosLNn2M8S7JH67D",
      name: "Blindness",
      rank: 3,
    },
    {
      id: "spell:fI20AVwOzJMHXRdo",
      name: "Levitate",
      rank: 3,
    },
    {
      id: "spell:HBJPsonQnWcC3qdX",
      name: "Mirage",
      rank: 4,
    },
    {
      id: "spell:Jmxru8zMdYMRuO5n",
      name: "Vision of Death",
      rank: 4,
    },
    {
      id: "spell:TCk2MDwf5L5OYjFC",
      name: "Cloak of Colors",
      rank: 5,
    },
    {
      id: "spell:0XP2XOxT9VSiXFDr",
      name: "Phantasmal Calamity",
      rank: 6,
    },
    {
      id: "spell:O6VQC1Bs4aSYDa6R",
      name: "Mask of Terror",
      rank: 7,
    },
    {
      id: "spell:0873MWM0qKDDv81O",
      name: "Project Image",
      rank: 7,
    },
    {
      id: "spell:uEyfLoFQsRKBRIcB",
      name: "Confusing Colors",
      rank: 8,
    },
    {
      id: "spell:fkDeKktdmbeplYRY",
      name: "Overwhelming Presence",
      rank: 9,
    },
  ],
  sloth: [
    {
      id: "spell:pwzdSlJgYqN7bs2w",
      name: "Telekinetic Hand",
      rank: 0,
    },
    {
      id: "spell:60sgbuMWN0268dB7",
      name: "Telekinetic Projectile",
      rank: 0,
    },
    {
      id: "spell:o4lRVTwSxnOOn5vl",
      name: "Sleep",
      rank: 1,
    },
    {
      id: "spell:J7Y7tl0bbdz7TcCc",
      name: "Enfeeble",
      rank: 1,
    },
    {
      id: "spell:rthC6dGm3nNrt1xN",
      name: "Ghostly Carrier",
      rank: 2,
    },
    {
      id: "spell:lpT6LotUaQPfinjj",
      name: "Summon Elemental",
      rank: 2,
    },
    {
      id: "spell:mwPfoYfVGSMAaUec",
      name: "Cozy Cabin",
      rank: 3,
    },
    {
      id: "spell:WsUwpfmhKrKwoIe3",
      name: "Slow",
      rank: 3,
    },
    {
      id: "spell:MLdMUOdwSKegOGlo",
      name: "Dull Ambition",
      rank: 4,
    },
    {
      id: "spell:VlNcjmYyu95vOUe8",
      name: "Translocate",
      rank: 4,
    },
    {
      id: "spell:kghwmH3tQjMIhdH1",
      name: "Summon Dragon",
      rank: 5,
    },
    {
      id: "spell:tpLTLbJUrYcMWGld",
      name: "Telekinetic Haul",
      rank: 5,
    },
    {
      id: "spell:c3XygMbzrZMgV1y3",
      name: "Collective Transposition",
      rank: 6,
    },
    {
      id: "spell:xh6hPMDx2n4OaBU7",
      name: "Indolent Haze",
      rank: 7,
    },
    {
      id: "spell:vPWMEyVTreMOoFnm",
      name: "Planar Palace",
      rank: 7,
    },
    {
      id: "spell:Oj1PJBMQD9vuwCv7",
      name: "Quandary",
      rank: 8,
    },
    {
      id: "spell:KPDHmmjJiw7PhTYF",
      name: "Resplendent Mansion",
      rank: 9,
    },
  ],
  wrath: [
    {
      id: "spell:IxhGEKl63R4QBvkj",
      name: "Frostbite",
      rank: 0,
    },
    {
      id: "spell:6DfLZBl8wKIV03Iq",
      name: "Ignition",
      rank: 0,
    },
    {
      id: "spell:gKKqvLohtrSJj3BM",
      name: "Force Barrage",
      rank: 1,
    },
    {
      id: "spell:zDJS8E66UI0himqV",
      name: "Thunderstrike",
      rank: 1,
    },
    {
      id: "spell:hoR6w8BqX2F35Tdx",
      name: "Blistering Invective",
      rank: 2,
    },
    {
      id: "spell:2ZdHjnpEQJuqOYSG",
      name: "Floating Flame",
      rank: 2,
    },
    {
      id: "spell:sxQZ6yqTn0czJxVd",
      name: "Fireball",
      rank: 3,
    },
    {
      id: "spell:9AAkVUCwF6WVNNY2",
      name: "Lightning Bolt",
      rank: 3,
    },
    {
      id: "spell:kHyjQbibRGPNCixx",
      name: "Ice Storm",
      rank: 4,
    },
    {
      id: "spell:IarZrgCeaiUqOuRu",
      name: "Wall of Fire",
      rank: 4,
    },
    {
      id: "spell:xxWhyl81w3ckslAU",
      name: "Howling Blizzard",
      rank: 5,
    },
    {
      id: "spell:R5FHRv7VqyRnxg2t",
      name: "Wall of Ice",
      rank: 5,
    },
    {
      id: "spell:NhGXgmI3AjkkwnPk",
      name: "Blinding Fury",
      rank: 6,
    },
    {
      id: "spell:r7ihOgKv19eJQnik",
      name: "Disintegrate",
      rank: 6,
    },
    {
      id: "spell:0jadeyQIItIuRgeH",
      name: "Eclipse Burst",
      rank: 7,
    },
    {
      id: "spell:XS7Wyh5YC0NWeWyB",
      name: "Fiery Body",
      rank: 7,
    },
    {
      id: "spell:x7SPrsRxGb2Vy2nu",
      name: "Earthquake",
      rank: 8,
    },
    {
      id: "spell:jrBa9deU2ULFWvSl",
      name: "Falling Stars",
      rank: 9,
    },
  ],
};
