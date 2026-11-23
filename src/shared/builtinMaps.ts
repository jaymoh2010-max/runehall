export type BuiltinMapCategory =
  | "tavern"
  | "cavern"
  | "forest"
  | "mountain"
  | "battlefield"
  | "crypt"
  | "village"
  | "ship"
  | "desert"
  | "swamp";

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
}

export const BUILTIN_MAP_CATEGORIES: {
  id: "all" | BuiltinMapCategory;
  label: string;
}[] = [
  { id: "all", label: "All maps" },
  { id: "tavern", label: "Tavern" },
  { id: "cavern", label: "Cavern" },
  { id: "forest", label: "Forest" },
  { id: "mountain", label: "Mountain" },
  { id: "battlefield", label: "Battlefield" },
  { id: "crypt", label: "Crypt" },
  { id: "village", label: "Village" },
  { id: "ship", label: "Ship" },
  { id: "desert", label: "Desert" },
  { id: "swamp", label: "Swamp" },
];

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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2019/04/15/duck-inn/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2019/06/03/black-cave/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2018/08/13/goblins-at-herlihy-farm/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2018/12/10/stony-hill/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2018/03/09/the-toronin-ruins/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2018/10/08/circle-crypts-of-the-ophidian-emperor/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2018/01/05/third-story-run/",
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
    credit: "Cartography by Dyson Logos",
    license: "CC BY 4.0",
    sourceUrl: "https://dysonlogos.blog/2017/11/14/the-wreck-of-the-wights-shadow/",
  },
  {
    id: "desert",
    name: "Desert Prison",
    category: "desert",
    description:
      "A sun-baked penitentiary surrounded by sand, with a walled yard, watch posts, cell blocks, and a crystal mine below. Built for rescues, breakouts, and desert sieges.",
    imageUrl: "/maps/desert-prison.png",
    thumbnailUrl: "/maps/thumbs/desert-prison.jpg",
    width: 2048,
    height: 1489,
    gridSize: 31,
    credit: "Map by Free Fantasy Maps",
    license: "CC BY 4.0",
    sourceUrl: "https://freefantasymaps.org/desert-prison/",
  },
  {
    id: "swamp",
    name: "Swamp Shrine",
    category: "swamp",
    description:
      "A crumbling temple half-swallowed by a fetid swamp. Broken columns, a central fountain, and sunken approaches make every step a tactical choice.",
    imageUrl: "/maps/swamp-shrine.png",
    thumbnailUrl: "/maps/thumbs/swamp-shrine.jpg",
    width: 2048,
    height: 1489,
    gridSize: 31,
    credit: "Map by Free Fantasy Maps",
    license: "CC BY 4.0",
    sourceUrl: "https://freefantasymaps.org/swamp-shrine/",
  },
];

export function builtinMapCategoryLabel(category: BuiltinMapCategory): string {
  return BUILTIN_MAP_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
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
