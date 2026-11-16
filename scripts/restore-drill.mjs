#!/usr/bin/env node
/**
 * End-to-end backup drill: create real data on an isolated server, take a
 * live backup, ship it to a second directory, prove a corrupted copy is
 * refused, restore into a fresh data directory, and boot the restored server.
 *
 * Usage:
 *   npm run restore-drill
 *
 * DATA_DIR, DATABASE_PATH, BACKUP_DIR, and PORT are overridden inside the
 * drill so it never touches the normal development data.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "runehall-restore-drill-"));
const sourceData = path.join(tempDir, "source-data");
const restoredData = path.join(tempDir, "restored-data");
const tamperedData = path.join(tempDir, "tampered-data");
const localBackups = path.join(tempDir, "backups");
const offsite = path.join(tempDir, "offsite");
const compendiumDir = path.resolve(
  process.env.COMPENDIUM_DIR || path.join(projectRoot, "data", "compendium")
);
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const username = "restore_drill_gm";
const password = "restore-drill-password-123";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlwAAAABJRU5ErkJggg==",
  "base64"
);

let activeServer = null;
let base = "";
let exitCode = 1;

function log(step) {
  console.log(`  ✓ ${step}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function startServer(dataDir, port) {
  const child = spawn(process.execPath, [tsxCli, "src/server/index.ts"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      DATABASE_PATH: path.join(dataDir, "runehall.db"),
      COMPENDIUM_DIR: compendiumDir,
      LOG_LEVEL: "error",
      NODE_ENV: "production",
      ENABLE_CSP: "0",
      COOKIE_SECURE: "0",
      REGISTRATION_MODE: "open",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { output: "" };
  child.stdout.on("data", (chunk) => (state.output += chunk.toString()));
  child.stderr.on("data", (chunk) => (state.output += chunk.toString()));
  return { child, state };
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.child.once("exit", resolve)), delay(1500)]);
  if (server.child.exitCode === null) server.child.kill("SIGKILL");
}

async function waitForServer(server) {
  // The first tsx boot in a cold container can take a while; the earlier
  // 30-second window was too tight for the Docker restore drill.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Server exited during startup.\n${server.state.output}`);
    }
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await delay(250);
  }
  throw new Error(`Server did not become healthy within 60 seconds.\n${server.state.output}`);
}

function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function api(pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return { payload, cookie: cookiesFrom(response) };
}

function runScript(script, args, env, allowFailure = false) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${script} failed (${result.status}).\n${result.stdout ?? ""}${result.stderr ?? ""}`
    );
  }
  return result;
}

function newestArchive(directory) {
  const archive = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runehall-"))
    .map((entry) => entry.name)
    .sort()
    .reverse()[0];
  return archive ? path.join(directory, archive) : null;
}

async function main() {
  console.log("Starting isolated restore-drill server…");
  fs.mkdirSync(sourceData, { recursive: true });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  activeServer = startServer(sourceData, port);
  await waitForServer(activeServer);
  log("source server is healthy");

  const register = await api("/api/auth/register", {
    method: "POST",
    body: {
      username,
      displayName: "Restore Drill GM",
      password,
    },
  });
  const cookie = register.cookie;

  const campaignResult = await api("/api/campaigns", {
    method: "POST",
    cookie,
    body: {
      name: "Restore Drill Campaign",
      description: "Proves backup, shipping, and restore preserve real data.",
      ruleset: "expanded",
    },
  });
  const campaign = campaignResult.payload.campaign;

  const form = new FormData();
  form.append("file", new Blob([pixel], { type: "image/png" }), "restore-drill-clue.png");
  const uploadResponse = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { cookie, "x-campaign-id": campaign.id },
    body: form,
  });
  const upload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed (${uploadResponse.status}): ${JSON.stringify(upload)}`);
  }
  log("created a campaign and uploaded an asset");

  const backupEnv = {
    DATA_DIR: sourceData,
    DATABASE_PATH: path.join(sourceData, "runehall.db"),
    BACKUP_DIR: localBackups,
    COMPENDIUM_DIR: compendiumDir,
  };
  runScript("scripts/backup.mjs", ["--keep", "2"], backupEnv);
  const archive = newestArchive(localBackups);
  if (!archive) throw new Error("Backup did not create an archive.");
  log("created a live backup while the server was running");

  runScript("scripts/ship-backup.mjs", ["--from", archive, "--to", offsite, "--keep", "1"], {
    BACKUP_DIR: localBackups,
  });
  const shipped = path.join(offsite, path.basename(archive));
  if (!fs.existsSync(shipped)) throw new Error("Shipped archive is missing.");
  log("shipped and verified the backup to a separate directory");

  await stopServer(activeServer);
  activeServer = null;
  log("source server stopped for restore");

  const tampered = path.join(tempDir, "tampered-archive");
  fs.cpSync(shipped, tampered, { recursive: true });
  fs.appendFileSync(path.join(tampered, "uploads", upload.filename), "tampered");
  const tamperResult = runScript(
    "scripts/restore.mjs",
    ["--from", tampered, "--yes"],
    {
      ...backupEnv,
      DATA_DIR: tamperedData,
      DATABASE_PATH: path.join(tamperedData, "runehall.db"),
      PORT: String(port),
    },
    true
  );
  if (tamperResult.status === 0) {
    throw new Error("Restore accepted an archive with a corrupted file.");
  }
  if (fs.existsSync(path.join(tamperedData, "runehall.db"))) {
    throw new Error("Corrupted restore changed the target data directory.");
  }
  log("corrupted archive refused before any data was changed");

  const restoreEnv = {
    ...backupEnv,
    DATA_DIR: restoredData,
    DATABASE_PATH: path.join(restoredData, "runehall.db"),
    PORT: String(port),
  };
  runScript("scripts/restore.mjs", ["--from", shipped, "--yes"], restoreEnv);
  if (!fs.existsSync(path.join(restoredData, "runehall.db"))) {
    throw new Error("Restore did not create the target database.");
  }
  if (!fs.existsSync(path.join(restoredData, "uploads", upload.filename))) {
    throw new Error("Restore did not copy uploaded assets.");
  }
  log("restored the database and uploads into a fresh data directory");

  activeServer = startServer(restoredData, port);
  await waitForServer(activeServer);
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  const restoredCampaigns = await api("/api/campaigns", { cookie: login.cookie });
  const restoredCampaign = restoredCampaigns.payload.campaigns.find(
    (entry) => entry.id === campaign.id
  );
  if (!restoredCampaign) throw new Error("Restored campaign is missing.");
  if (restoredCampaign.name !== campaign.name) {
    throw new Error("Restored campaign name changed.");
  }
  if (restoredCampaign.inviteCode !== campaign.inviteCode) {
    throw new Error("Restored campaign invite code changed.");
  }

  const assets = await api(`/api/campaigns/${campaign.id}/assets`, {
    cookie: login.cookie,
  });
  const restoredAsset = assets.payload.assets.find((asset) => asset.filename === upload.filename);
  if (!restoredAsset) throw new Error("Restored uploaded asset is missing.");
  const fileResponse = await fetch(`${base}${restoredAsset.url}`, {
    headers: { cookie: login.cookie },
  });
  if (!fileResponse.ok) {
    throw new Error(`Restored upload could not be read (${fileResponse.status}).`);
  }
  const restoredBytes = Buffer.from(await fileResponse.arrayBuffer());
  if (!restoredBytes.equals(pixel)) {
    throw new Error("Restored upload contents changed.");
  }
  log("restored server is healthy and the campaign, invite code, and upload match");

  console.log("\nRestore drill passed end to end.");
  exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error("\nRestore drill failed.");
  console.error(error);
  if (activeServer?.child.exitCode === null) {
    console.error(activeServer.state.output);
  }
  exitCode = 1;
} finally {
  if (activeServer) await stopServer(activeServer);
  try {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(
      `Could not remove temporary drill directory ${tempDir}:`,
      error instanceof Error ? error.message : error
    );
  }
  process.exit(exitCode);
}
