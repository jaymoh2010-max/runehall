import type { FastifyInstance } from "fastify";
import { tokenBroadcaster, type TokenBroadcast } from "../shared/tokenBroadcast";
import { db } from "./db";

export {
  tokenBroadcaster,
  type BroadcastTarget,
  type TokenBroadcast,
} from "../shared/tokenBroadcast";

/** Scenes marked GM-only must never target the player room, even for tokens. */
export function sceneVisible(sceneId: string): boolean {
  const row = db.prepare("SELECT visible FROM scenes WHERE id = ?").get(sceneId) as
    { visible: number } | undefined;
  return row ? Number(row.visible) !== 0 : false;
}

export function tokenEventsFor(app: FastifyInstance, campaignId: string) {
  return tokenBroadcaster(
    (event, payload, target = "all") => app.broadcastCampaign(campaignId, event, payload, target),
    sceneVisible
  );
}
