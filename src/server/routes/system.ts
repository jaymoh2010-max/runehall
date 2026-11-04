import os from "node:os";
import type { FastifyInstance } from "fastify";

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/system/network", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const addresses: { name: string; address: string }[] = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family !== "IPv4" || entry.internal) continue;
        addresses.push({ name, address: entry.address });
      }
    }
    return reply.send({
      addresses,
      port: Number(process.env.PORT || 3001),
      hostname: os.hostname(),
    });
  });
}
