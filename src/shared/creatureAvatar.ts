import type { Monster } from "./types";

/**
 * Map bestiary creatures to the bundled game-icons.net archetype art. The
 * SVGs are white-on-transparent, so the token's dark disc shows through.
 */
export function creatureAvatarUrl(monster: Pick<Monster, "name" | "traits">): string {
  const traits = new Set(monster.traits.map((trait) => trait.toLowerCase()));
  const name = monster.name.toLowerCase();
  const has = (...values: string[]) => values.some((value) => traits.has(value));
  const named = (...values: string[]) => values.some((value) => name.includes(value));
  const icon = (slug: string) => `/tokens/creature/${slug}.svg`;

  if (has("hydra") || named("hydra")) return icon("hydra");
  if (has("dragon", "wyvern") || named("dragon", "wyvern", "drake")) return icon("dragon");
  if (has("troll") || named("troll")) return icon("troll");
  if (has("werewolf", "lycanthrope") || named("werewolf", "lycanthrope")) return icon("werewolf");
  if (has("bat") || named("bat")) return icon("bat");
  if (has("vampire") || named("vampire")) return icon("vampire");
  if (has("mummy") || named("mummy")) return icon("mummy");
  if (has("skeleton") || named("skeleton")) return icon("skeleton");
  if (has("ghost", "spectre", "wraith", "incorporeal") || named("ghost", "wraith", "spectre")) {
    return icon("ghost");
  }
  if (has("undead", "zombie", "lich") || named("zombie", "lich")) return icon("undead");

  if (has("fiend", "demon", "devil", "daemon") || named("demon", "devil", "fiend")) {
    return icon("fiend");
  }
  if (has("celestial", "angel", "archon", "azata") || named("angel", "archon", "azata")) {
    return icon("celestial");
  }
  if (has("fey", "fairy", "sprite") || named("fey", "fairy", "sprite")) return icon("fey");

  if (has("giant", "ogre", "cyclops", "titan") || named("giant", "ogre", "cyclops", "titan")) {
    return icon("giant");
  }
  if (has("construct", "golem", "clockwork", "automaton") || named("golem", "construct")) {
    return icon("construct");
  }

  if (has("fire") || named("fire", "flame", "inferno")) return icon("elemental-fire");
  if (has("water") || named("water", "tide", "wave")) return icon("elemental-water");
  if (has("earth", "stone") || named("earth", "stone")) return icon("elemental-earth");
  if (has("air", "wind") || named("air", "wind")) return icon("elemental-air");
  if (has("ice", "cold") || named("ice", "frost", "cold")) return icon("elemental-ice");
  if (has("electricity", "lightning") || named("lightning", "thunder")) {
    return icon("elemental-lightning");
  }
  if (has("elemental") || named("elemental")) return icon("elemental-fire");

  if (has("ooze", "slime") || named("ooze", "slime")) return icon("ooze");
  if (has("fungus", "mushroom") || named("fungus", "mushroom", "leshy")) return icon("fungus");
  if (has("plant", "tree") || named("plant", "tree", "vine")) return icon("plant");
  if (has("aberration", "tentacle") || named("aberration", "tentacle")) return icon("aberration");
  if (has("swarm") || named("swarm")) return icon("swarm");
  if (has("insect") || named("insect", "beetle", "wasp", "ant")) return icon("insect");
  if (has("spider", "arachnid", "vermin") || named("spider", "arachnid")) return icon("vermin");
  if (has("aquatic", "fish", "shark", "amphibious") || named("fish", "shark", "kraken", "squid")) {
    return icon("aquatic");
  }
  if (has("snake", "serpent") || named("snake", "cobra", "viper", "serpent")) return icon("snake");
  if (has("reptile", "lizard") || named("lizard", "sauropod", "dinosaur")) return icon("reptile");

  if (has("minotaur") || named("minotaur")) return icon("minotaur");
  if (has("harpy") || named("harpy")) return icon("harpy");
  if (has("unicorn") || named("unicorn")) return icon("unicorn");
  if (has("griffin", "griffon") || named("griffin", "griffon")) return icon("griffin");

  if (has("goblin") || named("goblin")) return icon("goblin");
  if (has("orc") || named("orc")) return icon("orc");
  if (has("dwarf") || named("dwarf")) return icon("dwarf");
  if (has("elf") || named("elf")) return icon("elf");
  if (has("humanoid", "human") || named("human")) return icon("humanoid");

  if (named("bear")) return icon("bear");
  if (named("boar", "pig")) return icon("boar");
  if (named("bird", "eagle", "hawk", "raven", "crow", "owl")) return icon("bird");
  if (has("animal", "beast") || named("wolf", "hound", "cat", "beast")) return icon("beast");

  return icon("default");
}

/**
 * Procedural fallback for unlinked tokens that are not bestiary creatures
 * (custom markers, NPCs without a monster id, and so on).
 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function creatureAvatarDataUrl(name: string, key = name): string {
  const hash = hashString(key || name || "creature");
  const hue = hash % 360;
  const accentHue = (hue + 26 + ((hash >>> 8) % 80)) % 360;
  const eyeHue = (hue + 170 + ((hash >>> 15) % 60)) % 360;
  const headWidth = 29 + ((hash >>> 4) % 9);
  const headHeight = 27 + ((hash >>> 9) % 7);
  const horns = (hash >>> 12) % 3;
  const threeEyes = ((hash >>> 17) & 1) === 1;
  const mouthCurve = 80 + ((hash >>> 20) % 8);
  const teeth = 3 + ((hash >>> 22) % 3);

  const hornMarkup =
    horns === 1
      ? `
        <path d="M39 36 Q24 22 22 5 Q39 19 49 31 Z" fill="hsl(${accentHue}, 42%, 26%)" stroke="hsl(${accentHue}, 38%, 48%)" stroke-width="1.5"/>
        <path d="M89 36 Q104 22 106 5 Q89 19 79 31 Z" fill="hsl(${accentHue}, 42%, 26%)" stroke="hsl(${accentHue}, 38%, 48%)" stroke-width="1.5"/>`
      : horns === 2
        ? `
        <path d="M42 34 L30 8 L50 28 Z" fill="hsl(${accentHue}, 46%, 30%)"/>
        <path d="M86 34 L98 8 L78 28 Z" fill="hsl(${accentHue}, 46%, 30%)"/>`
        : "";

  const eyes = [
    `<circle cx="49" cy="57" r="8" fill="hsl(${eyeHue}, 95%, 70%)"/><circle cx="49" cy="57" r="3.4" fill="#090d12"/>`,
    `<circle cx="79" cy="57" r="8" fill="hsl(${eyeHue}, 95%, 70%)"/><circle cx="79" cy="57" r="3.4" fill="#090d12"/>`,
    ...(threeEyes
      ? [
          `<circle cx="64" cy="42" r="5.5" fill="hsl(${eyeHue}, 95%, 76%)"/><circle cx="64" cy="42" r="2.3" fill="#090d12"/>`,
        ]
      : []),
  ].join("");

  const toothMarkup = Array.from({ length: teeth }, (_value, index) => {
    const x = 48 + (index * 32) / Math.max(1, teeth - 1);
    const height = 5 + ((hash >>> (index + 2)) % 4);
    return `<path d="M${x - 3} ${mouthCurve - 1} L${x} ${mouthCurve + height} L${x + 3} ${mouthCurve - 1} Z" fill="#e9e2d0" opacity="0.9"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="82%">
      <stop offset="0%" stop-color="hsl(${accentHue}, 40%, 34%)"/>
      <stop offset="100%" stop-color="hsl(${hue}, 36%, 9%)"/>
    </radialGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 30%, 42%)"/>
      <stop offset="100%" stop-color="hsl(${hue}, 36%, 20%)"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  <ellipse cx="64" cy="126" rx="55" ry="35" fill="rgba(0,0,0,0.4)"/>
  ${hornMarkup}
  <ellipse cx="64" cy="60" rx="${headWidth}" ry="${headHeight}" fill="url(#skin)" stroke="hsl(${hue}, 30%, 56%)" stroke-width="2"/>
  <path d="M30 58 Q22 54 18 46 Q28 46 34 52" fill="hsl(${hue}, 30%, 30%)"/>
  <path d="M98 58 Q106 54 110 46 Q100 46 94 52" fill="hsl(${hue}, 30%, 30%)"/>
  ${eyes}
  <path d="M46 ${mouthCurve - 2} Q64 ${mouthCurve + 10} 82 ${mouthCurve - 2} Q64 ${mouthCurve + 18} 46 ${mouthCurve - 2} Z" fill="#090d12"/>
  ${toothMarkup}
  <circle cx="35" cy="74" r="2.4" fill="hsl(${accentHue}, 55%, 58%)" opacity="0.55"/>
  <circle cx="93" cy="70" r="1.8" fill="hsl(${accentHue}, 55%, 58%)" opacity="0.45"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
