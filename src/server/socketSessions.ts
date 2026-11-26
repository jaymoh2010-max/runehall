import type { FastifyInstance } from "fastify";

interface SocketSessionData {
  user?: { id?: string };
  sessionHash?: string;
}

/**
 * Disconnect the live sockets belonging to a user. Pass `sessionHash` to
 * revoke one device, or `exceptSessionHash` to keep the current device.
 */
export function disconnectUserSockets(
  app: FastifyInstance,
  userId: string,
  options: { sessionHash?: string; exceptSessionHash?: string } = {}
): number {
  const io = app.io;
  if (!io?.sockets?.sockets) return 0;
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    const data = socket.data as SocketSessionData;
    if (data.user?.id !== userId) continue;
    if (options.sessionHash && data.sessionHash !== options.sessionHash) continue;
    if (options.exceptSessionHash && data.sessionHash === options.exceptSessionHash) continue;
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
}
