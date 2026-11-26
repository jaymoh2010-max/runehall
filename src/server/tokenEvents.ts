import type { FastifyInstance } from "fastify";
import type { Token } from "../shared/types";
import { redactTokenForPlayers } from "../shared/tokenVisibility";
import { db } from "./db";

export type BroadcastTarget = "all" | "gm" | "players";
export type TokenBroadcast = (event: string, payload: unknown, target?: BroadcastTarget) => void;

/** Scenes marked GM-only must never target the player room, even for tokens. */
export function sceneVisible(sceneId: string): boolean {
  const row = db.prepare("SELECT visible FROM scenes WHERE id = ?").get(sceneId) as
    { visible: number } | undefined;
  return row ? Number(row.visible) !== 0 : false;
}

/**
 * Token events must not leak hidden tokens, hidden scenes, or creature defenses
 * to players. Keep the GM fully in sync and make hide/show transitions look
 * like a delete/create to players.
 */
export function tokenBroadcaster(
  broadcast: TokenBroadcast,
  isSceneVisible: (sceneId: string) => boolean = () => true
) {
  return {
    created(token: Token): void {
      broadcast("token:created", token, "gm");
      if (token.hidden || !isSceneVisible(token.sceneId)) return;
      broadcast("token:created", redactTokenForPlayers(token), "players");
    },
    updated(token: Token, previousHidden: boolean): void {
      const visibleScene = isSceneVisible(token.sceneId);
      if (Boolean(previousHidden) === token.hidden) {
        broadcast("token:updated", token, "gm");
        if (!token.hidden && visibleScene) {
          broadcast("token:updated", redactTokenForPlayers(token), "players");
        }
        return;
      }
      broadcast("token:updated", token, "gm");
      if (!visibleScene) return;
      if (token.hidden) {
        broadcast("token:deleted", { tokenId: token.id, sceneId: token.sceneId }, "players");
      } else {
        broadcast("token:created", redactTokenForPlayers(token), "players");
      }
    },
    moved(
      payload: { tokenId: string; sceneId: string; x: number; y: number },
      hidden: boolean
    ): void {
      const visibleScene = isSceneVisible(payload.sceneId);
      broadcast("token:moved", payload, hidden || !visibleScene ? "gm" : "all");
    },
    deleted(payload: { tokenId: string; sceneId?: string }, hidden: boolean): void {
      const visibleScene = payload.sceneId ? isSceneVisible(payload.sceneId) : true;
      broadcast("token:deleted", payload, hidden || !visibleScene ? "gm" : "all");
    },
  };
}

export function tokenEventsFor(app: FastifyInstance, campaignId: string) {
  return tokenBroadcaster(
    (event, payload, target = "all") => app.broadcastCampaign(campaignId, event, payload, target),
    sceneVisible
  );
}
