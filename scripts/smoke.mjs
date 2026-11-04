#!/usr/bin/env node
/**
 * End-to-end smoke test with two real users and two sockets, against a
 * throwaway SQLite database. It starts its own server process, so it can be
 * run while the normal development server is active (as long as the chosen
 * port is free).
 *
 * Usage: npm run smoke
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { io } from "socket.io-client";

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "runehall-smoke-"));
const databasePath = path.join(tempDir, "runehall.db");
const compendiumDir = path.join(projectRoot, "data", "compendium");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

let child;
let base;
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

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await delay(250);
  }
  throw new Error("Server did not become healthy within 30 seconds.");
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
    throw new Error(`${method} ${pathname} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return { payload, cookie: cookiesFrom(response) };
}

function waitForEvent(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const handler = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(value);
    };
    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} ack`)), timeout);
    socket.emit(event, payload, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function connectSocket(cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

async function main() {
  console.log("Starting isolated Runehall server…");
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [tsxCli, "src/server/index.ts"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: tempDir,
      DATABASE_PATH: databasePath,
      COMPENDIUM_DIR: compendiumDir,
      LOG_LEVEL: "error",
      NODE_ENV: "production",
      ENABLE_CSP: "1",
      COOKIE_SECURE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  child.stdout.on("data", (chunk) => (serverOutput += chunk.toString()));
  child.stderr.on("data", (chunk) => (serverOutput += chunk.toString()));
  child.once("exit", (code) => {
    if (code && code !== 0) console.error(serverOutput);
  });

  await waitForServer(base);
  log("isolated server is healthy");

  const healthResponse = await fetch(`${base}/api/health`);
  if (healthResponse.headers.get("x-content-type-options") !== "nosniff") {
    throw new Error("Security headers are missing");
  }
  if (!healthResponse.headers.get("content-security-policy")?.includes("script-src 'self'")) {
    throw new Error("Production CSP is missing");
  }
  const evilOrigin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({ username: "nobody", password: "not-a-password" }),
  });
  if (evilOrigin.status !== 403) {
    throw new Error(`Foreign-origin request was not rejected (${evilOrigin.status})`);
  }
  log("security headers and same-origin enforcement are active");

  const gmRegister = await api("/api/auth/register", {
    method: "POST",
    body: { username: "smoke_gm", displayName: "Smoke GM", password: "smoke-password-123" },
  });
  const gmCookie = gmRegister.cookie;
  const gm = gmRegister.payload.user;
  log("GM account created");

  const playerRegister = await api("/api/auth/register", {
    method: "POST",
    body: { username: "smoke_player", displayName: "Smoke Player", password: "smoke-password-123" },
  });
  const playerCookie = playerRegister.cookie;
  const player = playerRegister.payload.user;
  log("player account created");

  if (!gm.isAdmin) throw new Error("The first account did not become the instance administrator");
  if (player.isAdmin) throw new Error("A later account was incorrectly made an administrator");

  const authConfig = await api("/api/auth/config");
  if (!authConfig.payload.registration.canRegister) {
    throw new Error("Open registration was reported as unavailable");
  }
  log("first-user bootstrap granted the administrator role");

  const inviteMode = await api("/api/admin/registration", {
    method: "PUT",
    cookie: gmCookie,
    body: { mode: "invite" },
  });
  if (inviteMode.payload.registration.mode !== "invite") {
    throw new Error("Registration mode did not switch to invite-only");
  }
  const blockedRegister = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "smoke_blocked",
      displayName: "Blocked User",
      password: "smoke-password-123",
    }),
  });
  if (blockedRegister.status !== 400) {
    throw new Error(`Invite-only registration without a code returned ${blockedRegister.status}`);
  }
  const inviteResult = await api("/api/admin/invites", {
    method: "POST",
    cookie: gmCookie,
    body: { note: "smoke invited player", expiresInDays: 1 },
  });
  const registrationInvite = inviteResult.payload.invite;
  const invitedRegister = await api("/api/auth/register", {
    method: "POST",
    body: {
      username: "smoke_invited",
      displayName: "Invited Player",
      password: "smoke-password-123",
      inviteCode: registrationInvite.code,
    },
  });
  const invitedCookie = invitedRegister.cookie;
  const invited = invitedRegister.payload.user;
  const reusedInvite = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "smoke_reuse",
      displayName: "Reuse Attempt",
      password: "smoke-password-123",
      inviteCode: registrationInvite.code,
    }),
  });
  if (reusedInvite.status !== 400) {
    throw new Error(`A used invite code was accepted (${reusedInvite.status})`);
  }
  await api("/api/auth/password", {
    method: "POST",
    cookie: invitedCookie,
    body: { currentPassword: "smoke-password-123", newPassword: "smoke-password-456" },
  });
  const relogin = await api("/api/auth/login", {
    method: "POST",
    body: { username: invited.username, password: "smoke-password-456" },
  });
  if (!relogin.payload.user?.id) throw new Error("Password change did not allow a fresh sign-in");
  await api("/api/admin/registration", {
    method: "PUT",
    cookie: gmCookie,
    body: { mode: "open" },
  });
  const auditResult = await api("/api/admin/audit?limit=100", { cookie: gmCookie });
  const actions = new Set(auditResult.payload.entries.map((entry) => entry.action));
  for (const required of ["auth.register", "auth.login", "auth.password_change", "admin.invite_create"]) {
    if (!actions.has(required)) throw new Error(`Audit log is missing ${required}`);
  }
  log("invite-only registration, password change, and audit logging verified");

  const campaignResult = await api("/api/campaigns", {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Smoke Test Campaign",
      description: "Temporary verification campaign.",
      ruleset: "expanded",
    },
  });
  const campaign = campaignResult.payload.campaign;
  log("GM created campaign");

  const invitePreview = await api(`/api/invites/${campaign.inviteCode}`);
  if (invitePreview.payload.campaign.id !== campaign.id) throw new Error("Invite preview mismatch");
  log("public invite preview resolves");

  const characterResult = await api("/api/characters", {
    method: "POST",
    cookie: playerCookie,
    body: { name: "Smoke Hero" },
  });
  const character = characterResult.payload.character;
  const joinResult = await api("/api/campaigns/join", {
    method: "POST",
    cookie: playerCookie,
    body: { code: campaign.inviteCode, characterId: character.id },
  });
  if (joinResult.payload.campaign.role !== "player") throw new Error("Player role missing after join");
  if (joinResult.payload.character?.data?.contentMode !== "expanded") {
    throw new Error("Player character did not inherit the campaign ruleset");
  }
  log("player joined and inherited the expanded campaign ruleset");

  const gmCampaigns = await api("/api/campaigns", { cookie: gmCookie });
  const playerCampaigns = await api("/api/campaigns", { cookie: playerCookie });
  if (!gmCampaigns.payload.campaigns.some((entry) => entry.id === campaign.id)) {
    throw new Error("Campaign missing from GM My Campaigns");
  }
  if (!playerCampaigns.payload.campaigns.some((entry) => entry.id === campaign.id)) {
    throw new Error("Campaign missing from player My Campaigns");
  }
  log("campaign appears in both My Campaigns lists");

  const table = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const scene = table.payload.scenes[0];
  if (!scene) throw new Error("Campaign did not receive a default scene");
  const playerCharacter = table.payload.characters.find((entry) => entry.id === character.id);
  if (!playerCharacter) throw new Error("Player character missing from GM table snapshot");
  log("GM table snapshot contains the player's character");

  if (typeof table.payload.revision !== "number") {
    throw new Error("Table snapshot did not include a campaign revision");
  }
  const saveBase = playerCharacter;
  const savedSheet = await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: saveBase.data, expectedRevision: saveBase.revision },
  });
  if (savedSheet.payload.character.revision !== saveBase.revision + 1) {
    throw new Error("Character revision did not increment after a save");
  }
  const staleSave = await fetch(`${base}/api/characters/${character.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ data: saveBase.data, expectedRevision: saveBase.revision }),
  });
  if (staleSave.status !== 409) {
    throw new Error(`A stale character save was not rejected (${staleSave.status})`);
  }
  const forcedSave = await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: saveBase.data, force: true },
  });
  if (!forcedSave.payload.character.revision) {
    throw new Error("Forced character overwrite did not return a revision");
  }
  const revisedTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (revisedTable.payload.revision <= table.payload.revision) {
    throw new Error("Campaign revision did not advance after a character save");
  }
  log("character saves use optimistic revisions and reject stale writes");

  const exported = await api(`/api/campaigns/${campaign.id}/export`, { cookie: gmCookie });
  if (exported.payload.format !== "runehall-campaign" || !exported.payload.characters?.length) {
    throw new Error("Campaign export did not contain the expected data");
  }
  log("GM exported a portable campaign archive");

  const imported = await api("/api/campaigns/import", {
    method: "POST",
    cookie: gmCookie,
    body: exported.payload,
  });
  const importedCampaign = imported.payload.campaign;
  if (!importedCampaign || importedCampaign.id === campaign.id) {
    throw new Error("Campaign import did not create a new campaign");
  }
  if (!imported.payload.stats?.characters || !imported.payload.stats?.scenes) {
    throw new Error("Campaign import did not report the expected content");
  }
  const importedDetails = await api(`/api/campaigns/${importedCampaign.id}`, { cookie: gmCookie });
  if (importedDetails.payload.characters[0]?.userId !== player.id) {
    throw new Error("Imported character ownership was not remapped to the local player");
  }
  log("campaign import created a new campaign and remapped ownership");

  const swordSearch = await api("/api/compendium/equipment?q=longsword&limit=1", { cookie: gmCookie });
  const sword = swordSearch.payload.items[0];
  if (!sword) throw new Error("Smoke equipment search returned no longsword");
  const lootParcel = (
    await api(`/api/campaigns/${campaign.id}/loot`, {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Smoke Loot", description: "Temporary parcel." },
    })
  ).payload.parcel;
  const parcelWithItem = (
    await api(`/api/campaigns/${campaign.id}/loot/${lootParcel.id}/items`, {
      method: "POST",
      cookie: gmCookie,
      body: { itemId: sword.id, quantity: 2 },
    })
  ).payload.parcel;
  if (parcelWithItem.items[0]?.quantity !== 2) throw new Error("Loot item was not added");
  await api(`/api/campaigns/${campaign.id}/loot/${lootParcel.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { gp: 5, sp: 3, cp: 2 },
  });
  const distributedLoot = await api(`/api/campaigns/${campaign.id}/loot/${lootParcel.id}/distribute`, {
    method: "POST",
    cookie: gmCookie,
    body: { characterId: character.id },
  });
  if (distributedLoot.payload.parcel.status !== "distributed") {
    throw new Error("Loot parcel did not close after distribution");
  }
  const lootedSheet = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  const lootedStack = lootedSheet.payload.character.data.equipment.find((entry) => entry.itemId === sword.id);
  if (!lootedStack || lootedStack.quantity !== 2) throw new Error("Loot item missing from the sheet");
  if (lootedSheet.payload.character.data.currency.gp !== 5) throw new Error("Loot coins missing from the sheet");
  const playerLoot = await fetch(`${base}/api/campaigns/${campaign.id}/loot`, {
    headers: { cookie: playerCookie },
  });
  if (playerLoot.status !== 403) throw new Error("Player should not be able to read GM loot prep");
  log("loot parcel distributed to the player's sheet");

  const quartermaster = (
    await api("/api/characters", {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Smoke Quartermaster", campaignId: campaign.id },
    })
  ).payload.character;
  const transferResult = await api(`/api/characters/${character.id}/transfer`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      toCharacterId: quartermaster.id,
      itemId: sword.id,
      quantity: 1,
      currency: { gp: 2, sp: 0, cp: 0 },
    },
  });
  const transferredFrom = transferResult.payload.from;
  const transferredTo = transferResult.payload.to;
  if (transferredFrom.data.equipment.find((entry) => entry.itemId === sword.id)?.quantity !== 1) {
    throw new Error("Source stack was not reduced by the transfer");
  }
  if (transferredFrom.data.currency.gp !== 3) {
    throw new Error("Source coins were not reduced by the transfer");
  }
  if (
    transferredTo.data.equipment.find((entry) => entry.itemId === sword.id)?.quantity !== 1 ||
    transferredTo.data.currency.gp !== 2
  ) {
    throw new Error("Target character did not receive the item and coins");
  }
  const playerTarget = await api(`/api/characters/${quartermaster.id}`, { cookie: playerCookie });
  if (playerTarget.payload.character.name !== "Smoke Quartermaster") {
    throw new Error("Player could not read the receiving character");
  }
  const stolenTransfer = await fetch(`${base}/api/characters/${quartermaster.id}/transfer`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ toCharacterId: character.id, currency: { gp: 1 } }),
  });
  if (stolenTransfer.status !== 403) {
    throw new Error("Player could give items from a character they do not control");
  }
  log("inventory stacks and coins transferred between campaign characters");

  await api(`/api/campaigns/${campaign.id}/journal`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke Handout",
      content: "A shared clue.",
      visible: true,
      kind: "handout",
      attachments: [{ name: "Map", url: "/uploads/smoke-map.png", mimeType: "image/png" }],
    },
  });
  await api(`/api/campaigns/${campaign.id}/journal`, {
    method: "POST",
    cookie: gmCookie,
    body: { title: "Smoke Secret Handout", content: "GM only.", visible: false, kind: "handout" },
  });
  const playerJournal = await api(`/api/campaigns/${campaign.id}/journal`, { cookie: playerCookie });
  const sharedHandout = playerJournal.payload.entries.find((entry) => entry.title === "Smoke Handout");
  if (!sharedHandout || sharedHandout.kind !== "handout" || sharedHandout.attachments.length !== 1) {
    throw new Error("Shared handout or attachment missing from the player journal");
  }
  if (playerJournal.payload.entries.some((entry) => entry.title === "Smoke Secret Handout")) {
    throw new Error("Player received a GM-only handout");
  }
  log("shared handout reached the player with its attachment");

  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlwAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploadImageFile = async (name) => {
    const form = new FormData();
    form.append("file", new Blob([pixel], { type: "image/png" }), name);
    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { cookie: gmCookie, "x-campaign-id": campaign.id },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Asset upload failed (${response.status}): ${JSON.stringify(payload)}`);
    return payload;
  };
  const firstAsset = await uploadImageFile("smoke-asset.png");
  const initialAssets = await api(`/api/campaigns/${campaign.id}/assets`, { cookie: gmCookie });
  const unusedAsset = initialAssets.payload.assets.find((asset) => asset.filename === firstAsset.filename);
  if (!unusedAsset || !unusedAsset.unused || !unusedAsset.deletable) {
    throw new Error("Uploaded asset did not appear as unused and deletable");
  }
  await api(`/api/campaigns/${campaign.id}/journal`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke Asset Handout",
      content: "Uses a library image.",
      visible: true,
      kind: "handout",
      attachments: [
        { name: "Library image", url: firstAsset.url, mimeType: firstAsset.mimeType },
      ],
    },
  });
  const usedAssets = await api(`/api/campaigns/${campaign.id}/assets`, { cookie: gmCookie });
  const usedAsset = usedAssets.payload.assets.find((asset) => asset.filename === firstAsset.filename);
  if (!usedAsset || usedAsset.unused || usedAsset.deletable || !usedAsset.usage.includes("Journal: Smoke Asset Handout")) {
    throw new Error("Asset usage was not reflected in the library");
  }
  const attachedDelete = await fetch(
    `${base}/api/campaigns/${campaign.id}/assets/${encodeURIComponent(firstAsset.filename)}`,
    { method: "DELETE", headers: { cookie: gmCookie } },
  );
  if (attachedDelete.status !== 409) throw new Error("Referenced asset could be deleted");
  const secondAsset = await uploadImageFile("smoke-unused-asset.png");
  const removedAsset = await api(
    `/api/campaigns/${campaign.id}/assets/${encodeURIComponent(secondAsset.filename)}`,
    { method: "DELETE", cookie: gmCookie },
  );
  if (!removedAsset.payload.ok) throw new Error("Unused asset was not deleted");
  const remainingAssets = await api(`/api/campaigns/${campaign.id}/assets`, { cookie: gmCookie });
  if (remainingAssets.payload.assets.some((asset) => asset.filename === secondAsset.filename)) {
    throw new Error("Deleted asset remained in the library");
  }
  const playerAssets = await fetch(`${base}/api/campaigns/${campaign.id}/assets`, {
    headers: { cookie: playerCookie },
  });
  if (playerAssets.status !== 403) throw new Error("Player could read the GM asset library");
  log("campaign assets track usage and delete unused files");

  const dashboardResult = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    method: "PATCH",
    cookie: gmCookie,
    body: {
      lastSessionSummary: "The smoke test party survived the vault.",
      nextSessionAt: Date.now() + 86_400_000,
      nextSessionTeaser: "The next door is already open.",
      nextSessionNotes: "Only the GM should see this note.",
      threads: [
        { id: "t1", text: "Find the next clue", done: false, visible: true },
        { id: "t2", text: "Secret GM thread", done: false, visible: false },
      ],
    },
  });
  if (dashboardResult.payload.dashboard?.threads.length !== 2) {
    throw new Error("Dashboard threads were not saved");
  }
  const playerDashboard = await api(`/api/campaigns/${campaign.id}/dashboard`, { cookie: playerCookie });
  const playerThreads = playerDashboard.payload.dashboard?.threads ?? [];
  if (!playerThreads.some((thread) => thread.text === "Find the next clue")) {
    throw new Error("Shared dashboard thread missing for the player");
  }
  if (playerThreads.some((thread) => thread.text === "Secret GM thread")) {
    throw new Error("Player received a GM-only dashboard thread");
  }
  if (playerDashboard.payload.dashboard?.nextSessionNotes) {
    throw new Error("Player received GM-only session notes");
  }
  const deniedDashboard = await fetch(`${base}/api/campaigns/${campaign.id}/dashboard`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ lastSessionSummary: "Hacked" }),
  });
  if (deniedDashboard.status !== 403) throw new Error("Player could edit the campaign dashboard");
  log("campaign dashboard shared the safe view with the player");

  const scheduledAt = Date.now() + 3 * 86_400_000;
  const sessionResult = await api(`/api/campaigns/${campaign.id}/sessions`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke Session",
      scheduledAt,
      durationMinutes: 180,
      status: "scheduled",
      notes: "GM-only smoke notes.",
    },
  });
  const smokeSession = sessionResult.payload.session;
  if (!smokeSession || smokeSession.notes !== "GM-only smoke notes.") {
    throw new Error("Session was not scheduled correctly");
  }
  await api(
    `/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/attendance/${player.id}`,
    { method: "PUT", cookie: gmCookie, body: { status: "attended" } },
  );
  const agendaResult = await api(
    `/api/campaigns/${campaign.id}/sessions/${smokeSession.id}`,
    {
      method: "PATCH",
      cookie: gmCookie,
      body: {
        agenda: [
          { id: "a1", text: "Open on the ferryman's bargain", done: false },
          { id: "a2", text: "Have the vault map ready", done: true },
        ],
      },
    },
  );
  if (agendaResult.payload.session.agenda.length !== 2) {
    throw new Error("Session agenda was not saved");
  }
  const checkin = await api(
    `/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/checkin`,
    { method: "PUT", cookie: playerCookie, body: { status: "yes" } },
  );
  if (checkin.payload.session.checkins.find((entry) => entry.userId === player.id)?.status !== "yes") {
    throw new Error("Player check-in was not saved");
  }
  const playerSessions = await api(`/api/campaigns/${campaign.id}/sessions`, { cookie: playerCookie });
  const playerSession = playerSessions.payload.sessions.find((session) => session.id === smokeSession.id);
  if (!playerSession || playerSession.attendance[0]?.status !== "attended") {
    throw new Error("Player attendance was not reflected in their session view");
  }
  if (playerSession.agenda.length) throw new Error("Player received the GM-only agenda");
  if (
    playerSession.checkins.length < 2 ||
    playerSession.checkins.find((entry) => entry.userId === player.id)?.status !== "yes"
  ) {
    throw new Error("Player check-in summary was not shared");
  }
  const gmSessions = await api(`/api/campaigns/${campaign.id}/sessions`, { cookie: gmCookie });
  const gmSession = gmSessions.payload.sessions.find((session) => session.id === smokeSession.id);
  if (!gmSession || gmSession.agenda.length !== 2) {
    throw new Error("GM session view did not include the agenda");
  }
  if (gmSession.checkins.find((entry) => entry.userId === player.id)?.status !== "yes") {
    throw new Error("GM session view did not include the player check-in");
  }
  await api(
    `/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/checkin`,
    { method: "PUT", cookie: playerCookie, body: { status: "unanswered" } },
  );
  const clearedCheckin = await api(`/api/campaigns/${campaign.id}/sessions`, { cookie: gmCookie });
  const clearedSession = clearedCheckin.payload.sessions.find((session) => session.id === smokeSession.id);
  if (clearedSession.checkins.find((entry) => entry.userId === player.id)?.status !== "unanswered") {
    throw new Error("Player check-in could not be cleared");
  }
  if (playerSession.notes) throw new Error("Player received GM-only session notes");
  const playerSessionCreate = await fetch(`${base}/api/campaigns/${campaign.id}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ title: "Hacked", scheduledAt }),
  });
  if (playerSessionCreate.status !== 403) throw new Error("Player could schedule a session");
  log("session agenda and check-ins are shared safely");
  const dashboardAfterSession = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    cookie: playerCookie,
  });
  if (dashboardAfterSession.payload.dashboard?.nextSessionAt !== scheduledAt) {
    throw new Error("Scheduled session did not sync to the dashboard");
  }
  log("session schedule and attendance stayed GM-managed");

  const npcResult = await api(`/api/campaigns/${campaign.id}/npcs`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Smoke Ferryman",
      level: 6,
      hp: 95,
      ac: 23,
      perception: 14,
      size: 2,
      color: "#7f9fbf",
      description: "Melee +15, 2d10+7.",
    },
  });
  const npc = npcResult.payload.npc;
  if (!npc || npc.hp !== 95 || npc.size !== 2) throw new Error("NPC statblock was not saved");
  const npcToken = await api(`/api/campaigns/${campaign.id}/npcs/${npc.id}/token`, {
    method: "POST",
    cookie: gmCookie,
    body: { sceneId: scene.id },
  });
  if (
    !npcToken.payload.token ||
    npcToken.payload.token.name !== "Smoke Ferryman" ||
    npcToken.payload.token.hpMax !== 95 ||
    npcToken.payload.token.size !== 2
  ) {
    throw new Error("NPC token was not created correctly");
  }
  const playerNpcs = await fetch(`${base}/api/campaigns/${campaign.id}/npcs`, {
    headers: { cookie: playerCookie },
  });
  if (playerNpcs.status !== 403) throw new Error("Player should not be able to read the NPC library");
  log("NPC statblock placed a token and stayed GM-only");

  const gmSocket = await connectSocket(gmCookie);
  const playerSocket = await connectSocket(playerCookie);
  await emitAck(gmSocket, "campaign:join", { campaignId: campaign.id });
  await emitAck(playerSocket, "campaign:join", { campaignId: campaign.id });
  log("both realtime sockets joined the campaign");

  const movedPromise = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId && event.x === 200 && event.y === 180,
  );
  const token = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: {
      name: "Smoke Hero",
      characterId: character.id,
      x: 100,
      y: 100,
      size: 1,
      color: "#c8a96b",
    },
  });
  if (!token) throw new Error("GM could not create a character token");
  const revisionPromise = waitForEvent(
    gmSocket,
    "campaign:revision",
    (payload) => typeof payload.revision === "number",
  );
  playerSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 200,
    y: 180,
  });
  await movedPromise;
  const revisionEvent = await revisionPromise;
  if (revisionEvent.revision <= revisedTable.payload.revision) {
    throw new Error("Campaign revision did not advance for a token move");
  }
  log("player moved their own token and GM received the update");

  const chatPromise = waitForEvent(
    gmSocket,
    "chat:message",
    (message) => message.type === "chat" && message.content === "Smoke test message",
  );
  const chatAck = await emitAck(playerSocket, "chat:send", {
    campaignId: campaign.id,
    content: "Smoke test message",
  });
  if (!chatAck) throw new Error("Chat message was not acknowledged");
  await chatPromise;
  log("chat message reached the GM");

  const requestPromise = waitForEvent(
    playerSocket,
    "chat:message",
    (message) => message.type === "request" && message.data?.label === "Smoke Perception",
  );
  const requestAck = await emitAck(gmSocket, "dice:request", {
    campaignId: campaign.id,
    formula: "1d20+7",
    label: "Smoke Perception",
    dc: 18,
  });
  if (!requestAck || requestAck.data?.formula !== "1d20+7") {
    throw new Error("GM roll request was not acknowledged");
  }
  await requestPromise;
  log("GM roll request reached the player");

  const groupRequest = await emitAck(gmSocket, "dice:request", {
    campaignId: campaign.id,
    formula: "1d20+3",
    label: "Group Stealth",
    dc: 15,
    group: true,
  });
  if (!groupRequest?.data?.group || !groupRequest.data.requestId) {
    throw new Error("Group roll request did not include a response id");
  }
  const groupResponse = await emitAck(playerSocket, "dice:roll", {
    campaignId: campaign.id,
    formula: "1d20+3",
    label: "Group Stealth",
    dc: 15,
    requestId: groupRequest.data.requestId,
  });
  if (groupResponse?.data?.requestId !== groupRequest.data.requestId) {
    throw new Error("Group check response was not linked to the request");
  }
  log("group check responses are linked to the request");

  let playerSawSecret = false;
  const secretLeakHandler = (message) => {
    if (message.type === "roll" && message.content === "Smoke Secret") playerSawSecret = true;
  };
  playerSocket.on("chat:message", secretLeakHandler);
  const secretPromise = waitForEvent(
    gmSocket,
    "chat:message",
    (message) => message.type === "roll" && message.content === "Smoke Secret",
  );
  gmSocket.emit("dice:roll", {
    campaignId: campaign.id,
    formula: "1d20+7",
    label: "Smoke Secret",
    dc: 20,
    visibility: "gm",
  });
  await secretPromise;
  await delay(250);
  playerSocket.off("chat:message", secretLeakHandler);
  if (playerSawSecret) throw new Error("Player received a GM-only secret roll");
  log("GM secret roll stayed out of the player chat");

  await api(`/api/campaigns/${campaign.id}/sessions`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke Recap Session",
      scheduledAt: Date.now() - 2 * 60 * 60 * 1000,
      durationMinutes: 180,
      status: "played",
      notes: "Recap fixture.",
    },
  });
  const recapWindow = {
    from: Date.now() - 24 * 60 * 60 * 1000,
    to: Date.now() + 60_000,
  };
  const recapResult = await api(
    `/api/campaigns/${campaign.id}/recap?from=${recapWindow.from}&to=${recapWindow.to}`,
    { cookie: gmCookie },
  );
  const recap = recapResult.payload.recap;
  if (!recap?.draft?.includes("Smoke Recap Session")) {
    throw new Error("Recap did not include the played session");
  }
  if (!recap.draft.includes("Group Stealth") || recap.stats.rolls < 1) {
    throw new Error("Recap did not include shared rolls");
  }
  if (!recap.draft.includes("Smoke Handout") || !recap.draft.includes("Smoke Loot")) {
    throw new Error("Recap did not include shared handouts or loot");
  }
  if (recap.draft.includes("Smoke Secret") || recap.draft.includes("Smoke Secret Handout")) {
    throw new Error("Recap leaked GM-only records");
  }
  if (recap.draft.includes("Secret GM thread")) {
    throw new Error("Recap leaked a GM-only dashboard thread");
  }
  const playerRecap = await fetch(
    `${base}/api/campaigns/${campaign.id}/recap?from=${recapWindow.from}&to=${recapWindow.to}`,
    { headers: { cookie: playerCookie } },
  );
  if (playerRecap.status !== 403) throw new Error("Player could generate a GM recap");
  log("session recap assembled player-safe records for the GM");

  const duplicateResult = await api(
    `/api/campaigns/${campaign.id}/journal/${sharedHandout.id}/duplicate`,
    { method: "POST", cookie: gmCookie },
  );
  if (duplicateResult.payload.entry?.title !== "Smoke Handout (copy)") {
    throw new Error("Journal entry was not duplicated");
  }
  if (duplicateResult.payload.entry.attachments.length !== 1) {
    throw new Error("Duplicated handout lost its attachments");
  }
  const playerDuplicate = await fetch(
    `${base}/api/campaigns/${campaign.id}/journal/${sharedHandout.id}/duplicate`,
    { method: "POST", headers: { cookie: playerCookie } },
  );
  if (playerDuplicate.status !== 403) throw new Error("Player could duplicate a journal entry");
  log("journal handouts can be duplicated by the GM only");

  const initiativePromise = waitForEvent(
    playerSocket,
    "initiative:updated",
    (payload) => payload.entries.some((entry) => entry.tokenId === token.id),
  );
  gmSocket.emit("initiative:roll", { campaignId: campaign.id, sceneId: scene.id, tokenIds: [token.id] });
  const initiative = await initiativePromise;
  const entry = initiative.entries.find((item) => item.tokenId === token.id);
  if (!entry) throw new Error("Token missing from initiative order");
  const rerollPromise = waitForEvent(
    playerSocket,
    "initiative:updated",
    (payload) => payload.entries.some((item) => item.id === entry.id),
  );
  gmSocket.emit("initiative:reroll", { campaignId: campaign.id, entryId: entry.id });
  await rerollPromise;
  log("initiative roll and individual reroll reached the player");

  const smokeGroup = "grp_smoke";
  const goblinOne = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: {
      name: "Smoke Goblin 1",
      x: 300,
      y: 300,
      size: 1,
      color: "#a34a4a",
      hpCurrent: 6,
      hpMax: 6,
      ac: 16,
      initiativeBonus: 2,
      groupId: smokeGroup,
      groupName: "Smoke Goblins",
    },
  });
  const goblinTwo = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: {
      name: "Smoke Goblin 2",
      x: 370,
      y: 300,
      size: 1,
      color: "#a34a4a",
      hpCurrent: 6,
      hpMax: 6,
      ac: 16,
      initiativeBonus: 2,
      groupId: smokeGroup,
      groupName: "Smoke Goblins",
    },
  });
  if (goblinOne?.groupName !== "Smoke Goblins" || goblinTwo?.groupId !== smokeGroup) {
    throw new Error("Group metadata missing from smoke tokens");
  }
  const groupInitiativePromise = waitForEvent(
    playerSocket,
    "initiative:updated",
    (payload) => payload.entries.some((entry) => entry.groupId === smokeGroup),
  );
  gmSocket.emit("initiative:roll", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenIds: [goblinOne.id, goblinTwo.id],
  });
  const groupInitiative = await groupInitiativePromise;
  const groupEntries = groupInitiative.entries.filter((entry) => entry.groupId === smokeGroup);
  if (groupEntries.length !== 1 || !groupEntries[0].name.includes("×2")) {
    throw new Error("Grouped monsters did not share one initiative entry");
  }
  log("monster groups shared one initiative roll");

  const beforeReconnect = await api(`/api/campaigns/${campaign.id}/table`, { cookie: playerCookie });
  playerSocket.disconnect();
  await delay(150);
  const offlineMove = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId === token.id && event.x === 420 && event.y === 360,
  );
  gmSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 420,
    y: 360,
  });
  await offlineMove;
  const reconnectedPlayer = await connectSocket(playerCookie);
  await emitAck(reconnectedPlayer, "campaign:join", { campaignId: campaign.id });
  const reconnectedTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: playerCookie });
  const reconnectedToken = reconnectedTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!reconnectedToken || reconnectedToken.x !== 420 || reconnectedToken.y !== 360) {
    throw new Error("Reconnected client did not receive the authoritative token position");
  }
  if (reconnectedTable.payload.revision <= beforeReconnect.payload.revision) {
    throw new Error("Reconnect snapshot did not advance the campaign revision");
  }
  reconnectedPlayer.close();
  log("disconnected client caught up from the authoritative snapshot");

  const smokeEncounter = (
    await api(`/api/campaigns/${campaign.id}/encounters`, {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Smoke Waves", description: "Wave fixture.", sceneId: scene.id },
    })
  ).payload.encounter;
  const waveOne = (
    await api(`/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/combatants`, {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Wave One Guard", level: 2, count: 2, hp: 20, ac: 16, perception: 8, wave: 1 },
    })
  ).payload.combatant;
  const waveTwo = (
    await api(`/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/combatants`, {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Wave Two Guard", level: 2, count: 1, hp: 20, ac: 16, perception: 8, wave: 2 },
    })
  ).payload.combatant;
  if (waveOne.wave !== 1 || waveTwo.wave !== 2) throw new Error("Encounter waves were not saved");
  const movedWave = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/combatants/${waveTwo.id}`,
    { method: "PATCH", cookie: gmCookie, body: { wave: 3, count: 2 } },
  );
  if (movedWave.payload.combatant.wave !== 3) throw new Error("Encounter wave was not updated");
  const duplicateEncounter = (
    await api(`/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/duplicate`, {
      method: "POST",
      cookie: gmCookie,
    })
  ).payload.encounter;
  if (
    duplicateEncounter.name !== "Smoke Waves (copy)" ||
    duplicateEncounter.combatants.length !== 2 ||
    duplicateEncounter.combatants.find((entry) => entry.name === "Wave Two Guard")?.wave !== 3
  ) {
    throw new Error("Encounter duplication did not preserve waves");
  }
  const firstLaunch = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`,
    { method: "POST", cookie: gmCookie, body: { sceneId: scene.id, wave: 1, mode: "fresh" } },
  );
  if (firstLaunch.payload.mode !== "fresh" || firstLaunch.payload.combatants !== 2) {
    throw new Error("Wave one did not launch as a fresh encounter");
  }
  const waveOneEntries = firstLaunch.payload.initiative.filter((entry) =>
    String(entry.name).startsWith("Wave One Guard"),
  );
  if (
    waveOneEntries.length !== 1 ||
    !waveOneEntries[0].groupId ||
    !String(waveOneEntries[0].name).includes("×2")
  ) {
    throw new Error("Encounter launch did not group a multi-creature wave into one initiative entry");
  }
  const beforeReinforcement = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  const activeBefore = beforeReinforcement.payload.initiative[beforeReinforcement.payload.turnIndex];
  const reinforcement = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`,
    { method: "POST", cookie: gmCookie, body: { sceneId: scene.id, wave: 3, mode: "reinforce" } },
  );
  const activeAfter = reinforcement.payload.initiative[reinforcement.payload.turnIndex];
  if (
    reinforcement.payload.mode !== "reinforce" ||
    reinforcement.payload.wave !== 3 ||
    reinforcement.payload.combatants !== 2 ||
    reinforcement.payload.round !== beforeReinforcement.payload.round ||
    activeAfter?.id !== activeBefore?.id
  ) {
    throw new Error("Reinforcement wave did not preserve the active initiative turn");
  }
  const reinforcedEntries = reinforcement.payload.initiative.filter((entry) =>
    String(entry.name).startsWith("Wave Two Guard"),
  );
  if (
    reinforcedEntries.length !== 1 ||
    !reinforcedEntries[0].groupId ||
    !String(reinforcedEntries[0].name).includes("×2")
  ) {
    throw new Error("Reinforcement wave did not create one grouped initiative entry");
  }
  const playerEncounter = await fetch(`${base}/api/campaigns/${campaign.id}/encounters`, {
    headers: { cookie: playerCookie },
  });
  if (playerEncounter.status !== 403) throw new Error("Player could read GM encounter prep");
  log("encounter waves, reinforcement launches, and duplication are supported");

  gmSocket.close();
  playerSocket.close();

  await api(`/api/campaigns/${importedCampaign.id}`, { method: "DELETE", cookie: gmCookie });
  await api(`/api/campaigns/${campaign.id}`, { method: "DELETE", cookie: gmCookie });
  log("GM deleted the temporary campaigns");

  console.log(`\nSmoke test passed for users ${gm.username} and ${player.username}.`);
  exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error("\nSmoke test failed.");
  console.error(error);
  exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(1500),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  try {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(`Could not remove temporary smoke directory ${tempDir}:`, error instanceof Error ? error.message : error);
  }
  process.exit(exitCode);
}
