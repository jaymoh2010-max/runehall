export type BuiltinMapCategory =
  "tavern" | "cavern" | "forest" | "mountain" | "battlefield" | "crypt";

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
];

export const BUILTIN_MAPS: BuiltinMap[] = [
  {
    id: "tavern",
    name: "The Gilded Tankard",
    category: "tavern",
    description:
      "A warm timber common room with a long bar, fireplace, tables, and a cellar stair. Good for brawls, negotiations, and mysterious patrons.",
    imageUrl: "/maps/tavern.svg",
    thumbnailUrl: "/maps/tavern.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
  },
  {
    id: "cavern",
    name: "Gloomwater Cavern",
    category: "cavern",
    description:
      "A crystal-lit cave with a cold underground pool, a deep chasm, and narrow stone bridges. Light sources matter here.",
    imageUrl: "/maps/cavern.svg",
    thumbnailUrl: "/maps/cavern.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
  },
  {
    id: "forest",
    name: "Whispering Glade",
    category: "forest",
    description:
      "A mossy forest clearing crossed by a shallow stream and a winding trail, with dense trees at the edges.",
    imageUrl: "/maps/forest.svg",
    thumbnailUrl: "/maps/forest.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
  },
  {
    id: "mountain",
    name: "Highpass Switchback",
    category: "mountain",
    description:
      "A high mountain trail between cliff faces, a stone bridge over a gorge, and patches of snow. Ideal for ambushes and forced marches.",
    imageUrl: "/maps/mountain.svg",
    thumbnailUrl: "/maps/mountain.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
  },
  {
    id: "battlefield",
    name: "The Broken Standard",
    category: "battlefield",
    description:
      "A muddy ruined battlefield with craters, a broken wall, wrecked carts, and torn banners. Open ground for a large fight.",
    imageUrl: "/maps/battlefield.svg",
    thumbnailUrl: "/maps/battlefield.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
  },
  {
    id: "crypt",
    name: "Hollow Crypt",
    category: "crypt",
    description:
      "A pillared stone crypt with sarcophagi, candlelight, cobwebs, and a raised central dais. Built for undead and old secrets.",
    imageUrl: "/maps/crypt.svg",
    thumbnailUrl: "/maps/crypt.svg",
    width: 1536,
    height: 1024,
    gridSize: 64,
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
