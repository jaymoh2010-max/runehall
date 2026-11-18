import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import { attachUser } from "./auth";
import { getMembership } from "./access";
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
import { isTrustedOrigin, registerSecurity } from "./security";
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
  // Trust exactly one reverse proxy by default; set TRUST_PROXY_HOPS=0 if the
  // app is exposed directly, or 2 for a CDN + reverse proxy chain.
  trustProxy: (_address, hop) => {
    const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
    return Number.isFinite(hops) && hop < hops;
  },
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
    target: "all" | "gm" | "players" = "all"
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
  }
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

// Uploaded campaign files are private. The public URL is only a capability;
// require a session, and require campaign membership for campaign assets.
app.addHook("preHandler", async (request, reply) => {
  if (!request.url.startsWith("/uploads/")) return;
  if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
  let filename: string;
  try {
    filename = decodeURIComponent(request.url.slice("/uploads/".length).split("?")[0]);
  } catch {
    return reply.code(404).send({ error: "Not found." });
  }
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    return reply.code(404).send({ error: "Not found." });
  }
  const asset = db
    .prepare("SELECT campaign_id FROM uploaded_assets WHERE filename = ?")
    .get(filename) as { campaign_id: string | null } | undefined;
  if (asset?.campaign_id && !getMembership(asset.campaign_id, request.user.id)) {
    return reply.code(403).send({ error: "You can't view that asset." });
  }
  reply.header("Cache-Control", "private, no-store");
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
      "Pruned expired audit entries"
    );
  }
}

await app.register(fastifyStatic, {
  root: uploadsDir(),
  prefix: "/uploads/",
  decorateReply: false,
  cacheControl: false,
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
  // The client is same-origin. Do not reflect arbitrary browser origins.
  cors: { origin: false },
  allowRequest: (request, callback) => {
    callback(null, isTrustedOrigin(request.headers.origin, request.headers.host));
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
