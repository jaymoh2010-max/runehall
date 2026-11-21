import type { TypedServer } from "./socket";
import { getCharacter, getUser } from "./access";
import { contextForDraft } from "./compendium";
import { db, type CharacterRow, type TokenRow } from "./db";
import { serializeMessage, serializeToken, touchCampaign } from "./serialize";
import { tokenBroadcaster } from "./tokenEvents";
import { characterSummary, normalizeCharacterDraft } from "../shared/rules";
import { conditionsFromSheet } from "../shared/tokens";
import { resolveEndOfTurn, resolveStartOfTurn } from "../shared/turnAutomation";
import type { CharacterDraft, InitiativeEntry, RollResult } from "../shared/types";
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
  characterId: string,
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
    JSON.stringify({ ...result, characterId }),
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
  for (const token of linkedTokens) {
    db.prepare(
      "UPDATE tokens SET name = ?, hp_max = ?, hp_current = ?, ac = ?, conditions = ?, updated_at = ? WHERE id = ?"
    ).run(draft.name, summary.hp, nextHp, summary.ac, conditions, ts, token.id);
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

export function runTurnEnd(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry | undefined,
  round: number
): void {
  const seen = new Set<string>();
  for (const token of entryTokens(entry)) {
    const characterId = token.character_id;
    if (!characterId || seen.has(characterId)) continue;
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
        postAutomationRoll(io, campaignId, character.id, roll.damage, Boolean(token.hidden));
        if (roll.flatCheck) {
          postAutomationRoll(io, campaignId, character.id, roll.flatCheck, Boolean(token.hidden));
        }
      }
      if (result.changed) persistCharacterDraft(io, campaignId, character, result.draft);
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
    const characterId = token.character_id;
    if (!characterId || seen.has(characterId)) continue;
    seen.add(characterId);
    if (!claimTurnMark(campaignId, `${round}:${entry!.id}:${characterId}:start`)) continue;
    const character = getCharacter(characterId);
    if (!character) continue;
    try {
      const draft = normalizeCharacterDraft(parseJson(character.data, {}), character.name);
      const result = resolveStartOfTurn(draft, { labelPrefix: character.name });
      if (result.recovery) {
        postAutomationRoll(io, campaignId, character.id, result.recovery, Boolean(token.hidden));
      }
      if (result.changed) persistCharacterDraft(io, campaignId, character, result.draft);
    } catch (error) {
      // A malformed draft should not block the initiative advance.
      console.error("[turn-effects] start-of-turn failed", error);
    }
  }
}
