import type { Server, Socket } from "socket.io";
import { getCampaignRole, getCharacter, getMembership, getUser } from "./access";
import { contextForDraft } from "./compendium";
import { db, type MessageRow, type SceneRow, type TokenRow } from "./db";
import { userFromCookieHeader } from "./auth";
import { now, newId, safeInt, safeString, parseJson, clamp, sanitizeUserText } from "./util";
import { characterSummary, computeCharacter, normalizeCharacterDraft } from "../shared/rules";
import { rollFormula, validateFormula } from "../shared/dice";
import { normalizeTokenConditions, tickTokenConditions } from "../shared/tokens";
import { sortInitiativeEntries } from "../shared/initiative";
import { applyGridPath } from "../shared/movement";
import { blockingPropForMove } from "../shared/collision";
import { findPathAroundProps } from "../shared/pathfinding";
import { normalizeAoeTemplate, normalizeAoeTemplates } from "../shared/templates";
import { blockingWallForMove, normalizeWalls } from "../shared/walls";
import { normalizeSceneProps } from "../shared/props";
import { normalizeTokenVisionMode } from "../shared/lighting";
import type {
  ClientToServerEvents,
  InitiativeEntry,
  PresenceUser,
  PublicUser,
  ServerToClientEvents,
  Token,
} from "../shared/types";
import {
  serializeInitiative,
  serializeMessage,
  serializeScene,
  serializeToken,
  touchCampaign,
} from "./serialize";

interface SocketData {
  user: PublicUser;
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
  io.to(room(campaignId)).emit("initiative:updated", {
    entries: serializeInitiative(JSON.parse(state.initiative || "[]")),
    round: state.round,
    turnIndex: state.turn_index,
  });
}

function perceptionForToken(row: TokenRow): number {
  if (!row.character_id) return 0;
  const character = getCharacter(row.character_id);
  if (!character) return 0;
  try {
    const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
    return computeCharacter(draft, contextForDraft(draft)).perception;
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
  const bonus = row.initiative_bonus ?? perceptionForToken(row);
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
  };
}

function initiativeEntryForGroup(rows: TokenRow[]): InitiativeEntry {
  const anchor = rows[0];
  const rolled = rollFormula("1d20", {}).d20 ?? 10;
  const bonus = anchor.initiative_bonus ?? perceptionForToken(anchor);
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
  };
}

function groupTokens(sceneId: string, groupId: string): TokenRow[] {
  return db
    .prepare(
      "SELECT * FROM tokens WHERE scene_id = ? AND group_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(sceneId, groupId) as TokenRow[];
}

function tickConditionsForEntry(
  io: TypedServer,
  campaignId: string,
  entry: InitiativeEntry | undefined
): boolean {
  if (!entry) return false;
  let rows: TokenRow[] = [];
  if (entry.groupId && entry.sceneId) rows = groupTokens(entry.sceneId, entry.groupId);
  else if (entry.tokenId) {
    const row = tokenRow(entry.tokenId);
    if (row) rows = [row];
  }
  let changed = false;
  for (const row of rows) {
    const current = normalizeTokenConditions(parseJson(row.conditions, []));
    const next = tickTokenConditions(current);
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    db.prepare("UPDATE tokens SET conditions = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(next),
      now(),
      row.id
    );
    const updated = tokenRow(row.id);
    if (updated) io.to(room(campaignId)).emit("token:updated", tokenWithOwner(updated));
    changed = true;
  }
  const characterIds = new Set(
    rows
      .map((row) => row.character_id)
      .filter((id): id is string => typeof id === "string" && Boolean(id))
  );
  for (const characterId of characterIds) {
    const character = getCharacter(characterId);
    if (!character) continue;
    try {
      const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
      const current = draft.play.conditions;
      const next = tickTokenConditions(current);
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      draft.play.conditions = next;
      const summary = characterSummary(draft, contextForDraft(draft));
      db.prepare(
        "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
      ).run(JSON.stringify(draft), JSON.stringify(summary), now(), characterId);
      io.to(room(campaignId)).emit("character:updated", {
        characterId,
        summary,
        name: draft.name,
      });
      changed = true;
    } catch {
      // A malformed draft should not block the initiative advance.
    }
  }
  return changed;
}

function initiativeEntriesForTokens(tokens: TokenRow[]): InitiativeEntry[] {
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
    ...singles.map((token) => initiativeEntryForToken(token)),
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
      const summary = JSON.parse(character.summary) as { hp?: number; ac?: number };
      if (hpMax === null && typeof summary.hp === "number") hpMax = summary.hp;
      if (ac === null && typeof summary.ac === "number") ac = summary.ac;
      hpCurrent = hpMax;
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
  const visionMode = normalizeTokenVisionMode(incoming.visionMode);
  const groupId = incoming.groupId ? safeString(incoming.groupId, "", 80) || null : null;
  const groupName = groupId ? safeString(incoming.groupName, name, 80) : null;
  db.prepare(
    `INSERT INTO tokens (id, scene_id, name, image_url, character_id, owner_id, x, y, size, vision_radius, light_radius, vision_mode, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, hidden, locked, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sceneId,
    name,
    incoming.imageUrl ? safeString(incoming.imageUrl, "", 500) : character ? null : null,
    character?.id ?? null,
    ownerId,
    x,
    y,
    size,
    visionRadius,
    lightRadius,
    visionMode,
    safeString(incoming.color, "#c8a96b", 30),
    hpCurrent,
    hpMax,
    ac,
    initiativeBonus,
    groupId,
    groupName,
    JSON.stringify(normalizeTokenConditions(incoming.conditions)),
    incoming.hidden ? 1 : 0,
    incoming.locked ? 1 : 0,
    Date.now(),
    ts,
    ts
  );
  const row = tokenRow(id)!;
  const token = tokenWithOwner(row);
  io.to(room(campaignId)).emit("token:created", token);
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
  const state = ensureState(campaignId);
  db.prepare(
    "UPDATE campaign_state SET initiative = ?, round = 1, turn_index = 0, active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
  ).run(JSON.stringify(entries), sceneId, now(), campaignId);
  broadcastInitiative(io, campaignId, ensureState(campaignId));
}

export function registerSocketServer(io: TypedServer): void {
  io.use((socket, next) => {
    const user = userFromCookieHeader(socket.handshake.headers.cookie);
    if (!user) return next(new Error("unauthorized"));
    socket.data.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      isAdmin: Boolean(user.is_admin),
    };
    socket.data.campaigns = new Set();
    next();
  });

  io.on("connection", (socket: TypedSocket) => {
    socket.on("campaign:join", ({ campaignId }, ack) => {
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) {
        sendError(socket, "You're not a member of that campaign.");
        ack?.({ ok: false });
        return;
      }
      socket.join(room(campaignId));
      if (role === "gm") socket.join(gmRoom(campaignId));
      socket.data.campaigns.add(campaignId);
      addPresence(socket, campaignId, role);
      emitPresence(io, campaignId);
      ack?.({ ok: true, role });
    });

    socket.on("campaign:leave", ({ campaignId }) => {
      socket.leave(room(campaignId));
      socket.leave(gmRoom(campaignId));
      socket.data.campaigns.delete(campaignId);
      removePresence(socket, campaignId);
      emitPresence(io, campaignId);
    });

    socket.on("token:move", ({ campaignId, sceneId, tokenId, x, y }) => {
      const row = tokenRow(tokenId);
      if (!row || row.scene_id !== sceneId) return;
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      if (role !== "gm" && (row.owner_id !== socket.data.user.id || row.locked)) {
        sendError(socket, "You can only move your own unlocked token.");
        return;
      }
      const nx = clamp(Number(x) || 0, 0, scene.width);
      const ny = clamp(Number(y) || 0, 0, scene.height);
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      const active = entries[state.turn_index];
      const activeMatch = Boolean(
        active && active.sceneId === sceneId && active.tokenId === tokenId
      );
      let targetX = nx;
      let targetY = ny;
      let pathPoints: Array<{ x: number; y: number }> | null = null;
      const props = normalizeSceneProps(parseJson(scene.props, []));
      const walls = normalizeWalls(parseJson(scene.walls, []));
      const blockedProp = scene.prop_collision
        ? blockingPropForMove(
            props,
            { size: row.size },
            { x: row.x, y: row.y },
            { x: nx, y: ny },
            scene.grid_size,
            true
          )
        : null;
      const blockedWall = scene.wall_collision
        ? blockingWallForMove(walls, { x: row.x, y: row.y }, { x: nx, y: ny })
        : null;
      if (blockedProp || blockedWall) {
        const speed = speedForToken(row);
        const budget =
          role !== "gm" && activeMatch && speed !== null
            ? Math.max(0, speed - Math.max(0, active.movementUsed ?? 0))
            : null;
        const path = findPathAroundProps({
          props,
          propCollision: Boolean(scene.prop_collision),
          walls,
          wallCollision: Boolean(scene.wall_collision),
          gridSize: scene.grid_size,
          gridOffsetX: scene.grid_offset_x,
          gridOffsetY: scene.grid_offset_y,
          width: scene.width,
          height: scene.height,
          tokenSize: row.size,
          from: { x: row.x, y: row.y },
          to: { x: nx, y: ny },
          budget,
          diagonalStart: activeMatch ? (active.diagonalSteps ?? 0) : 0,
        });
        if (!path.points.length) {
          const blocker = blockedProp ? blockedProp.name : "the blocking wall";
          sendError(
            socket,
            path.unreachable
              ? `There is no path around ${blocker}.`
              : `Not enough movement left to get around ${blocker}.`
          );
          io.to(room(campaignId)).emit("token:moved", {
            tokenId,
            sceneId,
            x: row.x,
            y: row.y,
          });
          return;
        }
        const last = path.points[path.points.length - 1];
        targetX = last.x;
        targetY = last.y;
        pathPoints = path.points;
      }
      const movement = activeMatch
        ? applyGridPath(
            {
              movementUsed: active.movementUsed ?? 0,
              diagonalSteps: active.diagonalSteps ?? 0,
            },
            { x: row.x, y: row.y },
            pathPoints ?? [{ x: targetX, y: targetY }],
            scene.grid_size
          )
        : null;
      db.prepare("UPDATE tokens SET x = ?, y = ?, updated_at = ? WHERE id = ?").run(
        targetX,
        targetY,
        now(),
        tokenId
      );
      io.to(room(campaignId)).emit("token:moved", {
        tokenId,
        sceneId,
        x: targetX,
        y: targetY,
      });
      if (active && movement && movement.feet > 0) {
        entries[state.turn_index] = {
          ...active,
          movementUsed: movement.movementUsed,
          diagonalSteps: movement.diagonalSteps,
        };
        db.prepare(
          "UPDATE campaign_state SET initiative = ?, updated_at = ? WHERE campaign_id = ?"
        ).run(JSON.stringify(entries), now(), campaignId);
        broadcastInitiative(io, campaignId, ensureState(campaignId));
      }
      touchCampaign(campaignId);
    });

    socket.on("token:create", ({ campaignId, sceneId, token }, ack) => {
      const created = createToken(socket, io, campaignId, sceneId, token ?? {});
      ack?.(created);
    });

    socket.on("token:update", ({ campaignId, token }) => {
      if (!token?.id) return;
      const row = tokenRow(token.id);
      if (!row) return;
      const role = getCampaignRole(campaignId, socket.data.user.id);
      if (!role) return;
      const scene = db
        .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
        .get(row.scene_id, campaignId) as SceneRow | undefined;
      if (!scene) return;
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
        if (token.imageUrl !== undefined)
          add("image_url", token.imageUrl ? safeString(token.imageUrl, "", 500) : null);
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
      if (token.conditions !== undefined) {
        add("conditions", JSON.stringify(normalizeTokenConditions(token.conditions)));
      }
      if (!updates.length) return;
      values.push(now(), token.id);
      db.prepare(`UPDATE tokens SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`).run(
        ...values
      );
      const updated = tokenRow(token.id);
      if (updated) io.to(room(campaignId)).emit("token:updated", tokenWithOwner(updated));
      // A GM changing a linked token's HP is a table action; mirror it into
      // the character sheet so the player's next view is consistent.
      if (updated?.character_id && token.hpCurrent !== undefined) {
        const character = getCharacter(updated.character_id);
        if (character) {
          try {
            const draft = normalizeCharacterDraft(JSON.parse(character.data), character.name);
            draft.play.hp =
              updated.hp_current === null
                ? null
                : Math.max(0, Math.min(1_000_000, Number(updated.hp_current)));
            const summary = characterSummary(draft, contextForDraft(draft));
            db.prepare(
              "UPDATE characters SET data = ?, summary = ?, updated_at = ?, revision = revision + 1 WHERE id = ?"
            ).run(JSON.stringify(draft), JSON.stringify(summary), now(), character.id);
            io.to(room(campaignId)).emit("character:updated", {
              characterId: character.id,
              summary,
              name: draft.name,
            });
          } catch {
            // A malformed draft shouldn't block the token update.
          }
        }
      }
      touchCampaign(campaignId);
    });

    socket.on("token:delete", ({ campaignId, tokenId }) => {
      if (!requireGm(socket, campaignId)) return;
      const row = tokenRow(tokenId);
      if (!row) return;
      const scene = sceneBelongs(row.scene_id, campaignId);
      if (!scene) return;
      db.prepare("DELETE FROM tokens WHERE id = ?").run(tokenId);
      io.to(room(campaignId)).emit("token:deleted", { tokenId, sceneId: row.scene_id });
      touchCampaign(campaignId);
    });

    socket.on("fog:update", ({ campaignId, sceneId, cells, mode }) => {
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
      io.to(room(campaignId)).emit("fog:updated", { sceneId, cells, mode });
      touchCampaign(campaignId);
    });

    socket.on("scene:activate", ({ campaignId, sceneId }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      ensureState(campaignId);
      db.prepare(
        "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(sceneId, now(), campaignId);
      io.to(room(campaignId)).emit("scene:activated", { sceneId });
      touchCampaign(campaignId);
    });

    socket.on("scene:update", ({ campaignId, scene }) => {
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
      io.to(room(campaignId)).emit("scene:updated", serializeScene(updated));
      touchCampaign(campaignId);
    });

    socket.on("scene:create", ({ campaignId, scene }, ack) => {
      if (!requireGm(socket, campaignId)) {
        ack?.(null);
        return;
      }
      const id = newId("scene");
      const ts = now();
      const width = clamp(safeInt(scene.width, 1600, 100, 10_000), 100, 10_000);
      const height = clamp(safeInt(scene.height, 1000, 100, 10_000), 100, 10_000);
      const grid = clamp(safeInt(scene.gridSize, 70, 20, 300), 20, 300);
      const order = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM scenes WHERE campaign_id = ?"
        )
        .get(campaignId) as { next: number };
      db.prepare(
        `INSERT INTO scenes (id, campaign_id, name, image_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1, '[]', ?, ?, ?)`
      ).run(
        id,
        campaignId,
        safeString(scene.name, "New Scene", 80),
        scene.imageUrl ? safeString(scene.imageUrl, "", 500) : null,
        width,
        height,
        grid,
        order.next,
        ts,
        ts
      );
      const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow;
      const serialized = serializeScene(row);
      io.to(room(campaignId)).emit("scene:created", serialized);
      ack?.(serialized);
      touchCampaign(campaignId);
    });

    socket.on("scene:delete", ({ campaignId, sceneId }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      db.prepare("DELETE FROM scenes WHERE id = ?").run(sceneId);
      const remaining = db
        .prepare("SELECT id FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC LIMIT 1")
        .get(campaignId) as { id: string } | undefined;
      const state = ensureState(campaignId);
      if (state.active_scene_id === sceneId) {
        db.prepare(
          "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
        ).run(remaining?.id ?? null, now(), campaignId);
        if (remaining) io.to(room(campaignId)).emit("scene:activated", { sceneId: remaining.id });
      }
      io.to(room(campaignId)).emit("scene:deleted", { sceneId });
      touchCampaign(campaignId);
    });

    socket.on("scene:reorder", ({ campaignId, sceneIds }) => {
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
      io.to(room(campaignId)).emit("scenes:reordered", scenes.map(serializeScene));
      touchCampaign(campaignId);
    });

    socket.on("template:add", ({ campaignId, sceneId, template }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      const normalized = normalizeAoeTemplate(template);
      if (!normalized) return;
      const templates = [
        ...normalizeAoeTemplates(parseJson(scene.templates, [])),
        normalized,
      ].slice(-20);
      db.prepare("UPDATE scenes SET templates = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(templates),
        now(),
        sceneId
      );
      io.to(room(campaignId)).emit("scene:templates", { sceneId, templates });
      touchCampaign(campaignId);
    });

    socket.on("template:clear", ({ campaignId, sceneId }) => {
      if (!requireGm(socket, campaignId)) return;
      const scene = sceneBelongs(sceneId, campaignId);
      if (!scene) return;
      db.prepare("UPDATE scenes SET templates = '[]', updated_at = ? WHERE id = ?").run(
        now(),
        sceneId
      );
      io.to(room(campaignId)).emit("scene:templates", { sceneId, templates: [] });
      touchCampaign(campaignId);
    });

    socket.on("scene:walls", ({ campaignId, sceneId, walls }) => {
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
      io.to(room(campaignId)).emit("scene:walls", { sceneId, walls: normalized });
      touchCampaign(campaignId);
    });

    socket.on("scene:props", ({ campaignId, sceneId, props }) => {
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
      io.to(room(campaignId)).emit("scene:props", { sceneId, props: normalized });
      touchCampaign(campaignId);
    });

    socket.on("chat:send", ({ campaignId, content, visibility }, ack) => {
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

    socket.on(
      "dice:roll",
      ({ campaignId, formula, label, dc, visibility, characterId, requestId }, ack) => {
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

    socket.on("dice:request", ({ campaignId, formula, label, dc, group }, ack) => {
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

    socket.on("initiative:roll", ({ campaignId, sceneId, tokenIds }) => {
      if (!requireGm(socket, campaignId)) return;
      if (!sceneBelongs(sceneId, campaignId)) return;
      rollInitiative(io, campaignId, sceneId, tokenIds);
      touchCampaign(campaignId);
    });

    socket.on("initiative:update", ({ campaignId, entries, round, turnIndex }) => {
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
            }))
        : [];
      const current = ensureState(campaignId);
      const nextTurn = safeInt(turnIndex, 0, 0, Math.max(0, clean.length - 1));
      const previousEntries = serializeInitiative(JSON.parse(current.initiative || "[]"));
      const previousActiveId = previousEntries[current.turn_index]?.id ?? null;
      const nextActiveId = clean[nextTurn]?.id ?? null;
      // A new combatant's turn starts with a fresh movement count. Tie-order
      // changes keep the same active id and preserve the current total.
      const normalized =
        previousActiveId === nextActiveId
          ? clean
          : clean.map((entry) => ({ ...entry, movementUsed: 0, diagonalSteps: 0 }));
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, round = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(
        JSON.stringify(normalized),
        safeInt(round, current.round, 1, 999),
        nextTurn,
        now(),
        campaignId
      );
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    socket.on("initiative:next", ({ campaignId, direction }) => {
      if (!requireGm(socket, campaignId)) return;
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      if (!entries.length) return;
      tickConditionsForEntry(io, campaignId, entries[state.turn_index]);
      const dir = direction === -1 ? -1 : 1;
      let turn = state.turn_index + dir;
      let round = state.round;
      if (turn >= entries.length) {
        turn = 0;
        round += 1;
      } else if (turn < 0) {
        turn = entries.length - 1;
        round = Math.max(1, round - 1);
      }
      // Movement is per turn. Reset both the turn that just ended and the
      // turn that is starting (the latter matters when stepping backward).
      if (entries[state.turn_index]) {
        entries[state.turn_index] = {
          ...entries[state.turn_index],
          movementUsed: 0,
          diagonalSteps: 0,
        };
      }
      if (entries[turn]) {
        entries[turn] = { ...entries[turn], movementUsed: 0, diagonalSteps: 0 };
      }
      if (entries[turn]?.readied) {
        entries[turn] = { ...entries[turn], readied: false };
      }
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = ?, round = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), turn, round, now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    socket.on("initiative:add", ({ campaignId, tokenId, value }) => {
      if (!requireGm(socket, campaignId)) return;
      const row = tokenRow(tokenId);
      if (!row) return;
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"));
      if (row.group_id) {
        if (entries.some((entry) => entry.groupId === row.group_id)) return;
        const members = groupTokens(row.scene_id, row.group_id);
        entries.push(
          members.length > 1
            ? initiativeEntryForGroup(members)
            : initiativeEntryForToken(row, typeof value === "number" ? value : undefined)
        );
      } else {
        if (entries.some((entry) => entry.tokenId === tokenId)) return;
        entries.push(initiativeEntryForToken(row, typeof value === "number" ? value : undefined));
      }
      entries.sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    socket.on("initiative:reroll", ({ campaignId, entryId }) => {
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

    socket.on("initiative:remove", ({ campaignId, entryId }) => {
      if (!requireGm(socket, campaignId)) return;
      const state = ensureState(campaignId);
      const entries = serializeInitiative(JSON.parse(state.initiative || "[]"))
        .filter((entry) => entry.id !== entryId)
        .map((entry) => ({ ...entry, movementUsed: 0, diagonalSteps: 0 }));
      db.prepare(
        "UPDATE campaign_state SET initiative = ?, turn_index = 0, updated_at = ? WHERE campaign_id = ?"
      ).run(JSON.stringify(entries), now(), campaignId);
      broadcastInitiative(io, campaignId, ensureState(campaignId));
      touchCampaign(campaignId);
    });

    socket.on("pointer", ({ campaignId, sceneId, x, y }) => {
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
