import { describe, expect, it } from "vitest";
import type { Token } from "../src/shared/types";
import { canSeeCreatureStats, redactTokenForPlayers } from "../src/shared/tokenVisibility";

const creature = {
  id: "token-1",
  characterId: null,
  hpCurrent: 21,
  hpMax: 60,
  ac: 18,
} as Token;

const character = {
  ...creature,
  id: "token-2",
  characterId: "char-1",
} as Token;

describe("creature token visibility", () => {
  it("shows creature defenses to the GM only", () => {
    expect(canSeeCreatureStats(creature, true)).toBe(true);
    expect(canSeeCreatureStats(creature, false)).toBe(false);
    expect(canSeeCreatureStats(character, false)).toBe(true);
  });

  it("redacts HP and AC from player creature payloads", () => {
    const redacted = redactTokenForPlayers(creature);
    expect(redacted.hpCurrent).toBeNull();
    expect(redacted.hpMax).toBeNull();
    expect(redacted.ac).toBeNull();
    expect(redacted.name).toBe(creature.name);
  });

  it("keeps linked character stats for players", () => {
    expect(redactTokenForPlayers(character)).toBe(character);
  });
});
