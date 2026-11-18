import type { FastifyInstance } from "fastify";
import type { Token } from "../shared/types";

export type BroadcastTarget = "all" | "gm" | "players";
export type TokenBroadcast = (event: string, payload: unknown, target?: BroadcastTarget) => void;

/**
 * Token events must not leak hidden tokens to players. Keep the GM fully in
 * sync and make hide/show transitions look like a delete/create to players.
 */
export function tokenBroadcaster(broadcast: TokenBroadcast) {
  return {
    created(token: Token): void {
      broadcast("token:created", token, token.hidden ? "gm" : "all");
    },
    updated(token: Token, previousHidden: boolean): void {
      if (Boolean(previousHidden) === token.hidden) {
        broadcast("token:updated", token, token.hidden ? "gm" : "all");
        return;
      }
      broadcast("token:updated", token, "gm");
      if (token.hidden) {
        broadcast("token:deleted", { tokenId: token.id, sceneId: token.sceneId }, "players");
      } else {
        broadcast("token:created", token, "players");
      }
    },
    moved(
      payload: { tokenId: string; sceneId: string; x: number; y: number },
      hidden: boolean
    ): void {
      broadcast("token:moved", payload, hidden ? "gm" : "all");
    },
    deleted(payload: { tokenId: string; sceneId?: string }, hidden: boolean): void {
      broadcast("token:deleted", payload, hidden ? "gm" : "all");
    },
  };
}

export function tokenEventsFor(app: FastifyInstance, campaignId: string) {
  return tokenBroadcaster((event, payload, target = "all") =>
    app.broadcastCampaign(campaignId, event, payload, target)
  );
}
