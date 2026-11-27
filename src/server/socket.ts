import type { Server, Socket } from "socket.io";
import { getCampaignRole, getCharacter, getMembership, getUser } from "./access";
import { monsters } from "./compendium";
import { contextForCharacter } from "./campaignContext";
import { db, type CampaignRow, type MessageRow, type SceneRow, type TokenRow } from "./db";
import { SESSION_COOKIE, userFromCookieHeader } from "./auth";
import {
  now,
  newId,
  safeInt,
  safeString,
  parseJson,
  parseCookies,
  sha256,
  clamp,
  sanitizeUserText,
} from "./util";
import { characterSummary, computeCharacter, normalizeCharacterDraft } from "../shared/rules";
import { rollFormula, upgradeDegreeOfSuccess, validateFormula } from "../shared/dice";
import {
  normalizeTokenConditions,
  sheetConditionsFromToken,
  syncLifeConditions,
} from "../shared/tokens";
import { applyHpEditToDraft, applyHpEditToState } from "../shared/damage";
import { applyDamageDefenses } from "../shared/damageDefenses";
import {
  filterInitiativeForPlayers,
  renameInitiativeEntries,
  sortInitiativeEntries,
} from "../shared/initiative";
import {
  normalizeAoeTemplate,
  normalizeAoeTemplates,
  unexpiredAoeTemplates,
} from "../shared/templates";
import { normalizeWalls } from "../shared/walls";
import { normalizeSceneProps } from "../shared/props";
import {
  canEraseDrawing,
  DRAWING_LIMIT,
  normalizeSceneDrawing,
  normalizeSceneDrawings,
} from "../shared/drawings";
import { normalizeLightColor, normalizeTokenVisionMode } from "../shared/lighting";
import { normalizeTokenTurnEffects } from "../shared/tokenTurnEffects";
import { characterTokenTurnEffects } from "../shared/characterTurnEffects";
import {
  resolveEndOfTurn,
  resolveStartOfTurn,
  resolveTokenEndOfTurn,
} from "../shared/turnAutomation";
import { resolveAfflictionTurnEnd } from "../shared/afflictions";
import type {
  CharacterDraft,
  CharacterSummary,
  ClientToServerEvents,
  InitiativeEntry,
  PresenceUser,
  PublicUser,
  RollResult,
  ServerToClientEvents,
  Token,
} from "../shared/types";
import {
  serializeAudioState,
  serializeInitiative,
  serializeMessage,
  serializeScene,
  serializeSceneForPlayers,
  serializeToken,
  touchCampaign,
} from "./serialize";
import { sceneVisible, tokenBroadcaster } from "./tokenEvents";

interface SocketData {
  user: PublicUser;
  sessionHash: string;
  campaigns: Set<string>;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const presence = new Map<string, Map<string, PresenceUser>>();

function room(campaignId: string): string {
  return `campaign:${campaignId}`;
}
function gmRoom(campaignId: string): string {
  return `gm:${campaignId}`;
}

function socketTokenEvents(io: TypedServer, campaignId: string) {
  const emitTo = (roomName: string, event: string, payload: unknown) => {
    (io.to(roomName) as unknown as { emit: (name: string, value: unknown) => void }).emit(
      event,
      payload
    );
  };
  const emitToPlayers = (event: string, payload: unknown) => {
    (
      io.to(room(campaignId)).except(gmRoom(campaignId)) as unknown as {
        emit: (name: string, value: unknown) => void;
      }
    ).emit(event, payload);
  };
  return tokenBroadcaster((event, payload, target = "all") => {
    if (target === "gm") emitTo(gmRoom(campaignId), event, payload);
    else if (target === "players") emitToPlayers(event, payload);
    else emitTo(room(campaignId), event, payload);
  }, sceneVisible);
}

function presenceList(campaignId: string): PresenceUser[] {
  return [...(presence.get(campaignId)?.values() ?? [])];
}

function emitPresence(io: TypedServer, campaignId: string): void {
  io.to(room(campaignId)).emit("presence:update", presenceList(campaignId));
}

function sendError(socket: TypedSocket, message: string): void {
  socket.emit("error:toast", { message });
}

function requireGm(socket: TypedSocket, campaignId: string): boolean {
  if (getCampaignRole(campaignId, socket.data.user.id) !== "gm") {
    sendError(socket, "Only the GM can do that.");
    return false;
  }
  return true;
}

/**
 * Register a socket listener that cannot take the process down. A stale or
 * malformed client payload is reported back to its sender instead of becoming
 * an uncaught exception that disconnects the whole table.
 */
const socketEventBuckets = new WeakMap<object, { count: number; resetAt: number }>();

function socketSessionActive(socket: TypedSocket): boolean {
  if (!socket.data.sessionHash) return false;
  const row = db
    .prepare(
      `SELECT 1 AS active FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.user_id = ? AND s.expires_at > ?
         AND u.disabled_at IS NULL`
    )
    .get(socket.data.sessionHash, socket.data.user.id, now()) as { active: number } | undefined;
  return Boolean(row?.active);
}

function onSocket<E extends keyof ClientToServerEvents>(
  socket: TypedSocket,
  event: E,
  handler: ClientToServerEvents[E]
): void {
  const guarded = ((...args: unknown[]) => {
    const timestamp = Date.now();
    let bucket = socketEventBuckets.get(socket);
    if (!bucket || timestamp >= bucket.resetAt) {
      bucket = { count: 0, resetAt: timestamp + 10_000 };
      socketEventBuckets.set(socket, bucket);
    }
    bucket.count += 1;
    if (bucket.count > 600) {
      sendError(socket, "Too many table actions. Wait a moment and try again.");
      return;
    }
    try {
      (handler as unknown as (...values: unknown[]) => void)(...args);
    } catch (error) {
      console.error(`[socket] ${String(event)} failed`, error);
      sendError(socket, "That action could not be completed. Refresh and try again.");
    }
  }) as ClientToServerEvents[E];
  socket.on(event, guarded as never);
}

function sceneBelongs(sceneId: string, campaignId: string): SceneRow | null {
  const row = db
    .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
    .get(sceneId, campaignId) as SceneRow | undefined;
  return row ?? null;
}

function tokenRow(tokenId: string): TokenRow | null {
  return (
    (db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow | undefined) ?? null
  );
}

function tokenWithOwner(row: TokenRow): Token {
  const owner = row.owner_id ? getUser(row.owner_id) : null;
  return serializeToken(row, owner?.display_name ?? undefined);
}

/** Character save events carry the full draft so the table stays in sync. */
function characterUpdatedPayload(
  characterId: string,
  draft: CharacterDraft,
  summary: CharacterSummary
) {
  const row = db.prepare("SELECT revision FROM characters WHERE id = ?").get(characterId) as
    { revision: number } | undefined;
  return {
    characterId,
    summary,
    name: draft.name,
    data: draft,
    revision: Number(row?.revision ?? 0),
  };
}

function addPresence(socket: TypedSocket, campaignId: string, role: "gm" | "player"): void {
  if (!presence.has(campaignId)) presence.set(campaignId, new Map());
  presence.get(campaignId)!.set(socket.id, {
    userId: socket.data.user.id,
    socketId: socket.id,
    displayName: socket.data.user.displayName,
    role,
    avatarUrl: socket.data.user.avatarUrl,
  });
}

function removePresence(socket: TypedSocket, campaignId: string): void {
  presence.get(campaignId)?.delete(socket.id);
  if (presence.get(campaignId)?.size === 0) presence.delete(campaignId);
}

function ensureState(campaignId: string) {
  let state = db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(campaignId) as
    | {
        campaign_id: string;
        active_scene_id: string | null;
        initiative: string;
        round: number;
        turn_index: number;
      }
    | undefined;
  if (state) return state;
  const firstScene = db
    .prepare("SELECT id FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC LIMIT 1")
    .get(campaignId) as { id: string } | undefined;
  db.prepare(
    "INSERT INTO campaign_state (campaign_id, active_scene_id, initiative, round, turn_index, updated_at) VALUES (?, ?, '[]', 1, 0, ?)"
  ).run(campaignId, firstScene?.id ?? null, now());
  state = db
    .prepare("SELECT * FROM campaign_state WHERE campaign_id = ?")
    .get(campaignId) as typeof state;
  return state!;
}

function broadcastInitiative(
  io: TypedServer,
  campaignId: string,
  state: ReturnType<typeof ensureState>
): void {
  const fullEntries = serializeInitiative(JSON.parse(state.initiative || "[]"));
  const hiddenTokenIds = new Set(
    (
      db
        .prepare(
          `SELECT t.id FROM tokens t JOIN scenes s ON s.id = t.scene_id
           WHERE s.campaign_id = ? AND (t.hidden = 1 OR s.visible = 0)`
        )
        .all(campaignId) as { id: string }[]
    ).map((row) => row.id)
  );
  const hiddenSceneIds = new Set(
    (
      db.prepare("SELECT id FROM scenes WHERE campaign_id = ? AND visible = 0").all(campaignId) as {
        id: string;
      }[]
    ).map((row) => row.id)
  );
  const playerOrder = filterInitiativeForPlayers(
    fullEntries,
    hiddenTokenIds,
    state.turn_index,
    hiddenSceneIds
  );
  // Players never see a hidden combatant, even if it was rolled before being
  // hidden. The GM still receives the authoritative full order.
  io.to(room(campaignId)).except(gmRoom(campaignId)).emit("initiative:updated", {
    entries: playerOrder.entries,
    round: state.round,
    turnIndex: playerOrder.turnIndex,
  });
  io.to(gmRoom(campaignId)).emit("initiative:updated", {
    entries: fullEntries,
    round: state.round,
    turnIndex: state.turn_index,
  });
}

function broadcastSceneTemplates(
  io: TypedServer,
  campaignId: string,
  sceneId: string,
  templates: ReturnType<typeof normalizeAoeTemplates>
): void {
  if (sceneVisible(sceneId)) {
    io.to(room(campaignId))
      .except(gmRoom(campaignId))
      .emit("scene:templates", {
        sceneId,
        templates: templates.filter((entry) => !entry.hidden),
      });
  }
  io.to(gmRoom(campaignId)).emit("scene:templates", { sceneId, templates });
}

function broadcastSceneDrawings(
  io: TypedServer,
  campaignId: string,
  sceneId: string,
  drawings: ReturnType<typeof normalizeSceneDrawings>
): void {
  if (sceneVisible(sceneId)) {
    io.to(room(campaignId))
      .except(gmRoom(campaignId))
      .emit("scene:drawings", { sceneId, drawings });
  }
  io.to(gmRoom(campaignId)).emit("scene:drawings", { sceneId, drawings });
}

/** Remove spell areas whose round duration ended on the active scene. */
function expireSceneTemplates(io: TypedServer, campaignId: string, round: number): void {
  const state = ensureState(campaignId);
  if (!state.active_scene_id) return;
  const scene = db
    .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
    .get(state.active_scene_id, campaignId) as SceneRow | undefined;
  if (!scene) return;
  const templates = normalizeAoeTemplates(parseJson(scene.templates, []));
  const kept = unexpiredAoeTemplates(templates, round);
  if (kept.length === templates.length) return;
  db.prepare("UPDATE scenes SET templates = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(kept),
    now(),
    scene.id
  );
  broadcastSceneTemplates(io, campaignId, scene.id, kept);
  touchCampaign(campaignId);
}

export function broadcastCampaignInitiative(io: TypedServer, campaignId: string): void {
  broadcastInitiative(io, campaignId, ensureState(campaignId));
}

function initiativeBonusForToken(row: TokenRow): number {
  if (!row.character_id) return 0;
  const character = getCharacter(row.character_id);
  if (!character) return 0;
  try {
    const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    return computeCharacter(draft, contextForCharacter(character, draft)).initiative;
  } catch {
    return 0;
  }
}

function speedForToken(row: TokenRow): number | null {
  if (!row.character_id) return null;
  const character = getCharacter(row.character_id);
  if (!character) return null;
  const summary = parseJson(character.summary, null) as { speed?: unknown } | null;
  const speed = Number(summary?.speed);
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

function initiativeEntryForToken(row: TokenRow, value?: number): InitiativeEntry {
  const rolled = value ?? rollFormula("1d20", {}).d20 ?? 10;
  const bonus = row.initiative_bonus ?? initiativeBonusForToken(row);
  const total = value ?? rolled + bonus;
  return {
    id: newId("init"),
    tokenId: row.id,
    name: row.name,
    initiative: total,
    color: row.color,
    ownerId: row.owner_id,
    sceneId: row.scene_id,
    groupId: row.group_id,
    perception: bonus,
    movementUsed: 0,
    diagonalSteps: 0,
    actionsUsed: 0,
    reactionsUsed: 0,
  };
}

function initiativeEntryForGroup(rows: TokenRow[]): InitiativeEntry {
  const anchor = rows[0];
  const rolled = rollFormula("1d20", {}).d20 ?? 10;
  const bonus = anchor.initiative_bonus ?? initiativeBonusForToken(anchor);
  const baseName = anchor.group_name || anchor.name;
  return {
    id: newId("init"),
    tokenId: anchor.id,
    name: `${baseName} ×${rows.length}`.slice(0, 80),
    initiative: rolled + bonus,
    color: anchor.color,
    ownerId: anchor.owner_id,
    sceneId: anchor.scene_id,
    groupId: anchor.group_id,
    perception: bonus,
    movementUsed: 0,
    diagonalSteps: 0,
    actionsUsed: 0,
    reactionsUsed: 0,
  };
}

function groupTokens(sceneId: string, groupId: string): TokenRow[] {
  return db
    .prepare(
      "SELECT * FROM tokens WHERE scene_id = ? AND group_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(sceneId, groupId) as TokenRow[];
}

/** A player-owned combatant waits for its owner to roll initiative. */
function pendingInitiativeEntryForToken(row: TokenRow): InitiativeEntry {
  const bonus = row.initiative_bonus ?? initiativeBonusForToken(row);
  return {
    id: newId("init"),
    tokenId: row.id,
    name: row.name,
    initiative: 0,
    color: row.color,
    ownerId: row.owner_id,
    sceneId: row.scene_id,
    groupId: row.group_id,
    perception: bonus,
    pending: true,
    movementUsed: 0,
    diagonalSteps: 0,
    actionsUsed: 0,
    reactionsUsed: 0,
  };
}

function initiativeEntryForCombatToken(
  row: TokenRow,
  campaignId: string,
  pendingPlayers: boolean
): InitiativeEntry {
  if (pendingPlayers && row.owner_id) {
    const ownerRole = getCampaignRole(campaignId, row.owner_id);
    // Player-controlled tokens, plus a GM's own linked character, roll their
    // own initiative. Unlinked NPC/monster tokens still auto-roll.
    if (ownerRole === "player" || (ownerRole === "gm" && row.character_id)) {
      return pendingInitiativeEntryForToken(row);
    }
  }
  return initiativeEntryForToken(row);
}

function initiativeEntriesForTokens(
  tokens: TokenRow[],
  campaignId?: string,
  pendingPlayers = false
): InitiativeEntry[] {
  const groups = new Map<string, TokenRow[]>();
  const singles: TokenRow[] = [];
  for (const token of tokens) {
    if (!token.group_id) {
      singles.push(token);
      continue;
    }
    const members = groups.get(token.group_id) ?? [];
    members.push(token);
    groups.set(token.group_id, members);
  }
  return [
    ...singles.map((token) =>
      campaignId
        ? initiativeEntryForCombatToken(token, campaignId, pendingPlayers)
        : initiativeEntryForToken(token)
    ),
    ...[...groups.values()].map((members) =>
      members.length > 1 ? initiativeEntryForGroup(members) : initiativeEntryForToken(members[0])
    ),
  ];
}

function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return sortInitiativeEntries(entries);
}

function createToken(
  socket: TypedSocket,
  io: TypedServer,
  campaignId: string,
  sceneId: string,
  incoming: Partial<Token>
): Token | null {
  const scene = sceneBelongs(sceneId, campaignId);
  if (!scene) {
    sendError(socket, "That scene does not exist.");
    return null;
  }
  if (!requireGm(socket, campaignId)) return null;
  let character = null as ReturnType<typeof getCharacter>;
  if (typeof incoming.characterId === "string" && incoming.characterId) {
    character = getCharacter(incoming.characterId);
    if (!character || (character.campaign_id && character.campaign_id !== campaignId)) {
      sendError(socket, "That character is not part of this campaign.");
      return null;
    }
  }
  const name = safeString(incoming.name, character?.name ?? "Token", 80);
  const size = clamp(safeInt(incoming.size, character ? 1 : 1, 1, 6), 1, 6);
  const x = clamp(Number(incoming.x) || scene.grid_size / 2, 0, scene.width);
  const y = clamp(Number(incoming.y) || scene.grid_size / 2, 0, scene.height);
  let hpMax: number | null = incoming.hpMax ?? null;
  let hpCurrent: number | null = incoming.hpCurrent ?? hpMax;
  let ac: number | null = incoming.ac ?? null;
  let ownerId =
    typeof incoming.ownerId === "string" ? incoming.ownerId : (character?.user_id ?? null);
  if (ownerId) {
    if (!getMembership(campaignId, ownerId)) ownerId = null;
  }
  if (character?.summary) {
    try {
      const summary = JSON.parse(character.summary) as {
        hp?: number;
        currentHp?: number;
        ac?: number;
      };
      if (hpMax === null && typeof summary.hp === "number") hpMax = summary.hp;
      if (ac === null && typeof summary.ac === "number") ac = summary.ac;
      // A token created for a wounded character starts at the sheet's current
      // HP, not at full. An explicit hpCurrent from the GM still wins.
      if (hpCurrent === null) {
        hpCurrent = typeof summary.currentHp === "number" ? summary.currentHp : hpMax;
      }
    } catch {}
  }
  const id = newId("tok");
  const ts = now();
  const initiativeBonus =
    incoming.initiativeBonus === null || incoming.initiativeBonus === undefined
      ? null
      : safeInt(incoming.initiativeBonus, 0, -100, 1000);
  const visionRadius = clamp(safeInt(incoming.visionRadius, 60, 0, 240), 0, 240);
  const lightRadius = clamp(safeInt(incoming.lightRadius, 0, 0, 240), 0, 240);
  const lightColor = normalizeLightColor(incoming.lightColor);
  const visionMode = normalizeTokenVisionMode(incoming.visionMode);
  const groupId = incoming.groupId ? safeString(incoming.groupId, "", 80) || null : null;
  const groupName = groupId ? safeString(incoming.groupName, name, 80) : null;
  const turnEffects = character
    ? characterTokenTurnEffects(
        normalizeCharacterDraft(parseJson(character.data, {}), character.name).play
      )
    : normalizeTokenTurnEffects(incoming.turnEffects);
  const monsterId =
    typeof incoming.monsterId === "string" && incoming.monsterId
      ? safeString(incoming.monsterId, "", 120) || null
      : null;
  db.prepare(
    `INSERT INTO tokens (id, scene_id, name, image_url, character_id, monster_id, owner_id, x, y, size, vision_radius, light_radius, light_color, vision_mode, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, turn_effects, hidden, locked, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sceneId,
    name,
    incoming.imageUrl ? safeString(incoming.imageUrl, "", 500) : character ? null : null,
    character?.id ?? null,
    monsterId,
    ownerId,
    x,
    y,
    size,
    visionRadius,
    lightRadius,
    lightColor,
    visionMode,
    safeString(incoming.color, "#c8a96b", 30),
    hpCurrent,
    hpMax,
    ac,
    initiativeBonus,
    groupId,
    groupName,
    JSON.stringify(normalizeTokenConditions(incoming.conditions)),
    JSON.stringify(turnEffects),
    incoming.hidden ? 1 : 0,
    incoming.locked ? 1 : 0,
    Date.now(),
    ts,
    ts
  );
  const row = tokenRow(id)!;
  const token = tokenWithOwner(row);
  socketTokenEvents(io, campaignId).created(token);
  addTokenToSetup(io, campaignId, row);
  touchCampaign(campaignId);
  return token;
}

function rollInitiative(
  io: TypedServer,
  campaignId: string,
  sceneId: string,
  tokenIds?: string[]
): void {
  const tokens = db
    .prepare("SELECT * FROM tokens WHERE scene_id = ? AND hidden = 0")
    .all(sceneId) as TokenRow[];
  const chosen = tokenIds?.length ? tokens.filter((token) => tokenIds.includes(token.id)) : tokens;
  const entries = sortInitiative(initiativeEntriesForTokens(chosen));
  ensureState(campaignId);
  db.prepare(
    "UPDATE campaign_state SET initiative = ?, round = 1, turn_index = 0, active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
  ).run(JSON.stringify(entries), sceneId, now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
}

/**
 * Enter combat setup. Monsters and GM-controlled tokens roll immediately;
 * player-owned tokens stay pending until their owner rolls from the table UI.
 */
function startCombat(io: TypedServer, campaignId: string, sceneId: string): number {
  const tokens = db
    .prepare("SELECT * FROM tokens WHERE scene_id = ? AND hidden = 0")
    .all(sceneId) as TokenRow[];
  const entries = sortInitiative(initiativeEntriesForTokens(tokens, campaignId, true));
  const pending = entries.filter((entry) => entry.pending).length;
  ensureState(campaignId);
  db.prepare(
    "UPDATE campaign_state SET initiative = ?, round = ?, turn_index = 0, active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
  ).run(JSON.stringify(entries), pending ? 0 : 1, sceneId, now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
  return pending;
}

/** Fill any outstanding player rolls and begin round one. */
function beginCombat(io: TypedServer, campaignId: string): void {
  const state = ensureState(campaignId);
  const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
  for (const entry of entries) {
    if (!entry.pending) continue;
    const rolled = rollFormula("1d20", {}).d20 ?? 10;
    entry.initiative = rolled + (entry.perception ?? 0);
    entry.pending = false;
  }
  const sorted = sortInitiative(entries);
  db.prepare(
    "UPDATE campaign_state SET initiative = ?, round = 1, turn_index = 0, updated_at = ? WHERE campaign_id = ?"
  ).run(JSON.stringify(sorted), now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
}

function submitInitiativeRoll(
  io: TypedServer,
  campaignId: string,
  entryId: string,
  userId: string,
  role: "gm" | "player" | null
): { ok: boolean; initiative?: number; error?: string } {
  const state = ensureState(campaignId);
  if (state.round !== 0) {
    return { ok: false, error: "Combat is already underway." };
  }
  const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry || !entry.pending) {
    return { ok: false, error: "That initiative roll is no longer pending." };
  }
  if (role !== "gm" && entry.ownerId !== userId) {
    return { ok: false, error: "You can only roll initiative for your own token." };
  }
  const rolled = rollFormula("1d20", {}).d20 ?? 10;
  entry.initiative = rolled + (entry.perception ?? 0);
  entry.pending = false;
  const sorted = sortInitiative(entries);
  const stillPending = sorted.some((candidate) => candidate.pending);
  db.prepare(
    "UPDATE campaign_state SET initiative = ?, round = ?, turn_index = 0, updated_at = ? WHERE campaign_id = ?"
  ).run(JSON.stringify(sorted), stillPending ? 0 : 1, now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
  return { ok: true, initiative: entry.initiative };
}

function automationRollLines(rolls: RollResult[]): string[] {
  return rolls.map(
    (roll) =>
      `${roll.label || roll.formula}: ${roll.total}${
        roll.degree ? ` (${roll.degree.replace("-", " ")})` : ""
      }`
  );
}

function postCombatAutomation(
  io: TypedServer,
  campaignId: string,
  lines: string[],
  gmOnly: boolean
): void {
  const content = lines
    .map((line) => String(line).trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_900);
  if (!content) return;
  const id = newId("msg");
  const ts = now();
  const visibility = gmOnly ? "gm" : "all";
  db.prepare(
    "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, NULL, ?, 'chat', ?, NULL, ?, ?)"
  ).run(id, campaignId, "Combat automation", content, visibility, ts);
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
  const message = serializeMessage(row);
  if (gmOnly) io.to(gmRoom(campaignId)).emit("chat:message", message);
  else io.to(room(campaignId)).emit("chat:message", message);
}

function applyCharacterTurnDraft(
  io: TypedServer,
  campaignId: string,
  characterId: string,
  tokenId: string,
  nextDraft: CharacterDraft
): void {
  const character = getCharacter(characterId);
  if (!character) return;
  const summary = characterSummary(nextDraft, contextForCharacter(character, nextDraft));
  db.prepare(
    "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
  ).run(JSON.stringify(nextDraft), JSON.stringify(summary), now(), characterId);
  const token = tokenRow(tokenId);
  if (token && token.character_id === characterId) {
    const conditions = syncLifeConditions(
      normalizeTokenConditions(parseJson(token.conditions, [])),
      nextDraft.play.conditions
    );
    db.prepare(
      "UPDATE tokens SET hp_max = ?, hp_current = ?, ac = ?, conditions = ?, turn_effects = ?, updated_at = ? WHERE id = ?"
    ).run(
      summary.hp,
      nextDraft.play.hp ?? summary.hp,
      summary.ac,
      JSON.stringify(conditions),
      JSON.stringify(characterTokenTurnEffects(nextDraft.play)),
      now(),
      tokenId
    );
    const refreshed = tokenRow(tokenId);
    if (refreshed) {
      socketTokenEvents(io, campaignId).updated(
        tokenWithOwner(refreshed),
        Boolean(refreshed.hidden)
      );
    }
  }
  const target = token?.hidden ? gmRoom(campaignId) : room(campaignId);
  io.to(target).emit("character:updated", characterUpdatedPayload(characterId, nextDraft, summary));
}

function resolveCharacterEndOfTurn(io: TypedServer, campaignId: string, token: TokenRow): void {
  if (!token.character_id) return;
  const character = getCharacter(token.character_id);
  if (!character) return;
  if (character.campaign_id && character.campaign_id !== campaignId) return;
  try {
    const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    const context = contextForCharacter(character, draft);
    const derived = computeCharacter(draft, context);
    const end = resolveEndOfTurn(draft, derived.maxHp, { labelPrefix: character.name });
    const affliction = resolveAfflictionTurnEnd(end.draft, derived.saves, {
      labelPrefix: character.name,
    });
    const nextDraft = affliction.draft;
    const changed = end.changed || affliction.changed;
    if (changed) {
      applyCharacterTurnDraft(io, campaignId, character.id, token.id, nextDraft);
    }
    const lines = [
      `${character.name} - end of turn`,
      ...end.notes,
      ...affliction.notes,
      ...automationRollLines([
        ...end.rolls.map((roll) => roll.damage),
        ...end.rolls.flatMap((roll) => (roll.flatCheck ? [roll.flatCheck] : [])),
        ...affliction.rolls,
      ]),
    ];
    if (changed || lines.length > 1) {
      postCombatAutomation(io, campaignId, lines, Boolean(token.hidden));
    }
  } catch {
    // A malformed draft must not block the turn advance.
  }
}

function resolveCharacterStartOfTurn(io: TypedServer, campaignId: string, token: TokenRow): void {
  if (!token.character_id) return;
  const character = getCharacter(token.character_id);
  if (!character) return;
  if (character.campaign_id && character.campaign_id !== campaignId) return;
  try {
    const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    const context = contextForCharacter(character, draft);
    const derived = computeCharacter(draft, context);
    const start = resolveStartOfTurn(draft, derived.maxHp, { labelPrefix: character.name });
    if (start.changed) {
      applyCharacterTurnDraft(io, campaignId, character.id, token.id, start.draft);
    }
    const lines = [
      `${character.name} - start of turn`,
      ...start.notes,
      ...automationRollLines(start.recovery ? [start.recovery] : []),
    ];
    if (start.changed || lines.length > 1) {
      postCombatAutomation(io, campaignId, lines, Boolean(token.hidden));
    }
  } catch {
    // A malformed draft must not block the turn advance.
  }
}

function resolveUnlinkedTokenEndOfTurn(io: TypedServer, campaignId: string, token: TokenRow): void {
  if (token.character_id) {
    resolveCharacterEndOfTurn(io, campaignId, token);
    return;
  }
  const effects = normalizeTokenTurnEffects(parseJson(token.turn_effects, {}));
  const conditions = normalizeTokenConditions(parseJson(token.conditions, []));
  const dead = conditions.some(
    (condition) =>
      condition.name
        .trim()
        .toLowerCase()
        .replace(/\s+\d+$/, "") === "dead"
  );
  const result = resolveTokenEndOfTurn(effects, { labelPrefix: token.name }, dead);
  const lines = [`${token.name} - end of turn`];
  if (result.totalDamage) lines.push(`Persistent damage: ${result.totalDamage}.`);
  for (const roll of result.rolls) {
    if (roll.ended) lines.push(`Persistent ${roll.instance.type} ends.`);
  }
  lines.push(
    ...automationRollLines(
      result.rolls.flatMap((roll) => [roll.damage, ...(roll.flatCheck ? [roll.flatCheck] : [])])
    )
  );
  let nextHp = token.hp_current;
  let nextConditions = conditions;
  if (result.changed) {
    if (token.hp_max !== null && result.totalDamage > 0) {
      const state = applyHpEditToState(
        { hp: token.hp_current ?? token.hp_max, conditions },
        token.hp_max,
        {
          type: "damage",
          amount: result.totalDamage,
          damageTypes: [...new Set(result.rolls.map((roll) => roll.instance.type))],
        }
      );
      nextHp = state.draft.play.hp ?? token.hp_max;
      nextConditions = state.draft.play.conditions;
    }
    db.prepare(
      "UPDATE tokens SET hp_current = ?, conditions = ?, turn_effects = ?, updated_at = ? WHERE id = ?"
    ).run(
      nextHp,
      JSON.stringify(nextConditions),
      JSON.stringify({ ...effects, persistentDamage: result.remaining }),
      now(),
      token.id
    );
    const refreshed = tokenRow(token.id);
    if (refreshed) {
      socketTokenEvents(io, campaignId).updated(
        tokenWithOwner(refreshed),
        Boolean(refreshed.hidden)
      );
    }
  }
  if (result.changed || lines.length > 1) {
    postCombatAutomation(io, campaignId, lines, Boolean(token.hidden));
  }
}

function resolveCombatantEndOfTurn(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry
): void {
  if (!entry.tokenId || entry.groupId) return;
  const token = tokenRow(entry.tokenId);
  if (!token) return;
  resolveUnlinkedTokenEndOfTurn(io, campaignId, token);
}

function resolveUnlinkedTokenStartOfTurn(
  io: TypedServer,
  campaignId: string,
  token: TokenRow
): void {
  if (token.hp_max === null) return;
  const effects = normalizeTokenTurnEffects(parseJson(token.turn_effects, {}));
  const conditions = normalizeTokenConditions(parseJson(token.conditions, []));
  const draft = {
    play: {
      hp: token.hp_current ?? token.hp_max,
      tempHp: 0,
      conditions,
      heroPoints: 0,
      focusPoints: 0,
      afflictions: [],
      persistentDamage: [],
      xp: 0,
      shieldRaised: false,
      fastHealing: effects.fastHealing,
      fastHealingActive: effects.fastHealingActive,
      fastHealingNote: effects.fastHealingNote,
      regeneration: effects.regeneration,
      regenerationActive: effects.regenerationActive,
      regenerationNote: effects.regenerationNote,
      regenerationDeactivatedBy: effects.regenerationDeactivatedBy,
    },
  } as unknown as CharacterDraft;
  const start = resolveStartOfTurn(draft, token.hp_max, { labelPrefix: token.name });
  if (start.changed) {
    db.prepare("UPDATE tokens SET hp_current = ?, conditions = ?, updated_at = ? WHERE id = ?").run(
      start.draft.play.hp ?? token.hp_max,
      JSON.stringify(start.draft.play.conditions),
      now(),
      token.id
    );
    const refreshed = tokenRow(token.id);
    if (refreshed) {
      socketTokenEvents(io, campaignId).updated(
        tokenWithOwner(refreshed),
        Boolean(refreshed.hidden)
      );
    }
  }
  const lines = [
    `${token.name} - start of turn`,
    ...start.notes,
    ...automationRollLines(start.recovery ? [start.recovery] : []),
  ];
  if (start.changed || lines.length > 1) {
    postCombatAutomation(io, campaignId, lines, Boolean(token.hidden));
  }
}

function resolveCombatantStartOfTurn(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry
): void {
  if (!entry.tokenId || entry.groupId || entry.pending) return;
  const token = tokenRow(entry.tokenId);
  if (!token) return;
  if (token.character_id) resolveCharacterStartOfTurn(io, campaignId, token);
  else resolveUnlinkedTokenStartOfTurn(io, campaignId, token);
}

/** Advance the active marker, wrapping into the next round. */
function advanceInitiativeTurn(io: TypedServer, campaignId: string, direction: 1 | -1): boolean {
  const state = ensureState(campaignId);
  if (state.round === 0) return false;
  const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
  if (!entries.length) return false;
  const previous = entries[state.turn_index] ?? null;
  if (direction === 1 && previous) {
    resolveCombatantEndOfTurn(io, campaignId, previous);
  }
  let turn = state.turn_index + direction;
  let round = state.round;
  if (turn >= entries.length) {
    turn = 0;
    round += 1;
  } else if (turn < 0) {
    turn = entries.length - 1;
    round = Math.max(1, round - 1);
  }
  db.prepare(
    "UPDATE campaign_state SET turn_index = ?, round = ?, updated_at = ? WHERE campaign_id = ?"
  ).run(turn, round, now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
  if (round > state.round) expireSceneTemplates(io, campaignId, round);
  if (direction === 1 && round > 0) {
    const nextEntries = serializeInitiative(JSON.parse(ensureState(campaignId).initiative || "[]"));
    const active = nextEntries[turn] ?? null;
    if (active) resolveCombatantStartOfTurn(io, campaignId, active);
  }
  return true;
}

/** Add a token placed during combat setup without restarting the encounter. */
function addTokenToSetup(io: TypedServer, campaignId: string, row: TokenRow): void {
  if (row.hidden) return;
  const state = ensureState(campaignId);
  if (state.round !== 0 || state.active_scene_id !== row.scene_id) return;
  const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
  if (row.group_id) {
    const members = groupTokens(row.scene_id, row.group_id);
    const existingIndex = entries.findIndex((entry) => entry.groupId === row.group_id);
    if (members.length > 1) {
      // Bulk monster creation inserts one token at a time. Rebuild the group
      // entry only after the member count changes so the chip shows xN.
      const groupEntry = initiativeEntryForGroup(members);
      const existing = existingIndex >= 0 ? entries[existingIndex] : null;
      if (existing) {
        if (existing.name === groupEntry.name && existing.tokenId === groupEntry.tokenId) return;
        groupEntry.id = existing.id;
        groupEntry.initiative = existing.initiative;
        groupEntry.pending = existing.pending;
        groupEntry.ownerId = existing.ownerId;
        entries[existingIndex] = groupEntry;
      } else {
        entries.push(groupEntry);
      }
    } else {
      if (existingIndex >= 0) return;
      entries.push(initiativeEntryForCombatToken(row, campaignId, true));
    }
  } else {
    if (entries.some((entry) => entry.tokenId === row.id)) return;
    entries.push(initiativeEntryForCombatToken(row, campaignId, true));
  }
  const sorted = sortInitiative(entries);
  db.prepare("UPDATE campaign_state SET initiative = ?, updated_at = ? WHERE campaign_id = ?").run(
    JSON.stringify(sorted),
    now(),
    campaignId
  );
  broadcastInitiative(io, campaignId, ensureState(campaignId));
}

export function registerSocketServer(io: TypedServer): void {
  io.use((socket, next) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie);
    if (!user) return next(new Error("unauthorized"));
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    socket.data.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isAdmin: Boolean(user.is_admin),
    };
    socket.data.sessionHash = token ? sha256(token) : "";
    socket.data.campaigns = new Set();
    next();
  });

  io.on("connection", (socket: TypedSocket) => {
    const on = <E extends keyof ClientToServerEvents>(
      event: E,
      handler: ClientToServerEvents[E]
    ): void => onSocket(socket, event, handler);

    // CLI password resets and natural session expiry must eventually close
    // already-open sockets, not just future handshakes.
    const sessionTimer = setInterval(() => {
      try {
        if (socketSessionActive(socket)) return;
      } catch {
        return;
      }
      sendError(socket, "Your session expired. Sign in again.");
      socket.disconnect(true);
    }, 30_000);
    socket.on("disconnect", () => clearInterval(sessionTimer));

    on("campaign:join", ({ campaignId }, ack) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        sendError(socket, "You're not a member of that campaign.");
        ack?.({ ok: false });
        return;
      }
      socket.join(room(campaignId));
      if (role === "gm") socket.join(gmRoom(campaignId));
      else socket.leave(gmRoom(campaignId));
      socket.data.campaigns.add(campaignId);
      addPresence(socket, campaignId, role);
      emitPresence(io, campaignId);
      ack?.({ ok: true, role, presence: presenceList(campaignId) });
    });

    on("campaign:leave", ({ campaignId }) => {
      socket.leave(room(campaignId));
      socket.leave(gmRoom(campaignId));
      socket.data.campaigns.delete(campaignId);
      removePresence(socket, campaignId);
      emitPresence(io, campaignId);
    });

    on("token:move", ({ campaignId, sceneId, tokenId, x, y }) => {
      const row = tokenRow(tokenId);
      if (!row || row.scene_id !== sceneId) return;
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) return;
      if (role !== "gm" && (row.owner_id !== socket.data.user.id || row.locked)) {
        sendError(socket, "You can only move your own unlocked token.");
        return;
      }
      // Movement is free and manual. The server only enforces ownership,
      // locks, and scene bounds; speed and walls are table judgement calls.
      const targetX = clamp(Number(x) || 0, 0, scene.width);
      const targetY = clamp(Number(y) || 0, 0, scene.height);
      db.prepare("UPDATE tokens SET x = ?, y = ?, updated_at = ? WHERE id = ?").run(
        targetX,
        targetY,
        now(),
        tokenId
      );
      socketTokenEvents(io, campaignId).moved(
        { tokenId, sceneId, x: targetX, y: targetY },
        Boolean(row.hidden)
      );
      touchCampaign(campaignId);
    });

    on("token:create", ({ campaignId, sceneId, token }, ack) => {
      const created = createToken(socket, io, campaignId, sceneId, token ?? {});
      ack?.(created);
    });

    on("token:update", ({ campaignId, token }) => {
      if (!token?.id) return;
      const row = tokenRow(token.id);
      if (!row) return;
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = db
        .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
        .get(row.scene_id, campaignId) as SceneRow | undefined;
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) return;
      const isOwner = row.owner_id === socket.data.user.id;
      if (role !== "gm" && !isOwner) {
        sendError(socket, "You can't edit that token.");
        return;
      }
      const updates: string[] = [];
      const values: (string | number | null)[] = [];
      const add = (column: string, value: string | number | null) => {
        updates.push(`${column} = ?`);
        values.push(value);
      };
      if (role === "gm") {
        if (token.name !== undefined) add("name", safeString(token.name, row.name, 80));
        if (token.x !== undefined) add("x", clamp(Number(token.x) || 0, 0, scene.width));
        if (token.y !== undefined) add("y", clamp(Number(token.y) || 0, 0, scene.height));
        if (token.size !== undefined) add("size", clamp(safeInt(token.size, row.size, 1, 6), 1, 6));
        if (token.visionRadius !== undefined) {
          add(
            "vision_radius",
            clamp(safeInt(token.visionRadius, row.vision_radius ?? 60, 0, 240), 0, 240)
          );
        }
        if (token.lightRadius !== undefined) {
          add(
            "light_radius",
            clamp(safeInt(token.lightRadius, row.light_radius ?? 0, 0, 240), 0, 240)
          );
        }
        if (token.lightColor !== undefined) {
          add("light_color", normalizeLightColor(token.lightColor));
        }
        if (token.visionMode !== undefined) {
          add("vision_mode", normalizeTokenVisionMode(token.visionMode));
        }
        if (token.color !== undefined) add("color", safeString(token.color, row.color, 30));
        // Linked characters own max HP. Token-level max HP is only editable for
        // unlinked NPC/monster tokens so the sheet cannot silently drift.
        if (token.hpMax !== undefined && !row.character_id) {
          add("hp_max", token.hpMax === null ? null : safeInt(token.hpMax, 0, 0, 1_000_000));
        }
        if (token.ac !== undefined)
          add("ac", token.ac === null ? null : safeInt(token.ac, 0, -100, 1000));
        if (token.initiativeBonus !== undefined) {
          add(
            "initiative_bonus",
            token.initiativeBonus === null ? null : safeInt(token.initiativeBonus, 0, -100, 1000)
          );
        }
        if (token.groupId !== undefined) {
          add("group_id", token.groupId ? safeString(token.groupId, "", 80) || null : null);
        }
        if (token.groupName !== undefined) {
          add("group_name", token.groupName ? safeString(token.groupName, "", 80) || null : null);
        }
        if (token.turnEffects !== undefined && !row.character_id) {
          add("turn_effects", JSON.stringify(normalizeTokenTurnEffects(token.turnEffects)));
        }
        if (token.hidden !== undefined) add("hidden", token.hidden ? 1 : 0);
        if (token.locked !== undefined) add("locked", token.locked ? 1 : 0);
        if (token.ownerId !== undefined) {
          const ownerId =
            token.ownerId && getMembership(campaignId, token.ownerId) ? token.ownerId : null;
          add("owner_id", ownerId);
        }
      }
      if (token.hpCurrent !== undefined) {
        add(
          "hp_current",
          token.hpCurrent === null ? null : safeInt(token.hpCurrent, 0, -1_000_000, 1_000_000)
        );
      }
      if (token.imageUrl !== undefined) {
        if (token.imageUrl === null || token.imageUrl === "") {
          add("image_url", null);
        } else {
          const imageUrl = safeString(token.imageUrl, "", 500);
          // Players may point a token at an uploaded asset, but arbitrary
          // remote URLs can leak the table's IPs to a third party.
          if (imageUrl && (role === "gm" || imageUrl.startsWith("/uploads/"))) {
            add("image_url", imageUrl);
          } else if (role !== "gm") {
            sendError(socket, "Use the Upload image button for token art.");
          }
        }
      }
      if (token.conditions !== undefined) {
        add("conditions", JSON.stringify(normalizeTokenConditions(token.conditions)));
      }
      if (!updates.length) return;
      values.push(now(), token.id);
      db.prepare(`UPDATE tokens SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(
        ...values
      );
      const updated = tokenRow(token.id);
      if (updated) {
        socketTokenEvents(io, campaignId).updated(tokenWithOwner(updated), Boolean(row.hidden));
      }
      if (token.hidden !== undefined && Boolean(token.hidden) !== Boolean(row.hidden)) {
        // Hiding a rolled combatant must remove it from the live player
        // initiative order immediately, not only after the next snapshot.
        broadcastInitiative(io, campaignId, ensureState(campaignId));
      }
      if (updated && (token.name !== undefined || token.groupName !== undefined)) {
        const state = ensureState(campaignId);
        const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
        const renamed = renameInitiativeEntries(entries, {
          tokenId: updated.id,
          name: updated.name,
          groupId: updated.group_id,
          groupName: updated.group_name,
        });
        if (renamed.some((entry, index) => entry.name !== entries[index]?.name)) {
          db.prepare(
            "UPDATE campaign_state SET initiative = ?, updated_at = ? WHERE campaign_id = ?"
          ).run(JSON.stringify(renamed), now(), campaignId);
          broadcastInitiative(io, campaignId, ensureState(campaignId));
        }
      }
      // Conditions live on both the token and the sheet. Mirror table edits
      // back so a GM-applied Frightened or Prone changes the player's math.
      if (updated?.character_id && token.conditions !== undefined) {
        const character = getCharacter(updated.character_id);
        if (character && (!character.campaign_id || character.campaign_id === campaignId)) {
          try {
            const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
            draft.play.conditions = sheetConditionsFromToken(
              normalizeTokenConditions(parseJson(updated.conditions, []))
            );
            const summary = characterSummary(draft, contextForCharacter(character, draft));
            db.prepare(
              "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
            ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
            io.to(room(campaignId)).emit(
              "character:updated",
              characterUpdatedPayload(character.id, draft, summary)
            );
          } catch {
            // A malformed draft shouldn't block the token update.
          }
        }
      }
      // A GM changing a linked token's HP is a table action; mirror it into
      // the character sheet so the player's next view is consistent.
      if (updated?.character_id && token.hpCurrent !== undefined) {
        const character = getCharacter(updated.character_id);
        if (character && (!character.campaign_id || character.campaign_id === campaignId)) {
          try {
            const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
            const maxHp = computeCharacter(draft, contextForCharacter(character, draft)).maxHp;
            const result = applyHpEditToDraft(draft, maxHp, {
              type: "set",
              hp:
                updated.hp_current === null
                  ? null
                  : Math.max(0, Math.min(maxHp, Number(updated.hp_current))),
            });
            const nextDraft = result.draft;
            const summary = characterSummary(nextDraft, contextForCharacter(character, nextDraft));
            db.prepare(
              "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
            ).run(JSON.stringify(nextDraft), JSON.stringify(summary), now(), character.id);
            const freshToken = tokenRow(token.id);
            const tokenConditions = syncLifeConditions(
              normalizeTokenConditions(parseJson(freshToken?.conditions, [])),
              nextDraft.play.conditions
            );
            db.prepare(
              "UPDATE tokens SET hp_max = ?, hp_current = ?, ac = ?, conditions = ?, updated_at = ? WHERE id = ?"
            ).run(
              summary.hp,
              nextDraft.play.hp ?? summary.hp,
              summary.ac,
              JSON.stringify(tokenConditions),
              now(),
              token.id
            );
            const refreshed = tokenRow(token.id);
            if (refreshed) {
              socketTokenEvents(io, campaignId).updated(
                tokenWithOwner(refreshed),
                Boolean(refreshed.hidden)
              );
            }
            io.to(room(campaignId)).emit(
              "character:updated",
              characterUpdatedPayload(character.id, nextDraft, summary)
            );
          } catch {
            // A malformed draft shouldn't block the token update.
          }
        }
      } else if (!updated?.character_id && token.hpCurrent !== undefined) {
        const maxHp = updated?.hp_max ?? row.hp_max ?? null;
        if (maxHp !== null) {
          const state = applyHpEditToState(
            {
              hp: row.hp_current ?? maxHp,
              conditions: normalizeTokenConditions(parseJson(row.conditions, [])),
            },
            maxHp,
            { type: "set", hp: token.hpCurrent === null ? null : Number(token.hpCurrent) }
          );
          db.prepare(
            "UPDATE tokens SET hp_current = ?, conditions = ?, updated_at = ? WHERE id = ?"
          ).run(
            state.draft.play.hp ?? maxHp,
            JSON.stringify(state.draft.play.conditions),
            now(),
            token.id
          );
          const refreshed = tokenRow(token.id);
          if (refreshed) {
            socketTokenEvents(io, campaignId).updated(
              tokenWithOwner(refreshed),
              Boolean(refreshed.hidden)
            );
          }
        }
      }
      touchCampaign(campaignId);
    });

    on("token:damage", ({ campaignId, tokenId, amount, critical, damageType, nonlethal }, ack) => {
      const row = tokenRow(tokenId);
      if (!row) return;
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = sceneBelongs(row.scene_id, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) return;
      const isOwner = row.owner_id === socket.data.user.id;
      if (role !== "gm" && !isOwner) {
        sendError(socket, "You can't damage that token.");
        return;
      }
      const damage = clamp(safeInt(amount, 0, 0, 1_000_000), 0, 1_000_000);
      if (!damage) return;
      const ts = now();
      if (row.character_id) {
        const character = getCharacter(row.character_id);
        if (!character) return;
        if (character.campaign_id && character.campaign_id !== campaignId) {
          sendError(socket, "That character is not part of this campaign.");
          return;
        }
        try {
          const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
          const derived = computeCharacter(draft, contextForCharacter(character, draft));
          const result = applyHpEditToDraft(draft, derived.maxHp, {
            type: "damage",
            amount: damage,
            critical: Boolean(critical),
            nonlethal: Boolean(nonlethal),
            damageTypes: damageType ? [String(damageType)] : undefined,
          });
          const summary = characterSummary(
            result.draft,
            contextForCharacter(character, result.draft)
          );
          db.prepare(
            "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
          ).run(JSON.stringify(result.draft), JSON.stringify(summary), ts, character.id);
          const tokenConditions = syncLifeConditions(
            normalizeTokenConditions(parseJson(row.conditions, [])),
            result.draft.play.conditions
          );
          db.prepare(
            "UPDATE tokens SET hp_max = ?, hp_current = ?, ac = ?, conditions = ?, updated_at = ? WHERE id = ?"
          ).run(
            summary.hp,
            result.draft.play.hp ?? 0,
            summary.ac,
            JSON.stringify(tokenConditions),
            ts,
            row.id
          );
          const updated = tokenRow(row.id);
          if (updated) {
            socketTokenEvents(io, campaignId).updated(
              tokenWithOwner(updated),
              Boolean(updated.hidden)
            );
          }
          io.to(room(campaignId)).emit(
            "character:updated",
            characterUpdatedPayload(character.id, result.draft, summary)
          );
          ack?.({ applied: damage, notes: [] });
          touchCampaign(campaignId);
        } catch {
          sendError(socket, "That character's sheet could not be updated.");
        }
        return;
      }

      const maxHp = row.hp_max;
      if (maxHp === null) return;
      const monster = row.monster_id
        ? (monsters.find((entry) => entry.id === row.monster_id) ?? null)
        : null;
      const defenses = applyDamageDefenses({
        amount: damage,
        damageType,
        nonlethal,
        immunities: monster?.immunities,
        weaknesses: monster?.weaknesses,
        resistances: monster?.resistances,
      });
      if (defenses.amount <= 0) {
        ack?.({ applied: 0, notes: defenses.notes });
        return;
      }
      const result = applyHpEditToState(
        {
          hp: row.hp_current ?? maxHp,
          conditions: normalizeTokenConditions(parseJson(row.conditions, [])),
        },
        maxHp,
        {
          type: "damage",
          amount: defenses.amount,
          critical: Boolean(critical),
          nonlethal: Boolean(nonlethal),
        }
      );
      db.prepare(
        "UPDATE tokens SET hp_current = ?, conditions = ?, updated_at = ? WHERE id = ?"
      ).run(result.draft.play.hp ?? 0, JSON.stringify(result.draft.play.conditions), ts, row.id);
      const updated = tokenRow(row.id);
      if (updated) {
        socketTokenEvents(io, campaignId).updated(tokenWithOwner(updated), Boolean(updated.hidden));
      }
      ack?.({ applied: defenses.amount, notes: defenses.notes });
      touchCampaign(campaignId);
    });

    on("token:delete", ({ campaignId, tokenId }) => {
      if (!requireGm(socket, campaignId)) return;
      const row = tokenRow(tokenId);
      if (!row) return;
      const scene = sceneBelongs(row.scene_id, campaignId);
      if (!scene) return;
      const remainingGroupMember = row.group_id
        ? db
            .prepare("SELECT id FROM tokens WHERE group_id = ? AND id != ? LIMIT 1")
            .get(row.group_id, tokenId)
        : null;
      db.prepare("DELETE FROM tokens WHERE id = ?").run(tokenId);
      const state = ensureState(campaignId);
      const allEntries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const activeId = allEntries[state.turn_index]?.id ?? null;
      const entries = allEntries.filter((entry) => {
        if (entry.tokenId !== tokenId) return true;
        return Boolean(entry.groupId && remainingGroupMember);
      });
      if (entries.length !== allEntries.length) {
        const nextTurn = activeId
          ? Math.max(
              0,
              entries.findIndex((entry) => entry.id === activeId)
            )
          : 0;
        db.prepare(
          "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
        ).run(JSON.stringify(entries), nextTurn, now(), campaignId);
        broadcastInitiative(io, campaignId, ensureState(campaignId));
      }
      socketTokenEvents(io, campaignId).deleted(
        { tokenId, sceneId: row.scene_id },
        Boolean(row.hidden)
      );
      touchCampaign(campaignId);
    });

    on("fog:update", ({ campaignId, sceneId, cells, mode }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (!Array.isArray(cells) || cells.length > 5000) return;
      const current = new Set(parseJson<string[]>(scene.fog_revealed, []));
      if (mode === "replace") current.clear();
      for (const cell of cells) {
        if (typeof cell !== "string" || !/^-?\d+,-?\d+$/.test(cell)) continue;
        if (mode === "hide") current.delete(cell);
        else current.add(cell);
      }
      db.prepare("UPDATE scenes SET fog_revealed = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify([...current]),
        now(),
        sceneId
      );
      if (scene.visible !== 0) {
        io.to(room(campaignId)).emit("fog:updated", { sceneId, cells, mode });
      } else {
        io.to(gmRoom(campaignId)).emit("fog:updated", { sceneId, cells, mode });
      }
      touchCampaign(campaignId);
    });

    on("scene:activate", ({ campaignId, sceneId }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.({ ok: false, error: "Only the GM can change scenes." });
        return;
      }
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) {
        ack?.({ ok: false, error: "That scene no longer exists." });
        return;
      }
      if (scene.visible === 0) {
        ack?.({
          ok: false,
          error: "Make the scene visible to players before activating it.",
        });
        return;
      }
      ensureState(campaignId);
      db.prepare(
        "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(sceneId, now(), campaignId);
      io.to(room(campaignId)).emit("scene:activated", { sceneId });
      touchCampaign(campaignId);
      ack?.({ ok: true });
    });

    on("scene:update", ({ campaignId, scene }) => {
      if (!requireGm(socket, campaignId)) return;
      const row = db
        .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
        .get(scene.id, campaignId) as SceneRow | undefined;
      if (!row) return;
      const name = scene.name === undefined ? row.name : safeString(scene.name, row.name, 80);
      const fogEnabled =
        scene.fogEnabled === undefined ? row.fog_enabled : scene.fogEnabled ? 1 : 0;
      const gridSize =
        scene.gridSize === undefined
          ? row.grid_size
          : clamp(safeInt(scene.gridSize, row.grid_size, 20, 300), 20, 300);
      db.prepare(
        "UPDATE scenes SET name = ?, fog_enabled = ?, grid_size = ?, updated_at = ? WHERE id = ?"
      ).run(name, fogEnabled, gridSize, now(), scene.id);
      const updated = db.prepare("SELECT * FROM scenes WHERE id = ?").get(scene.id) as SceneRow;
      if (updated.visible !== 0) {
        io.to(room(campaignId))
          .except(gmRoom(campaignId))
          .emit("scene:updated", serializeSceneForPlayers(updated));
      }
      io.to(gmRoom(campaignId)).emit("scene:updated", serializeScene(updated));
      touchCampaign(campaignId);
    });

    on("scene:create", ({ campaignId, scene }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.(null);
        return;
      }
      const id = newId("scene");
      const ts = now();
      const width = clamp(safeInt(scene.width, 1600, 100, 10_000), 100, 10_000);
      const height = clamp(safeInt(scene.height, 1000, 100, 10_000), 100, 10_000);
      const grid = clamp(safeInt(scene.gridSize, 70, 20, 300), 20, 300);
      const visible = scene.visible !== false;
      const order = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM scenes WHERE campaign_id = ?"
        )
        .get(campaignId) as { next: number };
      db.prepare(
        `INSERT INTO scenes (id, campaign_id, name, image_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, visible, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1, '[]', ?, ?, ?, ?)`
      ).run(
        id,
        campaignId,
        safeString(scene.name, "New Scene", 80),
        scene.imageUrl ? safeString(scene.imageUrl, "", 500) : null,
        width,
        height,
        grid,
        visible ? 1 : 0,
        order.next,
        ts,
        ts
      );
      const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow;
      const serialized = serializeScene(row);
      if (visible) {
        io.to(room(campaignId))
          .except(gmRoom(campaignId))
          .emit("scene:created", serializeSceneForPlayers(row));
      }
      io.to(gmRoom(campaignId)).emit("scene:created", serialized);
      ack?.(serialized);
      touchCampaign(campaignId);
    });

    on("scene:delete", ({ campaignId, sceneId }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      const state = ensureState(campaignId);
      const wasActive = state.active_scene_id === sceneId;
      db.prepare("DELETE FROM scenes WHERE id = ?").run(sceneId);
      const remaining = db
        .prepare(
          "SELECT id FROM scenes WHERE campaign_id = ? AND visible = 1 ORDER BY sort_order ASC LIMIT 1"
        )
        .get(campaignId) as { id: string } | undefined;
      if (wasActive) {
        db.prepare(
          "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
        ).run(remaining?.id ?? null, now(), campaignId);
        if (remaining) io.to(room(campaignId)).emit("scene:activated", { sceneId: remaining.id });
      }
      // Scenes cascade to their tokens, so any initiative entry for that scene
      // or for a now-deleted token is a ghost. Remove it before broadcasting.
      const remainingTokenIds = new Set(
        (
          db
            .prepare(
              "SELECT id FROM tokens WHERE scene_id IN (SELECT id FROM scenes WHERE campaign_id = ?)"
            )
            .all(campaignId) as { id: string }[]
        ).map((row) => row.id)
      );
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]")).filter(
        (entry) =>
          entry.sceneId !== sceneId && (!entry.tokenId || remainingTokenIds.has(entry.tokenId))
      );
      const turnIndex = Math.max(0, Math.min(state.turn_index, Math.max(0, entries.length - 1)));
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), turnIndex, now(), campaignId);
      if (scene.visible !== 0) {
        io.to(room(campaignId)).emit("scene:deleted", { sceneId });
      } else {
        io.to(gmRoom(campaignId)).emit("scene:deleted", { sceneId });
      }
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    on("scene:reorder", ({ campaignId, sceneIds }) => {
      if (!requireGm(socket, campaignId)) return;
      const rows = db.prepare("SELECT id FROM scenes WHERE campaign_id = ?").all(campaignId) as {
        id: string;
      }[];
      const existing = new Set(rows.map((row) => row.id));
      if (
        sceneIds.length !== rows.length ||
        new Set(sceneIds).size !== sceneIds.length ||
        !sceneIds.every((id) => existing.has(id))
      ) {
        return;
      }
      const ts = now();
      const update = db.prepare(
        "UPDATE scenes SET sort_order = ?, updated_at = ? WHERE id = ? AND campaign_id = ?"
      );
      sceneIds.forEach((id, index) => update.run(index, ts, id, campaignId));
      const scenes = db
        .prepare(
          "SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
        )
        .all(campaignId) as SceneRow[];
      io.to(gmRoom(campaignId)).emit("scenes:reordered", scenes.map(serializeScene));
      io.to(room(campaignId))
        .except(gmRoom(campaignId))
        .emit(
          "scenes:reordered",
          scenes.filter((scene) => scene.visible !== 0).map(serializeSceneForPlayers)
        );
      touchCampaign(campaignId);
    });

    on("template:add", ({ campaignId, sceneId, template }) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) {
        sendError(socket, "That scene is GM-only.");
        return;
      }
      const normalized = normalizeAoeTemplate(template);
      if (!normalized) return;
      // Players can place their own visible spell areas. Hidden areas and
      // clearing the whole layer remain GM tools.
      if (role !== "gm") normalized.hidden = false;
      normalized.id = normalized.id ?? newId("aoe");
      normalized.casterUserId = socket.data.user.id;
      if (
        normalized.expiresRound === null &&
        normalized.durationRounds !== null &&
        normalized.durationRounds !== undefined
      ) {
        const currentRound = ensureState(campaignId).round;
        normalized.expiresRound = Math.max(1, currentRound + normalized.durationRounds - 1);
      }
      const templates = [
        ...normalizeAoeTemplates(parseJson(scene.templates, [])),
        normalized,
      ].slice(-20);
      db.prepare("UPDATE scenes SET templates = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(templates),
        now(),
        sceneId
      );
      broadcastSceneTemplates(io, campaignId, sceneId, templates);
      touchCampaign(campaignId);
    });

    on("template:remove", ({ campaignId, sceneId, templateId }) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) {
        sendError(socket, "That scene is GM-only.");
        return;
      }
      const templates = normalizeAoeTemplates(parseJson(scene.templates, []));
      const target = templates.find((entry) => entry.id === templateId);
      if (!target) return;
      if (role !== "gm" && target.casterUserId !== socket.data.user.id) return;
      const kept = templates.filter((entry) => entry.id !== templateId);
      db.prepare("UPDATE scenes SET templates = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(kept),
        now(),
        sceneId
      );
      broadcastSceneTemplates(io, campaignId, sceneId, kept);
      touchCampaign(campaignId);
    });

    on("template:clear", ({ campaignId, sceneId }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      db.prepare("UPDATE scenes SET templates = '[]', updated_at = ? WHERE id = ?").run(
        now(),
        sceneId
      );
      broadcastSceneTemplates(io, campaignId, sceneId, []);
      touchCampaign(campaignId);
    });

    on("scene:walls", ({ campaignId, sceneId, walls }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      const normalized = normalizeWalls(walls).map((wall) => ({
        ...wall,
        x1: clamp(wall.x1, 0, scene.width),
        y1: clamp(wall.y1, 0, scene.height),
        x2: clamp(wall.x2, 0, scene.width),
        y2: clamp(wall.y2, 0, scene.height),
      }));
      db.prepare("UPDATE scenes SET walls = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(normalized),
        now(),
        sceneId
      );
      if (scene.visible !== 0) {
        io.to(room(campaignId))
          .except(gmRoom(campaignId))
          .emit("scene:walls", {
            sceneId,
            walls: normalized.filter((wall) => !wall.hidden),
          });
      }
      io.to(gmRoom(campaignId)).emit("scene:walls", { sceneId, walls: normalized });
      touchCampaign(campaignId);
    });

    on("scene:props", ({ campaignId, sceneId, props }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      const normalized = normalizeSceneProps(props).map((prop) => ({
        ...prop,
        x: clamp(prop.x, 0, scene.width),
        y: clamp(prop.y, 0, scene.height),
      }));
      db.prepare("UPDATE scenes SET props = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(normalized),
        now(),
        sceneId
      );
      if (scene.visible !== 0) {
        io.to(room(campaignId))
          .except(gmRoom(campaignId))
          .emit("scene:props", {
            sceneId,
            props: normalized.filter((prop) => prop.visible),
          });
      }
      io.to(gmRoom(campaignId)).emit("scene:props", { sceneId, props: normalized });
      touchCampaign(campaignId);
    });

    on("drawing:add", ({ campaignId, sceneId, drawing }, ack) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        sendError(socket, "You're not a member of that campaign.");
        ack?.(null);
        return;
      }
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) {
        ack?.(null);
        return;
      }
      if (role !== "gm" && scene.visible === 0) {
        sendError(socket, "That scene is GM-only.");
        ack?.(null);
        return;
      }
      const drawings = normalizeSceneDrawings(
        parseJson(scene.drawings, []),
        scene.width,
        scene.height
      );
      if (drawings.length >= DRAWING_LIMIT) {
        sendError(socket, "This scene has reached the drawing limit. Clear some drawings first.");
        ack?.(null);
        return;
      }
      const normalized = normalizeSceneDrawing(
        {
          ...drawing,
          id: newId("drawing"),
          ownerId: socket.data.user.id,
          ownerName: socket.data.user.displayName,
          createdAt: now(),
        },
        scene.width,
        scene.height
      );
      if (!normalized) {
        sendError(socket, "That drawing was invalid.");
        ack?.(null);
        return;
      }
      const next = [...drawings, normalized];
      db.prepare("UPDATE scenes SET drawings = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(next),
        now(),
        sceneId
      );
      broadcastSceneDrawings(io, campaignId, sceneId, next);
      touchCampaign(campaignId);
      ack?.(normalized);
    });

    on("drawing:erase", ({ campaignId, sceneId, drawingId }) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        sendError(socket, "You're not a member of that campaign.");
        return;
      }
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) {
        sendError(socket, "That scene is GM-only.");
        return;
      }
      const drawings = normalizeSceneDrawings(
        parseJson(scene.drawings, []),
        scene.width,
        scene.height
      );
      const target = drawings.find((drawing) => drawing.id === drawingId);
      if (!target) return;
      if (
        !canEraseDrawing(
          target,
          socket.data.user.id,
          getCampaignRole(campaignId, socket.data.user.id) === "gm"
        )
      ) {
        sendError(socket, "You can only erase your own drawings.");
        return;
      }
      const next = drawings.filter((drawing) => drawing.id !== drawingId);
      db.prepare("UPDATE scenes SET drawings = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(next),
        now(),
        sceneId
      );
      broadcastSceneDrawings(io, campaignId, sceneId, next);
      touchCampaign(campaignId);
    });

    on("drawing:clear", ({ campaignId, sceneId, scope }) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        sendError(socket, "You're not a member of that campaign.");
        return;
      }
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && scene.visible === 0) {
        sendError(socket, "That scene is GM-only.");
        return;
      }
      const isGm = role === "gm";
      if (scope === "all" && !isGm) {
        sendError(socket, "Only the GM can clear the whole drawing layer.");
        return;
      }
      const drawings = normalizeSceneDrawings(
        parseJson(scene.drawings, []),
        scene.width,
        scene.height
      );
      const next =
        scope === "all"
          ? []
          : drawings.filter((drawing) => drawing.ownerId !== socket.data.user.id);
      db.prepare("UPDATE scenes SET drawings = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(next),
        now(),
        sceneId
      );
      broadcastSceneDrawings(io, campaignId, sceneId, next);
      touchCampaign(campaignId);
    });

    on("audio:update", ({ campaignId, trackId, playing, position }) => {
      if (!requireGm(socket, campaignId)) return;
      const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as
        CampaignRow | undefined;
      if (!campaign) return;
      if (trackId) {
        const track = db
          .prepare("SELECT id FROM campaign_audio_tracks WHERE id = ? AND campaign_id = ?")
          .get(trackId, campaignId);
        if (!track) return;
      }
      const safePosition = clamp(Number(position) || 0, 0, 86_400);
      const ts = now();
      db.prepare(
        "UPDATE campaigns SET audio_track_id = ?, audio_playing = ?, audio_position = ?, audio_updated_at = ?, updated_at = ? WHERE id = ?"
      ).run(trackId ?? null, playing ? 1 : 0, safePosition, ts, ts, campaignId);
      const updated = db
        .prepare("SELECT * FROM campaigns WHERE id = ?")
        .get(campaignId) as CampaignRow;
      io.to(room(campaignId)).emit("audio:state", {
        campaignId,
        state: serializeAudioState(updated),
      });
      touchCampaign(campaignId);
    });

    on("chat:send", ({ campaignId, content, visibility }, ack) => {
      if (!getMembership(campaignId, socket.data.user.id)) {
        sendError(socket, "You're not a member of that campaign.");
        ack?.(null);
        return;
      }
      const text = sanitizeUserText(content, 5000).trim();
      if (!text) {
        ack?.(null);
        return;
      }
      const id = newId("msg");
      const ts = now();
      const vis = visibility === "gm" ? "gm" : "all";
      db.prepare(
        "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, ?, ?, 'chat', ?, NULL, ?, ?)"
      ).run(id, campaignId, socket.data.user.id, socket.data.user.displayName, text, vis, ts);
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
      const message = serializeMessage(row);
      if (vis === "gm") {
        io.to(gmRoom(campaignId)).emit("chat:message", message);
        socket.emit("chat:message", message);
      } else {
        io.to(room(campaignId)).emit("chat:message", message);
      }
      touchCampaign(campaignId);
      ack?.(message);
    });

    on(
      "dice:roll",
      (
        { campaignId, formula, label, dc, visibility, characterId, requestId, upgradeSuccess },
        ack
      ) => {
        if (!getMembership(campaignId, socket.data.user.id)) {
          sendError(socket, "You're not a member of that campaign.");
          ack?.(null);
          return;
        }
        try {
          const result = rollFormula(safeString(formula, "1d20", 300), {
            dc: typeof dc === "number" ? dc : null,
            label: safeString(label, "", 120),
          });
          if (upgradeSuccess === true && result.degree === "success") {
            result.degree = upgradeDegreeOfSuccess(result.degree);
            result.degreeUpgraded = true;
          }
          const id = newId("msg");
          const ts = now();
          const vis = visibility === "gm" ? "gm" : "all";
          const content = result.label || result.formula;
          db.prepare(
            "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, ?, ?, 'roll', ?, ?, ?, ?)"
          ).run(
            id,
            campaignId,
            socket.data.user.id,
            socket.data.user.displayName,
            content,
            JSON.stringify({
              ...result,
              characterId: characterId ?? null,
              requestId: safeString(requestId, "", 80) || null,
            }),
            vis,
            ts
          );
          const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
          const message = serializeMessage(row);
          if (vis === "gm") {
            io.to(gmRoom(campaignId)).emit("chat:message", message);
            socket.emit("chat:message", message);
          } else {
            io.to(room(campaignId)).emit("chat:message", message);
          }
          touchCampaign(campaignId);
          ack?.(message);
        } catch (error) {
          sendError(
            socket,
            error instanceof Error ? error.message : "That roll could not be made."
          );
          ack?.(null);
        }
      }
    );

    on("dice:request", ({ campaignId, formula, label, dc, group }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.(null);
        return;
      }
      const cleanFormula = safeString(formula, "1d20", 300).trim();
      const validation = validateFormula(cleanFormula);
      if (!validation.ok) {
        sendError(socket, validation.error ?? "That roll formula is invalid.");
        ack?.(null);
        return;
      }
      const id = newId("msg");
      const request = {
        formula: cleanFormula,
        label: safeString(label, "Roll", 120).trim() || "Roll",
        dc:
          typeof dc === "number" && Number.isFinite(dc)
            ? Math.max(-100, Math.min(1000, Math.round(dc)))
            : null,
        group: group === true,
        requestId: id,
      };
      const ts = now();
      db.prepare(
        "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, NULL, ?, ?, 'request', ?, ?, 'all', ?)"
      ).run(
        id,
        campaignId,
        socket.data.user.id,
        socket.data.user.displayName,
        request.label,
        JSON.stringify(request),
        ts
      );
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
      const message = serializeMessage(row);
      io.to(room(campaignId)).emit("chat:message", message);
      touchCampaign(campaignId);
      ack?.(message);
    });

    on("initiative:roll", ({ campaignId, sceneId, tokenIds }) => {
      if (!requireGm(socket, campaignId)) return;
      if (!sceneBelongs(sceneId, campaignId)) return;
      rollInitiative(io, campaignId, sceneId, tokenIds);
      touchCampaign(campaignId);
    });

    on("initiative:start", ({ campaignId, sceneId }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.({ ok: false, error: "Only the GM can start combat." });
        return;
      }
      const state = ensureState(campaignId);
      const chosenScene = sceneId || state.active_scene_id;
      if (!chosenScene || !sceneBelongs(chosenScene, campaignId)) {
        ack?.({ ok: false, error: "Choose a scene before starting combat." });
        return;
      }
      const pending = startCombat(io, campaignId, chosenScene);
      touchCampaign(campaignId);
      ack?.({ ok: true, pending });
    });

    on("initiative:submit", ({ campaignId, entryId }, ack) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        ack?.({ ok: false, error: "You're not a member of that campaign." });
        return;
      }
      const result = submitInitiativeRoll(io, campaignId, entryId, socket.data.user.id, role);
      if (result.ok) touchCampaign(campaignId);
      else if (result.error) sendError(socket, result.error);
      ack?.(result);
    });

    on("initiative:begin", ({ campaignId }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.({ ok: false, error: "Only the GM can begin combat." });
        return;
      }
      if (ensureState(campaignId).round !== 0) {
        ack?.({ ok: false, error: "Combat already began." });
        return;
      }
      beginCombat(io, campaignId);
      touchCampaign(campaignId);
      ack?.({ ok: true });
    });

    on("initiative:end-turn", ({ campaignId }, ack) => {
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const active = entries[state.turn_index] ?? null;
      if (!active || state.round === 0) {
        ack?.({ ok: false, error: "Combat is not active." });
        return;
      }
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        ack?.({ ok: false, error: "You're not a member of that campaign." });
        return;
      }
      if (role !== "gm" && active.ownerId !== socket.data.user.id) {
        ack?.({ ok: false, error: "It is not your turn." });
        sendError(socket, "It is not your turn.");
        return;
      }
      if (!advanceInitiativeTurn(io, campaignId, 1)) {
        ack?.({ ok: false, error: "Combat is not active." });
        return;
      }
      touchCampaign(campaignId);
      ack?.({ ok: true });
    });

    on("initiative:end", ({ campaignId }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.({ ok: false, error: "Only the GM can end combat." });
        return;
      }
      db.prepare(
        "UPDATE campaign_state SET initiative = '[]', round = 1, turn_index = 0, updated_at = ? WHERE campaign_id = ?"
      ).run(now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
      ack?.({ ok: true });
    });

    on("initiative:update", ({ campaignId, entries, round, turnIndex }) => {
      if (!requireGm(socket, campaignId)) return;
      ensureState(campaignId);
      const clean: InitiativeEntry[] = Array.isArray(entries)
        ? entries
            .filter((entry) => entry && typeof entry.name === "string")
            .slice(0, 200)
            .map((entry) => ({
              id: safeString(entry.id, newId("init"), 80),
              tokenId: typeof entry.tokenId === "string" ? entry.tokenId : null,
              name: safeString(entry.name, "Combatant", 80),
              initiative: safeInt(entry.initiative, 0, -100, 1000),
              color: safeString(entry.color, "#c8a96b", 30),
              ownerId: typeof entry.ownerId === "string" ? entry.ownerId : null,
              sceneId: typeof entry.sceneId === "string" ? entry.sceneId : null,
              groupId: typeof entry.groupId === "string" ? entry.groupId : null,
              tieBreak:
                typeof entry.tieBreak === "number"
                  ? safeInt(entry.tieBreak, 0, -10_000, 10_000)
                  : 0,
              perception:
                typeof entry.perception === "number"
                  ? safeInt(entry.perception, 0, -100, 1000)
                  : undefined,
              delayed: entry.delayed === true,
              readied: entry.readied === true,
              movementUsed: safeInt(entry.movementUsed, 0, 0, 100_000),
              diagonalSteps: safeInt(entry.diagonalSteps, 0, 0, 10_000),
              actionsUsed: safeInt(entry.actionsUsed, 0, 0, 3),
              reactionsUsed: safeInt(entry.reactionsUsed, 0, 0, 1),
              pending: entry.pending === true,
            }))
        : [];
      const current = ensureState(campaignId);
      const nextTurn = safeInt(turnIndex, 0, 0, Math.max(0, clean.length - 1));
      const nextRound = safeInt(round, current.round, 0, 999);
      // The order is a reference, not a rules engine. Changing it (including
      // the active marker) never applies damage, conditions, or turn effects.
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, round = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(clean), nextRound, nextTurn, now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      if (nextRound > current.round) expireSceneTemplates(io, campaignId, nextRound);
      touchCampaign(campaignId);
    });

    on("initiative:next", ({ campaignId, direction }) => {
      if (!requireGm(socket, campaignId)) return;
      if (!advanceInitiativeTurn(io, campaignId, direction === -1 ? -1 : 1)) return;
      touchCampaign(campaignId);
    });

    on("initiative:add", ({ campaignId, tokenId, value }) => {
      if (!requireGm(socket, campaignId)) return;
      const row = tokenRow(tokenId);
      if (!row || !sceneBelongs(row.scene_id, campaignId)) return;
      const state = ensureState(campaignId);
      const setup = state.round === 0;
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const activeId = entries[state.turn_index]?.id ?? null;
      if (row.group_id) {
        if (entries.some((entry) => entry.groupId === row.group_id)) return;
        const members = groupTokens(row.scene_id, row.group_id);
        entries.push(
          members.length > 1
            ? initiativeEntryForGroup(members)
            : setup && typeof value !== "number"
              ? initiativeEntryForCombatToken(row, campaignId, true)
              : initiativeEntryForToken(row, typeof value === "number" ? value : undefined)
        );
      } else {
        if (entries.some((entry) => entry.tokenId === tokenId)) return;
        entries.push(
          setup && typeof value !== "number"
            ? initiativeEntryForCombatToken(row, campaignId, true)
            : initiativeEntryForToken(row, typeof value === "number" ? value : undefined)
        );
      }
      entries.sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
      const nextTurn = activeId
        ? Math.max(
            0,
            entries.findIndex((entry) => entry.id === activeId)
          )
        : 0;
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), nextTurn, now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    on("initiative:reroll", ({ campaignId, entryId }) => {
      if (!requireGm(socket, campaignId)) return;
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const index = entries.findIndex((entry) => entry.id === entryId);
      if (index < 0) return;
      const activeId = entries[state.turn_index]?.id ?? null;
      const current = entries[index];
      const row = current.tokenId ? tokenRow(current.tokenId) : null;
      const members = current.groupId
        ? groupTokens(current.sceneId ?? row?.scene_id ?? "", current.groupId)
        : [];
      entries[index] = {
        ...(members.length
          ? initiativeEntryForGroup(members)
          : row
            ? initiativeEntryForToken(row)
            : { ...current, initiative: rollFormula("1d20", {}).d20 ?? 10 }),
        id: current.id,
        movementUsed: current.movementUsed ?? 0,
        diagonalSteps: current.diagonalSteps ?? 0,
        actionsUsed: current.actionsUsed ?? 0,
        reactionsUsed: current.reactionsUsed ?? 0,
      };
      entries.sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
      const nextTurn = activeId
        ? Math.max(
            0,
            entries.findIndex((entry) => entry.id === activeId)
          )
        : 0;
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), nextTurn, now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    on("initiative:remove", ({ campaignId, entryId }) => {
      if (!requireGm(socket, campaignId)) return;
      const state = ensureState(campaignId);
      const allEntries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const activeId = allEntries[state.turn_index]?.id ?? null;
      const entries = allEntries
        .filter((entry) => entry.id !== entryId)
        .map((entry) => ({ ...entry, movementUsed: 0, diagonalSteps: 0 }));
      const nextTurn =
        activeId && activeId !== entryId
          ? Math.max(
              0,
              entries.findIndex((entry) => entry.id === activeId)
            )
          : Math.min(state.turn_index, Math.max(0, entries.length - 1));
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), nextTurn, now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    on("pointer", ({ campaignId, sceneId, x, y }) => {
      if (!getMembership(campaignId, socket.data.user.id)) return;
      socket.to(room(campaignId)).emit("pointer:show", {
        userId: socket.data.user.id,
        displayName: socket.data.user.displayName,
        sceneId,
        x,
        y,
      });
    });

    socket.on("disconnect", () => {
      for (const campaignId of socket.data.campaigns) {
        removePresence(socket, campaignId);
        emitPresence(io, campaignId);
      }
    });
  });
}

export function onlinePresence(campaignId: string): PresenceUser[] {
  return presenceList(campaignId);
}
