import type { Token } from "./types";

/**
 * Creature defenses belong to the GM. Linked character tokens keep their
 * stats because party HP/AC is part of the shared character sheet.
 */
export function canSeeCreatureStats(token: Pick<Token, "characterId">, isGm: boolean): boolean {
  return isGm || Boolean(token.characterId);
}

/** Strip creature defenses before a token payload reaches a player socket. */
export function redactTokenForPlayers(token: Token): Token {
  if (canSeeCreatureStats(token, false)) return token;
  return { ...token, hpCurrent: null, hpMax: null, ac: null };
}
