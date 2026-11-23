export type BuiltinMapCategory =
  | "tavern"
  | "village"
  | "dungeon"
  | "cavern"
  | "crypt"
  | "temple"
  | "sewer"
  | "forest"
  | "mountain"
  | "arctic"
  | "desert"
  | "swamp"
  | "coast"
  | "ship"
  | "battlefield"
  | "road"
  | "fey"
  | "volcano"
  | "festival"
  | "academy";

export type BuiltinMapTheme =
  | "abomination-vaults"
  | "age-of-ashes"
  | "agents-of-edgewatch"
  | "blood-lords"
  | "curse-of-the-crimson-throne"
  | "extinction-curse"
  | "fists-of-the-ruby-phoenix"
  | "gatewalkers"
  | "kingmaker"
  | "outlaws-of-alkenstar"
  | "quest-for-the-frozen-flame"
  | "season-of-ghosts"
  | "sky-kings-tomb"
  | "strength-of-thousands"
  | "stolen-fate"
  | "wrath-of-the-righteous";

export interface BuiltinMap {
  id: string;
  name: string;
  category: BuiltinMapCategory;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  /** Pixel size of one 5-foot square in the built-in map. */
  gridSize: number;
  /** Offset of the first grid line from the image origin. */
  gridOffsetX?: number;
  gridOffsetY?: number;
  credit?: string;
  license?: string;
  sourceUrl?: string;
  /** True for full-colour maps, which skip the line-art tint in the scene view. */
  color?: boolean;
  /** Pathfinder adventures whose locations or themes this map fits. */
  themes: BuiltinMapTheme[];
}

export const BUILTIN_MAP_CATEGORIES: {
  id: "all" | BuiltinMapCategory;
  label: string;
}[] = [
  { id: "all", label: "All maps" },
  { id: "tavern", label: "Tavern" },
  { id: "village", label: "Town" },
  { id: "dungeon", label: "Dungeon" },
  { id: "cavern", label: "Cavern" },
  { id: "crypt", label: "Crypt" },
  { id: "temple", label: "Temple" },
  { id: "sewer", label: "Sewer" },
  { id: "forest", label: "Forest" },
  { id: "mountain", label: "Mountain" },
  { id: "arctic", label: "Arctic" },
  { id: "desert", label: "Desert" },
  { id: "swamp", label: "Swamp" },
  { id: "coast", label: "Coast" },
  { id: "ship", label: "Ship" },
  { id: "battlefield", label: "Battlefield" },
  { id: "road", label: "Road" },
  { id: "fey", label: "Feywild" },
  { id: "volcano", label: "Volcanic" },
  { id: "festival", label: "Festival" },
  { id: "academy", label: "Academy" },
];

export const BUILTIN_MAP_THEMES: {
  id: BuiltinMapTheme;
  label: string;
}[] = [
  { id: "abomination-vaults", label: "Abomination Vaults" },
  { id: "age-of-ashes", label: "Age of Ashes" },
  { id: "agents-of-edgewatch", label: "Agents of Edgewatch" },
  { id: "blood-lords", label: "Blood Lords" },
  { id: "curse-of-the-crimson-throne", label: "Curse of the Crimson Throne" },
  { id: "extinction-curse", label: "Extinction Curse" },
  { id: "fists-of-the-ruby-phoenix", label: "Fists of the Ruby Phoenix" },
  { id: "gatewalkers", label: "Gatewalkers" },
  { id: "kingmaker", label: "Kingmaker" },
  { id: "outlaws-of-alkenstar", label: "Outlaws of Alkenstar" },
  { id: "quest-for-the-frozen-flame", label: "Quest for the Frozen Flame" },
  { id: "season-of-ghosts", label: "Season of Ghosts" },
  { id: "sky-kings-tomb", label: "Sky King's Tomb" },
  { id: "strength-of-thousands", label: "Strength of Thousands" },
  { id: "stolen-fate", label: "Stolen Fate" },
  { id: "wrath-of-the-righteous", label: "Wrath of the Righteous" },
];

const DYSON_CREDIT = "Cartography by Dyson Logos";
const DYSON_LICENSE = "CC BY 4.0";
const FFM_CREDIT = "Map by Free Fantasy Maps";
const FFM_LICENSE = "CC BY 4.0";
const VTT_CREDIT = "Map by mbround18";
const VTT_LICENSE = "CC BY-SA 4.0";

export const BUILTIN_MAPS: BuiltinMap[] = [
  {
    id: "tavern",
    name: "The Wooden Duck",
    category: "tavern",
    description:
      "A timber coaching inn with a stable yard, a crowded common room, guest rooms, and a busy road outside. Good for brawls, negotiations, and mysterious patrons.",
    imageUrl: "/maps/tavern-coaching-inn.png",
    thumbnailUrl: "/maps/thumbs/tavern-coaching-inn.jpg",
    width: 1706,
    height: 2048,
    gridSize: 59,
    gridOffsetX: 57.8,
    gridOffsetY: 42.5,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2019/04/15/duck-inn/",
    themes: ["agents-of-edgewatch", "curse-of-the-crimson-throne", "kingmaker"],
  },
  {
    id: "cavern",
    name: "Robrus Beach Cave",
    category: "cavern",
    description:
      "A sea-worn cave of narrow passages, a dark pool, and a hidden beach. Smugglers, aberrations, and things that crawl in from the tide all fit here.",
    imageUrl: "/maps/cavern-beach-cave.png",
    thumbnailUrl: "/maps/thumbs/cavern-beach-cave.jpg",
    width: 2048,
    height: 2048,
    gridSize: 85,
    gridOffsetX: 0.1,
    gridOffsetY: 0.7,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2019/06/03/black-cave/",
    themes: ["abomination-vaults", "quest-for-the-frozen-flame", "sky-kings-tomb"],
  },
  {
    id: "forest",
    name: "Herlihy Farm Road",
    category: "forest",
    description:
      "A forest road running past a farmstead, outbuildings, and a treeline full of cover. Built for ambushes, midnight raids, and goblin trouble.",
    imageUrl: "/maps/forest-farm-road.png",
    thumbnailUrl: "/maps/thumbs/forest-farm-road.jpg",
    width: 1536,
    height: 2048,
    gridSize: 57,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2018/08/13/goblins-at-herlihy-farm/",
    themes: ["kingmaker", "season-of-ghosts", "gatewalkers"],
  },
  {
    id: "mountain",
    name: "Stony Hill",
    category: "mountain",
    description:
      "A rocky hilltop broken by cliffs, boulders, and narrow paths. High ground matters, and every ledge is a potential ambush point.",
    imageUrl: "/maps/mountain-stony-hill.png",
    thumbnailUrl: "/maps/thumbs/mountain-stony-hill.jpg",
    width: 2032,
    height: 2048,
    gridSize: 104,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2018/12/10/stony-hill/",
    themes: ["quest-for-the-frozen-flame", "age-of-ashes"],
  },
  {
    id: "battlefield",
    name: "The Toronin Ruins",
    category: "battlefield",
    description:
      "A stretch of ruined foundations, broken walls, and a shallow stream. Open ground for a large fight, with plenty of hard cover for anyone who reaches it.",
    imageUrl: "/maps/battlefield-toronin-ruins.png",
    thumbnailUrl: "/maps/thumbs/battlefield-toronin-ruins.jpg",
    width: 2048,
    height: 1462,
    gridSize: 40,
    gridOffsetX: 30.4,
    gridOffsetY: 27.7,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2018/03/09/the-toronin-ruins/",
    themes: ["age-of-ashes", "kingmaker", "wrath-of-the-righteous"],
  },
  {
    id: "crypt",
    name: "Circle Crypts of the Ophidian Emperor",
    category: "crypt",
    description:
      "A tomb complex of circular crypts, narrow halls, and old stone chambers. Built for undead, serpent cults, and secrets that should have stayed buried.",
    imageUrl: "/maps/crypt-circle-crypts.png",
    thumbnailUrl: "/maps/thumbs/crypt-circle-crypts.jpg",
    width: 2048,
    height: 2029,
    gridSize: 69,
    gridOffsetX: 21.5,
    gridOffsetY: 32.4,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2018/10/08/circle-crypts-of-the-ophidian-emperor/",
    themes: ["abomination-vaults", "blood-lords", "sky-kings-tomb"],
  },
  {
    id: "village",
    name: "Third-Story Run",
    category: "village",
    description:
      "A dense block of town rooftops, streets, and alleys. Ideal for chases, rooftop fights, and a sudden ambush in the middle of a crowded village.",
    imageUrl: "/maps/village-rooftops.png",
    thumbnailUrl: "/maps/thumbs/village-rooftops.jpg",
    width: 2048,
    height: 1898,
    gridSize: 67,
    gridOffsetX: 49,
    gridOffsetY: 64.2,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2018/01/05/third-story-run/",
    themes: ["agents-of-edgewatch", "curse-of-the-crimson-throne", "kingmaker"],
  },
  {
    id: "ship",
    name: "The Wreck of the Wight's Shadow",
    category: "ship",
    description:
      "A three-deck shipwreck tilted into the dark. Boarding actions, drowned cargo, and something still moving below deck all fit the map.",
    imageUrl: "/maps/ship-wight-shadow.png",
    thumbnailUrl: "/maps/thumbs/ship-wight-shadow.jpg",
    width: 1902,
    height: 2048,
    gridSize: 61,
    gridOffsetX: 56,
    gridOffsetY: 2.3,
    credit: DYSON_CREDIT,
    license: DYSON_LICENSE,
    sourceUrl: "https://dysonlogos.blog/2017/11/14/the-wreck-of-the-wights-shadow/",
    themes: ["stolen-fate", "gatewalkers"],
  },
  {
    id: "desert",
    name: "Desert Prison",
    category: "desert",
    description:
      "A sun-baked penitentiary surrounded by sand, with a walled yard, watch posts, cell blocks, and a crystal mine below. Built for rescues, breakouts, and desert sieges.",
    imageUrl: "/maps/desert-prison.jpg",
    thumbnailUrl: "/maps/thumbs/desert-prison.jpg",
    width: 2046,
    height: 1488,
    gridSize: 31,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/desert-prison/",
    color: true,
    themes: ["outlaws-of-alkenstar", "extinction-curse"],
  },
  {
    id: "swamp",
    name: "Swamp Shrine",
    category: "swamp",
    description:
      "A crumbling temple half-swallowed by a fetid swamp. Broken columns, a central fountain, and sunken approaches make every step a tactical choice.",
    imageUrl: "/maps/swamp-shrine.jpg",
    thumbnailUrl: "/maps/thumbs/swamp-shrine.jpg",
    width: 2046,
    height: 1488,
    gridSize: 31,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/swamp-shrine/",
    color: true,
    themes: ["blood-lords", "abomination-vaults", "season-of-ghosts"],
  },
  {
    id: "cultist-den",
    name: "Cultist Den of Shune",
    category: "dungeon",
    description:
      "A candle-lit cave complex wrapped around a ritual pool, with a timber hideout bolted onto the rock. Perfect for a mid-level cult, a hostage rescue, or a ritual that must not finish.",
    imageUrl: "/maps/dungeon-cultist-den.jpg",
    thumbnailUrl: "/maps/thumbs/dungeon-cultist-den.jpg",
    width: 2024,
    height: 1472,
    gridSize: 46,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/cultist-den-shune/",
    color: true,
    themes: ["abomination-vaults", "blood-lords", "wrath-of-the-righteous"],
  },
  {
    id: "wagon-trail",
    name: "Narrow Wagon Trail",
    category: "road",
    description:
      "A winding trail squeezed between a river and open grass, with a stone outcrop for cover. A natural place for a caravan ambush or a running fight.",
    imageUrl: "/maps/road-wagon-trail.jpg",
    thumbnailUrl: "/maps/thumbs/road-wagon-trail.jpg",
    width: 1980,
    height: 1440,
    gridSize: 60,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/wagon-trail/",
    color: true,
    themes: ["kingmaker", "outlaws-of-alkenstar"],
  },
  {
    id: "stream-crossing",
    name: "Stream Crossing",
    category: "forest",
    description:
      "A narrow wooden bridge over a fast stream, hemmed in by trees and rocks. Bottleneck the party on the bridge or let them fight for the banks.",
    imageUrl: "/maps/forest-stream-crossing.jpg",
    thumbnailUrl: "/maps/thumbs/forest-stream-crossing.jpg",
    width: 1472,
    height: 1024,
    gridSize: 64,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/stream-crossing-battle-map/",
    color: true,
    themes: ["kingmaker", "season-of-ghosts"],
  },
  {
    id: "abandoned-shrine",
    name: "The Abandoned Shrine",
    category: "temple",
    description:
      "A quiet woodland shrine with a reflecting pool, crumbling walls, and trees pressing close. Good for a healing stop that turns into a haunting.",
    imageUrl: "/maps/temple-abandoned-shrine.jpg",
    thumbnailUrl: "/maps/thumbs/temple-abandoned-shrine.jpg",
    width: 680,
    height: 480,
    gridSize: 20,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/abandoned-shrine/",
    color: true,
    themes: ["season-of-ghosts", "gatewalkers", "extinction-curse"],
  },
  {
    id: "greenville",
    name: "Greenville",
    category: "village",
    description:
      "A river town of houses, shops, a mill, and a handful of bridges. A ready-made hub for negotiations, chases, and a night attack.",
    imageUrl: "/maps/village-greenville.jpg",
    thumbnailUrl: "/maps/thumbs/village-greenville.jpg",
    width: 990,
    height: 792,
    gridSize: 33,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/greenville/",
    color: true,
    themes: ["kingmaker", "agents-of-edgewatch", "curse-of-the-crimson-throne"],
  },
  {
    id: "slipshod-inn",
    name: "The Slipshod Inn",
    category: "tavern",
    description:
      "A cutaway inn with a common room, kitchen, guest rooms, and a cellar tucked into one image. Drop the whole building onto the table and let the fight move between floors.",
    imageUrl: "/maps/tavern-slipshod-inn.jpg",
    thumbnailUrl: "/maps/thumbs/tavern-slipshod-inn.jpg",
    width: 792,
    height: 1023,
    gridSize: 33,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/slipshod-inn-tavern/",
    color: true,
    themes: ["curse-of-the-crimson-throne", "agents-of-edgewatch", "kingmaker"],
  },
  {
    id: "underground-temple",
    name: "Temple of the Argosi Gods",
    category: "temple",
    description:
      "A sunken temple of pale stone, four chapels, and a central dais. The open floor rewards ranged characters until the pillars start providing cover.",
    imageUrl: "/maps/temple-underground.jpg",
    thumbnailUrl: "/maps/thumbs/temple-underground.jpg",
    width: 800,
    height: 640,
    gridSize: 20,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/underground-temple-argosi-gods/",
    color: true,
    themes: ["abomination-vaults", "sky-kings-tomb", "blood-lords"],
  },
  {
    id: "crimson-hall",
    name: "The Crimson Hall",
    category: "dungeon",
    description:
      "A compact dungeon of tiled rooms, a flooded side chamber, and one big ritual space. Quick to run and easy to restock for a one-shot.",
    imageUrl: "/maps/dungeon-crimson-hall.jpg",
    thumbnailUrl: "/maps/thumbs/dungeon-crimson-hall.jpg",
    width: 960,
    height: 768,
    gridSize: 32,
    credit: FFM_CREDIT,
    license: FFM_LICENSE,
    sourceUrl: "https://freefantasymaps.org/fantasy-dungeon-map-2/",
    color: true,
    themes: ["abomination-vaults", "sky-kings-tomb", "kingmaker"],
  },
  {
    id: "pirate-cove",
    name: "Pirate Cove",
    category: "coast",
    description:
      "A rocky cove with sea caves, a hidden beach, and tide-cut passages. Smugglers, sea hags, and a stolen ship all belong here.",
    imageUrl: "/maps/coast-pirate-cove.jpg",
    thumbnailUrl: "/maps/thumbs/coast-pirate-cove.jpg",
    width: 2000,
    height: 2000,
    gridSize: 40,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/beach/pirate-cove/pirate-cove.dd2vtt",
    color: true,
    themes: ["stolen-fate", "gatewalkers", "agents-of-edgewatch"],
  },
  {
    id: "dwarven-forge",
    name: "The Ember Forge",
    category: "dungeon",
    description:
      "A dwarven forge split by rivers of lava, with an anvil platform and narrow bridges. Every fight here is about holding the high ground and not falling in.",
    imageUrl: "/maps/dungeon-dwarven-forge.jpg",
    thumbnailUrl: "/maps/thumbs/dungeon-dwarven-forge.jpg",
    width: 1344,
    height: 2016,
    gridSize: 56,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/dungeons/dwarven-forge/dwarven-forge.dd2vtt",
    color: true,
    themes: ["sky-kings-tomb", "age-of-ashes", "wrath-of-the-righteous"],
  },
  {
    id: "pools-of-mystery",
    name: "Pools of Mystery",
    category: "dungeon",
    description:
      "A vaulted hall of shallow pools and sunken channels, with a glowing green basin at its heart. Aberrations, guardians, and old magic all have somewhere to hide.",
    imageUrl: "/maps/dungeon-pools-of-mystery.jpg",
    thumbnailUrl: "/maps/thumbs/dungeon-pools-of-mystery.jpg",
    width: 2015,
    height: 1023,
    gridSize: 31,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/dungeons/pools%20of%20mystery/pools-of-mystery.dd2vtt",
    color: true,
    themes: ["abomination-vaults", "sky-kings-tomb", "gatewalkers"],
  },
  {
    id: "litch-tomb",
    name: "The Lich's Tomb",
    category: "crypt",
    description:
      "A waterlogged tomb chamber with a raised sarcophagus and a narrow approach. A final stand for something that refuses to stay dead.",
    imageUrl: "/maps/crypt-litch-tomb.jpg",
    thumbnailUrl: "/maps/thumbs/crypt-litch-tomb.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/dungeons/undead/the-litch-and-his-tomb.dd2vtt",
    color: true,
    themes: ["blood-lords", "abomination-vaults", "sky-kings-tomb"],
  },
  {
    id: "desert-path",
    name: "Desert Ambush",
    category: "desert",
    description:
      "A sandy road cut through dry scrub and rocks, with just enough cover to make an ambush work. The open ground punishes anyone who cannot close fast.",
    imageUrl: "/maps/desert-path-ambush.jpg",
    thumbnailUrl: "/maps/thumbs/desert-path-ambush.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/encounters/desert-path-ambush.dd2vtt",
    color: true,
    themes: ["outlaws-of-alkenstar", "extinction-curse"],
  },
  {
    id: "creek-outpost",
    name: "Creek Outpost",
    category: "battlefield",
    description:
      "A riverside camp with tents, wagons, a palisade, and a shallow creek. Built for a raid on a frontier outpost or a last stand around the fire.",
    imageUrl: "/maps/battlefield-creek-outpost.jpg",
    thumbnailUrl: "/maps/thumbs/battlefield-creek-outpost.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/encounters/outpost-with-little-creek.dd2vtt",
    color: true,
    themes: ["kingmaker", "age-of-ashes"],
  },
  {
    id: "animal-den",
    name: "Animal Den",
    category: "cavern",
    description:
      "A mossy cave mouth, a dark burrow, and a tangle of roots above. A simple lair for a beast, a poacher, or something that dragged its kill underground.",
    imageUrl: "/maps/cavern-animal-den.jpg",
    thumbnailUrl: "/maps/thumbs/cavern-animal-den.jpg",
    width: 2000,
    height: 2000,
    gridSize: 40,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/forest/caves/animal-den/animal-den.dd2vtt",
    color: true,
    themes: ["quest-for-the-frozen-flame", "kingmaker", "gatewalkers"],
  },
  {
    id: "river-camp",
    name: "River Camp",
    category: "forest",
    description:
      "A broad river bend with a campsite, a wooden pier, and trees on both banks. Good for travel encounters, night watches, and a fight that starts in the water.",
    imageUrl: "/maps/forest-river-camp.jpg",
    thumbnailUrl: "/maps/thumbs/forest-river-camp.jpg",
    width: 2000,
    height: 1000,
    gridSize: 25,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/forest/paths/along-river-with-campsite/along-river-with-campsite.dd2vtt",
    color: true,
    themes: ["kingmaker", "season-of-ghosts", "gatewalkers"],
  },
  {
    id: "hot-springs",
    name: "Mountain Hot Springs",
    category: "mountain",
    description:
      "A quiet mountain village built around steaming pools and a snowmelt stream. A safe haven with plenty of cover when the ambush finally comes.",
    imageUrl: "/maps/mountain-hot-springs.jpg",
    thumbnailUrl: "/maps/thumbs/mountain-hot-springs.jpg",
    width: 2000,
    height: 2000,
    gridSize: 50,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/destinations/hot-springs.dd2vtt",
    color: true,
    themes: ["quest-for-the-frozen-flame", "season-of-ghosts"],
  },
  {
    id: "festival-of-fools",
    name: "Festival of Fools",
    category: "festival",
    description:
      "A carnival ground of stages, tents, games, and food stalls. Perfect for a heist, a performance, or a massacre in front of a cheering crowd.",
    imageUrl: "/maps/festival-of-fools.jpg",
    thumbnailUrl: "/maps/thumbs/festival-of-fools.jpg",
    width: 2016,
    height: 2016,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/festivals/festival-of-fools/festival-of-fools.dd2vtt",
    color: true,
    themes: ["extinction-curse", "fists-of-the-ruby-phoenix", "strength-of-thousands"],
  },
  {
    id: "ritual-sewers",
    name: "Ritual Sewers",
    category: "sewer",
    description:
      "A sewer junction of walkways, channels, and a ritual circle on a central platform. The water is difficult terrain, the ledges are cover, and the smell is a hazard of its own.",
    imageUrl: "/maps/sewer-ritual.jpg",
    thumbnailUrl: "/maps/thumbs/sewer-ritual.jpg",
    width: 1980,
    height: 920,
    gridSize: 20,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/sewers/ritual-sewers/ritual-sewers.dd2vtt",
    color: true,
    themes: ["curse-of-the-crimson-throne", "agents-of-edgewatch", "abomination-vaults"],
  },
  {
    id: "felder-town",
    name: "Felder Town",
    category: "village",
    description:
      "A full town of streets, shops, homes, and a central square. Run a chase across the rooftops or a street-by-street defense without leaving the map.",
    imageUrl: "/maps/village-felder-town.jpg",
    thumbnailUrl: "/maps/thumbs/village-felder-town.jpg",
    width: 2025,
    height: 1575,
    gridSize: 45,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/towns/felder-town.dd2vtt",
    color: true,
    themes: ["agents-of-edgewatch", "curse-of-the-crimson-throne", "stolen-fate"],
  },
  {
    id: "mountain-town",
    name: "Mountain Town",
    category: "village",
    description:
      "A road through a mountain settlement, with cabins on both sides and a fast river below. Good for a cold welcome and a warmer ambush.",
    imageUrl: "/maps/village-mountain-town.jpg",
    thumbnailUrl: "/maps/thumbs/village-mountain-town.jpg",
    width: 2040,
    height: 1224,
    gridSize: 51,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/towns/mountain-town-tavern-with-cabins.dd2vtt",
    color: true,
    themes: ["age-of-ashes", "kingmaker", "quest-for-the-frozen-flame"],
  },
  {
    id: "garden-of-whispers",
    name: "Garden of Whispers",
    category: "fey",
    description:
      "A hedge maze of winding green corridors and hidden alcoves. Every turn is a blind corner, and every open patch is a stage for something watching.",
    imageUrl: "/maps/fey-garden-of-whispers.jpg",
    thumbnailUrl: "/maps/thumbs/fey-garden-of-whispers.jpg",
    width: 2000,
    height: 2000,
    gridSize: 50,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/spires/rooms/the-garden-of-whispers.dd2vtt",
    color: true,
    themes: ["gatewalkers", "strength-of-thousands", "fists-of-the-ruby-phoenix"],
  },
  {
    id: "roadside-inn",
    name: "The Roadside Inn",
    category: "tavern",
    description:
      "A broad country inn with a courtyard, stables, and a river ford behind it. A natural first stop on the road and a natural place for trouble to find the party.",
    imageUrl: "/maps/tavern-roadside-inn.jpg",
    thumbnailUrl: "/maps/thumbs/tavern-roadside-inn.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl: "https://github.com/mbround18/vtt-maps/blob/main/maps/taverns/road-side-in.dd2vtt",
    color: true,
    themes: ["agents-of-edgewatch", "curse-of-the-crimson-throne", "kingmaker"],
  },
  {
    id: "winding-road",
    name: "The Winding Road",
    category: "road",
    description:
      "A forest road curling past an old altar and a shallow stream. A strong site for a roadside shrine, a curse, or an ambush with a getaway route.",
    imageUrl: "/maps/road-winding.jpg",
    thumbnailUrl: "/maps/thumbs/road-winding.jpg",
    width: 2035,
    height: 740,
    gridSize: 37,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/travel/curvy-road-with-alter.dd2vtt",
    color: true,
    themes: ["kingmaker", "season-of-ghosts", "gatewalkers"],
  },
  {
    id: "volcano-gatehouse",
    name: "Gatehouse on the Lava River",
    category: "volcano",
    description:
      "A stone gatehouse spanning a river of lava, with narrow bridges and a courtyard on each bank. Hold the gate, break the gate, or fight on the edge of a very long fall.",
    imageUrl: "/maps/volcano-gatehouse.jpg",
    thumbnailUrl: "/maps/thumbs/volcano-gatehouse.jpg",
    width: 2040,
    height: 1224,
    gridSize: 51,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/travel/gate-house-on-lava-river-0.dd2vtt",
    color: true,
    themes: ["wrath-of-the-righteous", "age-of-ashes", "blood-lords"],
  },
  {
    id: "little-fish-academy",
    name: "Little Fish Academy",
    category: "academy",
    description:
      "A riverside academy campus of classrooms, courtyards, and a bridge over the water. A ready-made school for a magical academy campaign or a very strange field trip.",
    imageUrl: "/maps/academy-little-fish.jpg",
    thumbnailUrl: "/maps/thumbs/academy-little-fish.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/locations/schools/little-fish-academy/little-fish-academy.dd2vtt",
    color: true,
    themes: ["strength-of-thousands", "stolen-fate", "gatewalkers"],
  },
  {
    id: "snowbound-house",
    name: "Snowbound House",
    category: "arctic",
    description:
      "A snow-covered house and outbuildings on a frozen plain, with a stand of pale trees for cover. A lonely place to arrive, and a worse place to be trapped.",
    imageUrl: "/maps/arctic-snowbound-house.jpg",
    thumbnailUrl: "/maps/thumbs/arctic-snowbound-house.jpg",
    width: 2016,
    height: 1134,
    gridSize: 42,
    credit: VTT_CREDIT,
    license: VTT_LICENSE,
    sourceUrl:
      "https://github.com/mbround18/vtt-maps/blob/main/maps/tundra/snowy_house_in_void.dd2vtt",
    color: true,
    themes: ["quest-for-the-frozen-flame", "season-of-ghosts", "gatewalkers"],
  },
];

export function builtinMapCategoryLabel(category: BuiltinMapCategory): string {
  return BUILTIN_MAP_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

export function builtinMapThemeLabel(theme: BuiltinMapTheme): string {
  return BUILTIN_MAP_THEMES.find((entry) => entry.id === theme)?.label ?? theme;
}

export function builtinMapSquares(map: Pick<BuiltinMap, "width" | "height" | "gridSize">): {
  cols: number;
  rows: number;
} {
  return {
    cols: Math.round(map.width / map.gridSize),
    rows: Math.round(map.height / map.gridSize),
  };
}
