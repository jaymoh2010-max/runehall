import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { creatureAvatarUrl } from "../src/shared/creatureAvatar";

const avatar = (name: string, traits: string[]) => creatureAvatarUrl({ name, traits });

describe("creature archetype avatars", () => {
  it("matches broad bestiary archetypes", () => {
    expect(avatar("Adult Red Dragon", ["dragon", "fire"])).toBe("/tokens/creature/dragon.svg");
    expect(avatar("Cavern Troll", ["giant", "humanoid", "troll"])).toBe(
      "/tokens/creature/troll.svg"
    );
    expect(avatar("Giant Bat", ["animal", "bat"])).toBe("/tokens/creature/bat.svg");
    expect(avatar("Shambling Zombie", ["undead", "zombie"])).toBe("/tokens/creature/undead.svg");
    expect(avatar("Ancient Skeleton", ["skeleton", "undead"])).toBe(
      "/tokens/creature/skeleton.svg"
    );
    expect(avatar("Fire Elemental", ["elemental", "fire"])).toBe(
      "/tokens/creature/elemental-fire.svg"
    );
    expect(avatar("Stone Golem", ["construct", "golem"])).toBe("/tokens/creature/construct.svg");
  });

  it("falls back to the generic creature icon", () => {
    expect(avatar("Something Unclassifiable", ["unknown"])).toBe("/tokens/creature/default.svg");
  });

  it("ships every referenced icon", () => {
    for (const file of [
      "dragon",
      "troll",
      "bat",
      "undead",
      "skeleton",
      "elemental-fire",
      "construct",
      "default",
    ]) {
      expect(fs.existsSync(`public/tokens/creature/${file}.svg`)).toBe(true);
    }
  });

  it("maps every bestiary creature to an existing icon", () => {
    const monsters = JSON.parse(fs.readFileSync("data/compendium/monsters.json", "utf8")) as {
      name: string;
      traits: string[];
    }[];
    const urls = new Set(monsters.map((monster) => creatureAvatarUrl(monster)));
    for (const url of urls) {
      expect(fs.existsSync(`public${url}`), url).toBe(true);
    }
  });
});
