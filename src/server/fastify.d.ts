import type { Server } from "socket.io";
import type { PublicUser } from "../shared/types";

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }

  interface FastifyInstance {
    io: Server;
    broadcastCampaign(
      campaignId: string,
      event: string,
      payload: unknown,
      target?: "all" | "gm" | "players"
    ): void;
  }
}
