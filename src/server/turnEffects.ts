import type { TypedServer } from "./socket";
import { getCharacter, getUser } from "./access";
import { contextForDraft } from "./compendium";
import { db, type CharacterRow, type TokenRow } from "./db";
import { serializeMessage, serializeToken, touchCampaign } from "./serialize";
import { tokenBroadcaster } from "./tokenEvents";
import { characterSummary, computeCharacter, normalizeCharacterDraft } from "../shared/rules";
import { conditionsFromSheet, normalizeTokenConditions } from "../shared/tokens";
import {
  resolveEndOfTurn,
  resolveStartOfTurn,
  resolveTokenEndOfTurn,
} from "../shared/turnAutomation";
import { normalizeTokenTurnEffects, tokenTurnHealing } from "../shared/tokenTurnEffects";
import { characterTokenTurnEffects } from "../shared/characterTurnEffects";
import { resolveAfflictionTurnEnd } from "../shared/afflictions";
import type {
  CharacterDraft,
  InitiativeEntry,
  RollResult,
  TokenCondition,
  TokenTurnEffects,
} from "../shared/types";
import { applyHpEditToState } from "../shared/damage";
import { newId, now, parseJson } from "./util";

const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
const gmRoom = (campaignId: string) => `gm:${campaignId}`;

function broadcastToken(
  io: TypedServer,
  campaignId: string,
  token: TokenRow,
  previousHidden: boolean
): void {
  const owner = token.owner_id ? getUser(token.owner_id) : null;
  const emitTo = (roomName: string, event: string, payload: unknown) => {
    (io.to(roomName) as unknown as { emit: (name: string, value: unknown) => void }).emit(
      event,
      payload
    );
  };
  const emitToPlayers = (event: string, payload: unknown) => {
    (
      io.to(campaignRoom(campaignId)).except(gmRoom(campaignId)) as unknown as {
        emit: (name: string, value: unknown) => void;
      }
    ).emit(event, payload);
  };
  const events = tokenBroadcaster((event, payload, target = "all") => {
    if (target === "gm") emitTo(gmRoom(campaignId), event, payload);
    else if (target === "players") emitToPlayers(event, payload);
    else emitTo(campaignRoom(campaignId), event, payload);
  });
  events.updated(serializeToken(token, owner?.display_name ?? undefined), previousHidden);
}

function tokenRow(tokenId: string): TokenRow | null {
  return (
    (db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow | undefined) ?? null
  );
}

function entryTokens(entry: InitiativeEntry | undefined): TokenRow[] {
  if (!entry) return [];
  if (entry.groupId && entry.sceneId) {
    return db
      .prepare(
        "SELECT * FROM tokens WHERE scene_id = ? AND group_id = ? ORDER BY sort_order ASC, created_at ASC"
      )
      .all(entry.sceneId, entry.groupId) as TokenRow[];
  }
  if (!entry.tokenId) return [];
  const row = tokenRow(entry.tokenId);
  return row ? [row] : [];
}

function claimTurnMark(campaignId: string, mark: string): boolean {
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO campaign_turn_marks (campaign_id, mark, created_at) VALUES (?, ?, ?)"
    )
    .run(campaignId, mark, now());
  return Number(result.changes) > 0;
}

function postAutomationRoll(
  io: TypedServer,
  campaignId: string,
  actor: { characterId?: string; tokenId?: string },
  result: RollResult,
  hidden: boolean
): void {
  const id = newId("msg");
  const visibility = hidden ? "gm" : "all";
  db.prepare(
    "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, NULL, ?, 'roll', ?, ?, ?, ?)"
  ).run(
    id,
    campaignId,
    "Turn automation",
    result.label || result.formula,
    JSON.stringify({
      ...result,
      characterId: actor.characterId ?? null,
      tokenId: actor.tokenId ?? null,
    }),
    visibility,
    now()
  );
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Parameters<
    typeof serializeMessage
  >[0];
  const message = serializeMessage(row);
  if (hidden) io.to(gmRoom(campaignId)).emit("chat:message", message);
  else io.to(campaignRoom(campaignId)).emit("chat:message", message);
}

function postAutomationNote(
  io: TypedServer,
  campaignId: string,
  text: string,
  hidden: boolean
): void {
  const id = newId("msg");
  const visibility = hidden ? "gm" : "all";
  db.prepare(
    "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, NULL, ?, 'chat', ?, NULL, ?, ?)"
  ).run(id, campaignId, "Turn automation", text, visibility, now());
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Parameters<
    typeof serializeMessage
  >[0];
  const message = serializeMessage(row);
  if (hidden) io.to(gmRoom(campaignId)).emit("chat:message", message);
  else io.to(campaignRoom(campaignId)).emit("chat:message", message);
}

function persistCharacterDraft(
  io: TypedServer,
  campaignId: string,
  character: CharacterRow,
  draft: CharacterDraft
): void {
  const summary = characterSummary(draft, contextForDraft(draft));
  const ts = now();
  db.prepare(
    "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
  ).run(JSON.stringify(draft), JSON.stringify(summary), ts, character.id);

  const linkedTokens = db
    .prepare("SELECT * FROM tokens WHERE character_id = ?")
    .all(character.id) as TokenRow[];
  const nextHp =
    draft.play.hp === null
      ? summary.hp
      : Math.max(0, Math.min(summary.hp, Math.round(draft.play.hp)));
  const conditions = JSON.stringify(conditionsFromSheet(draft.play.conditions));
  const turnEffects = JSON.stringify(characterTokenTurnEffects(draft.play));
  for (const token of linkedTokens) {
    db.prepare(
      "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, conditions = ?, turn_effects = ?, updated_at = ? WHERE id = ?"
    ).run(draft.name, summary.hp, nextHp, summary.ac, conditions, turnEffects, ts, token.id);
    const updated = tokenRow(token.id);
    if (updated) broadcastToken(io, campaignId, updated, Boolean(token.hidden));
  }
  io.to(campaignRoom(campaignId)).emit("character:updated", {
    characterId: character.id,
    summary,
    name: draft.name,
  });
  touchCampaign(campaignId);
}

function tokenConditions(token: TokenRow): TokenCondition[] {
  return normalizeTokenConditions(parseJson(token.conditions, []));
}

function saveUnlinkedToken(
  io: TypedServer,
  campaignId: string,
  token: TokenRow,
  update: {
    hp: number | null;
    conditions: TokenCondition[];
    turnEffects: TokenTurnEffects;
  }
): void {
  db.prepare(
    "UPDATE tokens SET hp_current = ?, conditions = ?, turn_effects = ?, updated_at = ? WHERE id = ?"
  ).run(
    update.hp,
    JSON.stringify(update.conditions),
    JSON.stringify(update.turnEffects),
    now(),
    token.id
  );
  const updated = tokenRow(token.id);
  if (updated) broadcastToken(io, campaignId, updated, Boolean(token.hidden));
  touchCampaign(campaignId);
}

export function runTurnEnd(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry | undefined,
  round: number
): void {
  const seen = new Set<string>();
  for (const token of entryTokens(entry)) {
    if (!token.character_id) {
      const effects = normalizeTokenTurnEffects(parseJson(token.turn_effects, {}));
      if (!effects.persistentDamage.length) continue;
      if (!claimTurnMark(campaignId, `tok:${round}:${entry!.id}:${token.id}:end`)) {
        continue;
      }
      try {
        const conditions = tokenConditions(token);
        const dead = conditions.some((condition) => condition.name.trim().toLowerCase() === "dead");
        const result = resolveTokenEndOfTurn(effects, { labelPrefix: token.name }, dead);
        for (const roll of result.rolls) {
          postAutomationRoll(
            io,
            campaignId,
            { tokenId: token.id },
            roll.damage,
            Boolean(token.hidden)
          );
          if (roll.flatCheck) {
            postAutomationRoll(
              io,
              campaignId,
              { tokenId: token.id },
              roll.flatCheck,
              Boolean(token.hidden)
            );
          }
        }
        if (!result.changed) continue;
        let hp = token.hp_current;
        let nextConditions = conditions;
        if (result.totalDamage > 0 && token.hp_max !== null) {
          const applied = applyHpEditToState({ hp: token.hp_current, conditions }, token.hp_max, {
            type: "damage",
            amount: result.totalDamage,
          });
          hp = applied.draft.play.hp;
          nextConditions = applied.draft.play.conditions as TokenCondition[];
        }
        saveUnlinkedToken(io, campaignId, token, {
          hp,
          conditions: nextConditions,
          turnEffects: { ...effects, persistentDamage: result.remaining },
        });
      } catch (error) {
        console.error("[turn-effects] unlinked end-of-turn failed", error);
      }
      continue;
    }

    const characterId = token.character_id;
    if (seen.has(characterId)) continue;
    seen.add(characterId);
    if (!claimTurnMark(campaignId, `${round}:${entry!.id}:${characterId}:end`)) continue;
    const character = getCharacter(characterId);
    if (!character) continue;
    try {
      const draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
      const summary = characterSummary(draft, contextForDraft(draft));
      const result = resolveEndOfTurn(draft, summary.hp, {
        labelPrefix: character.name,
      });
      for (const roll of result.rolls) {
        postAutomationRoll(
          io,
          campaignId,
          { characterId: character.id },
          roll.damage,
          Boolean(token.hidden)
        );
        if (roll.flatCheck) {
          postAutomationRoll(
            io,
            campaignId,
            { characterId: character.id },
            roll.flatCheck,
            Boolean(token.hidden)
          );
        }
      }
      let nextDraft = result.draft;
      let changed = result.changed;
      if (nextDraft.play.afflictions.length && !result.dead) {
        const derived = computeCharacter(nextDraft, contextForDraft(nextDraft));
        const afflictions = resolveAfflictionTurnEnd(nextDraft, derived.saves, {
          labelPrefix: character.name,
        });
        for (const roll of afflictions.rolls) {
          postAutomationRoll(
            io,
            campaignId,
            { characterId: character.id },
            roll,
            Boolean(token.hidden)
          );
        }
        if (afflictions.notes.length) {
          postAutomationNote(io, campaignId, afflictions.notes.join(" "), Boolean(token.hidden));
        }
        if (afflictions.changed) {
          nextDraft = afflictions.draft;
          changed = true;
        }
      }
      if (changed) persistCharacterDraft(io, campaignId, character, nextDraft);
    } catch (error) {
      // A malformed draft should not block the initiative advance.
      console.error("[turn-effects] end-of-turn failed", error);
    }
  }
}

export function runTurnStart(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry | undefined,
  round: number
): void {
  const seen = new Set<string>();
  for (const token of entryTokens(entry)) {
    if (!token.character_id) {
      const effects = normalizeTokenTurnEffects(parseJson(token.turn_effects, {}));
      const conditions = tokenConditions(token);
      const healing = tokenTurnHealing(effects, conditions);
      if (healing <= 0 || token.hp_max === null) continue;
      if (!claimTurnMark(campaignId, `tok:${round}:${entry!.id}:${token.id}:start`)) {
        continue;
      }
      try {
        if (token.hp_current !== null && token.hp_current >= token.hp_max) continue;
        const applied = applyHpEditToState({ hp: token.hp_current, conditions }, token.hp_max, {
          type: "heal",
          amount: healing,
        });
        if (!applied.changed) continue;
        saveUnlinkedToken(io, campaignId, token, {
          hp: applied.draft.play.hp,
          conditions: applied.draft.play.conditions as TokenCondition[],
          turnEffects: effects,
        });
        postAutomationNote(
          io,
          campaignId,
          `${token.name} heals ${applied.healed} HP from fast healing or regeneration.`,
          Boolean(token.hidden)
        );
      } catch (error) {
        console.error("[turn-effects] unlinked start-of-turn failed", error);
      }
      continue;
    }

    const characterId = token.character_id;
    if (seen.has(characterId)) continue;
    seen.add(characterId);
    if (!claimTurnMark(campaignId, `${round}:${entry!.id}:${characterId}:start`)) continue;
    const character = getCharacter(characterId);
    if (!character) continue;
    try {
      const draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
      const summary = characterSummary(draft, contextForDraft(draft));
      const result = resolveStartOfTurn(draft, summary.hp, { labelPrefix: character.name });
      if (result.healing > 0) {
        postAutomationNote(
          io,
          campaignId,
          `${character.name} regains ${result.healing} HP from fast healing or regeneration.`,
          Boolean(token.hidden)
        );
      }
      if (result.heroicRecoveryAvailable) {
        postAutomationNote(
          io,
          campaignId,
          `${character.name} is dying with Heroic Recovery available. Roll a recovery check or spend all Hero Points.`,
          Boolean(token.hidden)
        );
      }
      if (result.recovery) {
        postAutomationRoll(
          io,
          campaignId,
          { characterId: character.id },
          result.recovery,
          Boolean(token.hidden)
        );
      }
      if (result.changed) persistCharacterDraft(io, campaignId, character, result.draft);
    } catch (error) {
      // A malformed draft should not block the initiative advance.
      console.error("[turn-effects] start-of-turn failed", error);
    }
  }
}
