import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { attachUser } from "./auth";
import { getAuditRetentionDays, pruneAuditLog } from "./audit";
import { registerAuthRoutes } from "./routes/auth";
import { registerAdminRoutes } from "./routes/admin";
import { registerAssetRoutes } from "./routes/assets";
import { registerCampaignRoutes } from "./routes/campaigns";
import { registerCharacterRoutes } from "./routes/characters";
import { registerCompendiumRoutes } from "./routes/compendium";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerEncounterRoutes } from "./routes/encounters";
import { registerInviteRoutes } from "./routes/invites";
import { registerLootRoutes } from "./routes/loot";
import { registerNpcRoutes } from "./routes/npcs";
import { registerSessionRoutes } from "./routes/sessions";
import { registerSystemRoutes } from "./routes/system";
import { registerTableRoutes } from "./routes/table";
import { registerUploadRoutes } from "./routes/uploads";
import { registerSecurity } from "./security";
import { setRevisionBroadcaster } from "./revisions";
import { compendiumCounts } from "./compendium";
import { db } from "./db";
import { registerSocketServer, type TypedServer } from "./socket";
import { uploadsDir } from "./util";

// Local-first: the compendium is read from data/compendium at boot.
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
  },
  trustProxy: true,
  bodyLimit: 3 * 1024 * 1024,
});

app.decorateRequest("user", null);
app.decorate("io", null as unknown as Server);
app.decorate(
  "broadcastCampaign",
  (
    campaignId: string,
    event: string,
    payload: unknown,
    target: "all" | "gm" | "players" = "all",
  ) => {
    const typed = app.io as unknown as TypedServer;
    if (!typed) return;
    const anyIo = typed as unknown as {
      to: (value: string) => {
        emit: (name: string, value: unknown) => void;
        except: (value: string) => { emit: (name: string, value: unknown) => void };
      };
    };
    if (target === "gm") {
      anyIo.to(`gm:${campaignId}`).emit(event, payload);
    } else if (target === "players") {
      anyIo.to(`campaign:${campaignId}`).except(`gm:${campaignId}`).emit(event, payload);
    } else {
      anyIo.to(`campaign:${campaignId}`).emit(event, payload);
    }
  },
);

setRevisionBroadcaster((campaignId, revision) => {
  app.broadcastCampaign(campaignId, "campaign:revision", { revision });
});

await app.register(cookie);
await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 10 },
});

registerSecurity(app);

app.addHook("preHandler", async (request) => {
  attachUser(request);
});

app.get("/api/health", async (_request, reply) => {
  let database: "ok" | "error" = "ok";
  try {
    db.prepare("SELECT 1").get();
  } catch {
    database = "error";
  }
  const compendiumReady = compendiumCounts.feats > 0 && compendiumCounts.monsters > 0;
  const ok = database === "ok" && compendiumReady;
  return reply.code(ok ? 200 : 503).send({
    ok,
    name: "Runehall",
    time: Date.now(),
    database,
    compendium: compendiumReady ? "ok" : "missing",
    counts: { feats: compendiumCounts.feats, monsters: compendiumCounts.monsters },
  });
});

await registerAuthRoutes(app);
await registerAdminRoutes(app);
await registerAssetRoutes(app);
await registerCampaignRoutes(app);
await registerCharacterRoutes(app);
await registerCompendiumRoutes(app);
await registerDashboardRoutes(app);
await registerEncounterRoutes(app);
await registerInviteRoutes(app);
await registerLootRoutes(app);
await registerNpcRoutes(app);
await registerSessionRoutes(app);
await registerSystemRoutes(app);
await registerTableRoutes(app);
await registerUploadRoutes(app);

const auditRetentionDays = getAuditRetentionDays();
if (auditRetentionDays > 0) {
  const pruned = pruneAuditLog(auditRetentionDays);
  if (pruned.deleted > 0) {
    app.log.info(
      { deleted: pruned.deleted, retentionDays: auditRetentionDays },
      "Pruned expired audit entries",
    );
  }
}

await app.register(fastifyStatic, {
  root: uploadsDir(),
  prefix: "/uploads/",
  decorateReply: false,
  cacheControl: true,
  maxAge: 1000 * 60 * 60 * 24 * 7,
});

const clientDir = path.resolve("dist", "client");
const hasClient = fs.existsSync(path.join(clientDir, "index.html"));
if (hasClient) {
  await app.register(fastifyStatic, {
    root: clientDir,
    prefix: "/",
    decorateReply: true,
    index: ["index.html"],
  });
}

const io = new Server(app.server, {
  path: "/socket.io",
  cors: {
    origin: true,
    credentials: true,
  },
  maxHttpBufferSize: 1_000_000,
});
registerSocketServer(io as TypedServer);
app.io = io as unknown as Server;

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith("/api/") || request.url.startsWith("/uploads/")) {
    return reply.code(404).send({ error: "Not found." });
  }
  if (hasClient && request.method === "GET" && !path.extname(request.url.split("?")[0])) {
    return reply.sendFile("index.html");
  }
  return reply
    .code(404)
    .send({ error: "Client is not built. Run the Vite dev server or `npm run build`." });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const err = error as { statusCode?: number; message?: string };
  const status = typeof err.statusCode === "number" && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    return reply.code(status).send({ error: "Something went wrong on the server." });
  }
  return reply.code(status).send({ error: err.message || "Request failed." });
});

const address = await app.listen({ port, host });
app.log.info(`Runehall listening at ${address}`);
app.log.info(`Local: http://localhost:${port}`);
if (!hasClient) {
  app.log.info("Client bundle not found yet — use `npm run dev` and open http://localhost:5173");
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down...`);
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
