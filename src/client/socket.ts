import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../shared/types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let reconnectBound = false;

interface CampaignSubscription {
  count: number;
  acks: Set<(ok: unknown) => void>;
  result?: unknown;
}

const campaignSubscriptions = new Map<string, CampaignSubscription>();

function emitJoin(
  campaignId: string,
  instance: Socket<ServerToClientEvents, ClientToServerEvents>
) {
  instance.emit("campaign:join", { campaignId }, (ack) => {
    const subscription = campaignSubscriptions.get(campaignId);
    if (!subscription) return;
    subscription.result = ack;
    for (const callback of subscription.acks) callback(ack);
  });
}

function ensureReconnectBinding(): void {
  if (reconnectBound) return;
  reconnectBound = true;
  getSocket().on("connect", () => {
    for (const [campaignId, subscription] of campaignSubscriptions) {
      subscription.result = undefined;
      emitJoin(campaignId, getSocket());
    }
  });
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function connectSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}

/**
 * Join a campaign room with reference counting. Several parts of the campaign
 * page may need the same room at once (the table and the overview), and a
 * reconnect must restore every room that still has a subscriber.
 */
export function joinCampaign(campaignId: string, ack?: (ok: unknown) => void): () => void {
  const instance = connectSocket();
  ensureReconnectBinding();
  let subscription = campaignSubscriptions.get(campaignId);
  if (!subscription) {
    subscription = { count: 0, acks: new Set() };
    campaignSubscriptions.set(campaignId, subscription);
  }
  subscription.count += 1;
  if (ack) {
    subscription.acks.add(ack);
    if (subscription.result !== undefined) queueMicrotask(() => ack(subscription!.result));
  }
  if (subscription.count === 1 && instance.connected) {
    emitJoin(campaignId, instance);
  }
  return () => {
    const current = campaignSubscriptions.get(campaignId);
    if (!current) return;
    current.count -= 1;
    if (ack) current.acks.delete(ack);
    if (current.count > 0) return;
    campaignSubscriptions.delete(campaignId);
    instance.emit("campaign:leave", { campaignId });
  };
}

export function disconnectSocket(): void {
  campaignSubscriptions.clear();
  if (socket?.connected) socket.disconnect();
}
