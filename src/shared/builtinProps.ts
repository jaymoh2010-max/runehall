export type BuiltinPropCategory = "furniture" | "nature" | "dungeon" | "camp";

export interface BuiltinProp {
  id: string;
  name: string;
  category: BuiltinPropCategory;
  description: string;
  imageUrl: string;
  /** Default footprint in 5-foot squares. */
  squaresW: number;
  squaresH: number;
}

export const BUILTIN_PROP_CATEGORIES: {
  id: "all" | BuiltinPropCategory;
  label: string;
}[] = [
  { id: "all", label: "All props" },
  { id: "furniture", label: "Furniture" },
  { id: "nature", label: "Nature" },
  { id: "dungeon", label: "Dungeon" },
  { id: "camp", label: "Camp" },
];

export const BUILTIN_PROPS: BuiltinProp[] = [
  {
    id: "crate",
    name: "Crate",
    category: "furniture",
    description: "A sturdy wooden crate. Good for cover or a hidden stash.",
    imageUrl: "/props/crate.svg",
    squaresW: 1,
    squaresH: 1,
  },
  {
    id: "barrel",
    name: "Barrel",
    category: "furniture",
    description: "A banded barrel of ale, water, or something less pleasant.",
    imageUrl: "/props/barrel.svg",
    squaresW: 1,
    squaresH: 1,
  },
  {
    id: "table",
    name: "Table",
    category: "furniture",
    description: "A long wooden table for planning, meals, or flipping.",
    imageUrl: "/props/table.svg",
    squaresW: 2,
    squaresH: 1,
  },
  {
    id: "bed",
    name: "Bed",
    category: "furniture",
    description: "A simple bed with a pillow and blanket.",
    imageUrl: "/props/bed.svg",
    squaresW: 2,
    squaresH: 1,
  },
  {
    id: "tree",
    name: "Tree",
    category: "nature",
    description: "A broad leafy tree canopy for forests and overgrown ruins.",
    imageUrl: "/props/tree.svg",
    squaresW: 3,
    squaresH: 3,
  },
  {
    id: "bush",
    name: "Bush",
    category: "nature",
    description: "A dense bush that can hide a small creature or a clue.",
    imageUrl: "/props/bush.svg",
    squaresW: 1,
    squaresH: 1,
  },
  {
    id: "boulder",
    name: "Boulder",
    category: "nature",
    description: "A large mossy boulder. Solid cover and a natural obstacle.",
    imageUrl: "/props/boulder.svg",
    squaresW: 2,
    squaresH: 2,
  },
  {
    id: "pillar",
    name: "Pillar",
    category: "dungeon",
    description: "A carved stone pillar from a crypt, temple, or ruined hall.",
    imageUrl: "/props/pillar.svg",
    squaresW: 1,
    squaresH: 1,
  },
  {
    id: "statue",
    name: "Statue",
    category: "dungeon",
    description: "A weathered statue on a stone plinth.",
    imageUrl: "/props/statue.svg",
    squaresW: 1,
    squaresH: 2,
  },
  {
    id: "rubble",
    name: "Rubble",
    category: "dungeon",
    description: "A pile of broken stone and debris. Difficult ground or cover.",
    imageUrl: "/props/rubble.svg",
    squaresW: 2,
    squaresH: 1,
  },
  {
    id: "campfire",
    name: "Campfire",
    category: "camp",
    description: "A small fire with logs. A natural campsite centerpiece.",
    imageUrl: "/props/campfire.svg",
    squaresW: 1,
    squaresH: 1,
  },
  {
    id: "tent",
    name: "Tent",
    category: "camp",
    description: "A canvas tent with a dark entrance.",
    imageUrl: "/props/tent.svg",
    squaresW: 3,
    squaresH: 2,
  },
  {
    id: "cart",
    name: "Cart",
    category: "camp",
    description: "A wooden handcart with two wheels.",
    imageUrl: "/props/cart.svg",
    squaresW: 2,
    squaresH: 1,
  },
  {
    id: "banner",
    name: "Banner",
    category: "camp",
    description: "A planted banner marking a camp, regiment, or claim.",
    imageUrl: "/props/banner.svg",
    squaresW: 1,
    squaresH: 1,
  },
];

export function builtinPropCategoryLabel(category: BuiltinPropCategory): string {
  return BUILTIN_PROP_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}
