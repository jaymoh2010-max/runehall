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
    throw new Error(
      `${method} ${pathname} failed (${response.status}): ${JSON.stringify(payload)}`
    );
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
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} ack`)),
      timeout
    );
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
  for (const required of [
    "auth.register",
    "auth.login",
    "auth.password_change",
    "admin.invite_create",
  ]) {
    if (!actions.has(required)) throw new Error(`Audit log is missing ${required}`);
  }

  const playerExport = await fetch(`${base}/api/admin/audit/export`, {
    headers: { cookie: playerCookie },
  });
  if (playerExport.status !== 403) {
    throw new Error(`A player could export the audit log (${playerExport.status})`);
  }
  const exportResponse = await fetch(`${base}/api/admin/audit/export`, {
    headers: { cookie: gmCookie },
  });
  if (exportResponse.status !== 200) {
    throw new Error(`Admin audit export failed (${exportResponse.status})`);
  }
  if (!exportResponse.headers.get("content-type")?.includes("text/csv")) {
    throw new Error("Audit export did not return CSV");
  }
  if (!exportResponse.headers.get("content-disposition")?.includes("attachment")) {
    throw new Error("Audit export is missing a download disposition");
  }
  const exportedCsv = await exportResponse.text();
  const csvHeader = "id,created_at,actor_id,actor_name,action,target_type,target_id,detail,ip";
  if (!exportedCsv.startsWith(`${csvHeader}\r\n`)) {
    throw new Error("Audit CSV header is missing or unstable");
  }
  if (!exportedCsv.includes(",auth.login,")) {
    throw new Error("Audit CSV did not include the sign-in entry");
  }
  const filteredExport = await fetch(`${base}/api/admin/audit/export?action=auth.login`, {
    headers: { cookie: gmCookie },
  });
  const filteredCsv = await filteredExport.text();
  if (!filteredCsv.includes(",auth.login,") || filteredCsv.includes(",auth.register,")) {
    throw new Error("Audit CSV action filter did not isolate sign-in entries");
  }

  const invalidRetention = await fetch(`${base}/api/admin/audit/retention`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: gmCookie },
    body: JSON.stringify({ days: "not-a-number" }),
  });
  if (invalidRetention.status !== 400) {
    throw new Error(`Invalid audit retention was accepted (${invalidRetention.status})`);
  }
  const retentionResult = await api("/api/admin/audit/retention", {
    method: "PUT",
    cookie: gmCookie,
    body: { days: 30 },
  });
  if (retentionResult.payload.audit.retentionDays !== 30) {
    throw new Error("Audit retention did not persist");
  }
  if (typeof retentionResult.payload.pruned?.deleted !== "number") {
    throw new Error("Audit retention response did not report a prune count");
  }
  const auditOverview = await api("/api/admin/overview", { cookie: gmCookie });
  if (auditOverview.payload.audit.retentionDays !== 30) {
    throw new Error("Admin overview did not expose audit retention");
  }
  if (auditOverview.payload.audit.total < 1) {
    throw new Error("Admin overview did not expose audit totals");
  }
  const exportAudit = await api("/api/admin/audit?limit=200", { cookie: gmCookie });
  const exportAuditActions = new Set(exportAudit.payload.entries.map((entry) => entry.action));
  for (const required of ["admin.audit_export", "admin.audit_retention"]) {
    if (!exportAuditActions.has(required)) throw new Error(`Audit log is missing ${required}`);
  }
  log("audit CSV export, access control, and retention settings verified");

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
  if (character.data?.wealthBudgetCp !== 1500) {
    throw new Error("New character did not start with the level-1 wealth budget");
  }
  const joinResult = await api("/api/campaigns/join", {
    method: "POST",
    cookie: playerCookie,
    body: { code: campaign.inviteCode, characterId: character.id },
  });
  if (joinResult.payload.campaign.role !== "player")
    throw new Error("Player role missing after join");
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
  if (!(savedSheet.payload.character.summary?.validationErrors > 0)) {
    throw new Error("Saved character summary did not report its required choices");
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

  const restDraft = JSON.parse(JSON.stringify(forcedSave.payload.character.data));
  restDraft.play.hp = 0;
  restDraft.play.tempHp = 4;
  restDraft.play.heroPoints = 2;
  restDraft.play.focusPoints = 0;
  restDraft.spells.slotsUsed = { 1: 2 };
  restDraft.spells.divineFontUsed = 2;
  restDraft.play.conditions = [
    { name: "Fatigued", value: null, duration: null },
    { name: "Drained", value: 2, duration: null },
  ];
  await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: restDraft, force: true },
  });
  const partyRest = await api(`/api/campaigns/${campaign.id}/long-rest`, {
    method: "POST",
    cookie: gmCookie,
  });
  const restedCharacter = partyRest.payload.characters.find((entry) => entry.id === character.id);
  if (!restedCharacter) throw new Error("Party long rest did not return the character");
  if (restedCharacter.data.play.tempHp !== 0) {
    throw new Error("Party long rest did not clear temporary HP");
  }
  if (restedCharacter.data.play.heroPoints !== 2) {
    throw new Error("Party long rest changed hero points");
  }
  if (restedCharacter.data.play.conditions.some((entry) => entry.name === "Fatigued")) {
    throw new Error("Party long rest did not remove fatigued");
  }
  const drained = restedCharacter.data.play.conditions.find((entry) => entry.name === "Drained");
  if (!drained || drained.value !== 1) {
    throw new Error("Party long rest did not reduce drained by 1");
  }
  if (restedCharacter.summary.currentHp !== restedCharacter.summary.hp) {
    throw new Error("Party long rest did not heal the character to maximum HP");
  }
  if (Object.keys(restedCharacter.data.spells.slotsUsed ?? {}).length !== 0) {
    throw new Error("Party long rest did not clear spent spell slots");
  }
  if ((restedCharacter.data.spells.divineFontUsed ?? 0) !== 0) {
    throw new Error("Party long rest did not restore divine font slots");
  }
  if (restedCharacter.data.play.focusPoints !== restedCharacter.summary.focusPoints) {
    throw new Error("Party long rest did not restore focus points");
  }
  if (partyRest.payload.rested < 1)
    throw new Error("Party long rest reported no characters rested");
  log("party long rest heals, clears temporary HP, and reduces rest conditions");

  const effectsDraft = JSON.parse(JSON.stringify(restedCharacter.data));
  effectsDraft.play.fastHealing = 4;
  effectsDraft.play.fastHealingActive = true;
  effectsDraft.play.fastHealingNote = "  while below half HP  ";
  effectsDraft.play.regeneration = 6;
  effectsDraft.play.regenerationActive = true;
  effectsDraft.play.regenerationDeactivatedBy = ["Fire Damage", "acid"];
  const effectsSave = await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: effectsDraft, force: true },
  });
  const savedPlay = effectsSave.payload.character.data.play;
  if (
    savedPlay.fastHealing !== 4 ||
    savedPlay.fastHealingActive !== true ||
    savedPlay.fastHealingNote !== "while below half HP" ||
    savedPlay.regeneration !== 6 ||
    savedPlay.regenerationActive !== true ||
    savedPlay.regenerationDeactivatedBy.length !== 2 ||
    savedPlay.regenerationDeactivatedBy[0] !== "fire" ||
    savedPlay.regenerationDeactivatedBy[1] !== "acid"
  ) {
    throw new Error("Character fast healing/regeneration effects did not round-trip");
  }
  log("character saves preserve fast healing, regeneration, and suppression types");

  const milestoneAward = await fetch(`${base}/api/campaigns/${campaign.id}/award-xp`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: gmCookie },
    body: JSON.stringify({ amount: 100, characterIds: [character.id] }),
  });
  if (milestoneAward.status !== 400) {
    throw new Error("Milestone campaigns could award XP");
  }
  await api(`/api/campaigns/${campaign.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { xpMode: "xp", advancementSpeed: "fast" },
  });
  const awardedXp = await api(`/api/campaigns/${campaign.id}/award-xp`, {
    method: "POST",
    cookie: gmCookie,
    body: { amount: 850, characterIds: [character.id], reason: "Smoke XP" },
  });
  const xpCharacter = awardedXp.payload.characters.find((entry) => entry.id === character.id);
  if (!xpCharacter || xpCharacter.summary?.xp !== 850) {
    throw new Error("GM XP award did not reach the character summary");
  }
  const playerAward = await fetch(`${base}/api/campaigns/${campaign.id}/award-xp`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ amount: 100, characterIds: [character.id] }),
  });
  if (playerAward.status !== 403) throw new Error("Player was able to award XP");
  const leveledCharacter = await api(`/api/campaigns/${campaign.id}/level-up`, {
    method: "POST",
    cookie: gmCookie,
    body: { characterId: character.id },
  });
  const advanced = leveledCharacter.payload.characters.find((entry) => entry.id === character.id);
  if (
    leveledCharacter.payload.leveled !== 1 ||
    !advanced ||
    advanced.summary?.level !== 2 ||
    advanced.summary?.xp !== 50
  ) {
    throw new Error("Individual level-up did not spend 800 XP at fast advancement");
  }
  log("XP awards are GM-only and fast individual level-ups spend 800 XP");

  const playerCatchUp = await fetch(`${base}/api/campaigns/${campaign.id}/catch-up`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ characterId: character.id }),
  });
  if (playerCatchUp.status !== 403) {
    throw new Error("Player was able to run party catch-up");
  }
  const evenCatchUp = await api(`/api/campaigns/${campaign.id}/catch-up`, {
    method: "POST",
    cookie: gmCookie,
    body: {},
  });
  if (
    evenCatchUp.payload.caughtUp !== 0 ||
    evenCatchUp.payload.alreadyCurrent < 1 ||
    evenCatchUp.payload.targetLevel !== 2
  ) {
    throw new Error("Catch-up changed an already even party");
  }
  log("party catch-up stayed GM-only and left an even party unchanged");
  await api(`/api/campaigns/${campaign.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { xpMode: "milestone", advancementSpeed: "medium" },
  });

  const heroAward = await api(`/api/campaigns/${campaign.id}/award-hero-points`, {
    method: "POST",
    cookie: gmCookie,
    body: { amount: 1, characterIds: [character.id] },
  });
  let heroAwardCharacter = heroAward.payload.characters.find((entry) => entry.id === character.id);
  if (heroAwardCharacter?.data?.play?.heroPoints !== 3) {
    throw new Error("Hero Point award did not reach the character");
  }
  const heroCapped = await api(`/api/campaigns/${campaign.id}/award-hero-points`, {
    method: "POST",
    cookie: gmCookie,
    body: { amount: 3, characterIds: [character.id] },
  });
  heroAwardCharacter = heroCapped.payload.characters.find((entry) => entry.id === character.id);
  if (heroAwardCharacter?.data?.play?.heroPoints !== 3 || heroCapped.payload.capped !== 1) {
    throw new Error("Hero Point award did not respect the maximum");
  }
  const heroReset = await api(`/api/campaigns/${campaign.id}/reset-hero-points`, {
    method: "POST",
    cookie: gmCookie,
    body: { value: 1 },
  });
  heroAwardCharacter = heroReset.payload.characters.find((entry) => entry.id === character.id);
  if (heroAwardCharacter?.data?.play?.heroPoints !== 1) {
    throw new Error("Session reset did not set Hero Points to 1");
  }
  const playerHeroAward = await fetch(`${base}/api/campaigns/${campaign.id}/award-hero-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ amount: 1, characterIds: [character.id] }),
  });
  if (playerHeroAward.status !== 403) throw new Error("Player was able to award Hero Points");
  log("Hero Points are GM-awarded, capped at 3, and reset to 1 for a new session");

  const playerLevelChange = await fetch(`${base}/api/characters/${character.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ data: { ...advanced.data, level: 3 }, force: true }),
  });
  if (playerLevelChange.status !== 403) {
    throw new Error("Player was able to change a campaign character's level");
  }
  log("players cannot change campaign character levels");

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

  const pathbuilderBuild = {
    name: "Smoke Pathbuilder Hero",
    class: "Fighter",
    level: 1,
    ancestry: "Human",
    heritage: "Versatile Human",
    background: "Warrior",
    keyability: "str",
    abilities: {
      str: 18,
      dex: 14,
      con: 14,
      int: 10,
      wis: 12,
      cha: 8,
      breakdown: {
        ancestryFree: ["Str", "Dex"],
        ancestryBoosts: [],
        ancestryFlaws: [],
        backgroundBoosts: ["Str", "Con"],
        classBoosts: ["Str"],
        mapLevelledBoosts: { 1: ["Str", "Dex", "Con", "Wis"] },
      },
    },
    proficiencies: { athletics: 2, acrobatics: 2 },
    feats: [["Toughness", null, "General Feat", 1]],
    equipment: [["Backpack", 1, "Invested"]],
    weapons: [],
    armor: [],
    money: { gp: 5, sp: 0, cp: 0 },
    spellCasters: [],
    focus: {},
  };
  const pathbuilderImport = await api("/api/characters/import/pathbuilder", {
    method: "POST",
    cookie: playerCookie,
    body: { json: JSON.stringify({ success: true, build: pathbuilderBuild }) },
  });
  const importedHero = pathbuilderImport.payload.character;
  if (
    !importedHero?.id ||
    importedHero.name !== "Smoke Pathbuilder Hero" ||
    importedHero.data?.level !== 1 ||
    !importedHero.data?.ancestryId ||
    !Object.values(importedHero.data?.featChoices ?? {}).flat().length ||
    importedHero.data?.feats?.general?.["1"] ||
    !importedHero.data?.equipment?.length ||
    !importedHero.summary ||
    importedHero.summary.level !== 1 ||
    importedHero.summary.hp <= 0 ||
    importedHero.data?.wealthBudgetCp !== null
  ) {
    throw new Error("Pathbuilder import did not create the expected draft or summary");
  }
  if (pathbuilderImport.payload.report?.unmatched?.length) {
    throw new Error(
      `Pathbuilder import left names unmatched: ${pathbuilderImport.payload.report.unmatched.join(", ")}`
    );
  }
  const badPathbuilder = await fetch(`${base}/api/characters/import/pathbuilder`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ json: "{not json" }),
  });
  if (badPathbuilder.status !== 400) {
    throw new Error(`Invalid Pathbuilder JSON was accepted (${badPathbuilder.status})`);
  }
  const wrongShape = await fetch(`${base}/api/characters/import/pathbuilder`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ json: JSON.stringify({ hello: "world" }) }),
  });
  if (wrongShape.status !== 400) {
    throw new Error(`Non-Pathbuilder JSON was accepted (${wrongShape.status})`);
  }
  await api(`/api/characters/${importedHero.id}`, { method: "DELETE", cookie: playerCookie });
  log("Pathbuilder JSON import creates a mapped character and rejects invalid JSON");

  const swordSearch = await api("/api/compendium/equipment?q=longsword&limit=1", {
    cookie: gmCookie,
  });
  const sword = swordSearch.payload.items[0];
  if (!sword) throw new Error("Smoke equipment search returned no longsword");
  const lootParcel = (
    await api(`/api/campaigns/${campaign.id}/loot`, {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Smoke Loot", description: "Temporary parcel.", level: 5 },
    })
  ).payload.parcel;
  if (lootParcel.level !== 5) throw new Error("Loot parcel level was not saved");
  const parcelWithItem = (
    await api(`/api/campaigns/${campaign.id}/loot/${lootParcel.id}/items`, {
      method: "POST",
      cookie: gmCookie,
      body: { itemId: sword.id, quantity: 2 },
    })
  ).payload.parcel;
  if (parcelWithItem.items[0]?.quantity !== 2) throw new Error("Loot item was not added");
  const patchedLoot = await api(`/api/campaigns/${campaign.id}/loot/${lootParcel.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { gp: 5, sp: 3, cp: 2, level: 6 },
  });
  if (patchedLoot.payload.parcel.level !== 6) {
    throw new Error("Loot parcel level was not updated");
  }
  const distributedLoot = await api(
    `/api/campaigns/${campaign.id}/loot/${lootParcel.id}/distribute`,
    {
      method: "POST",
      cookie: gmCookie,
      body: { characterId: character.id },
    }
  );
  if (distributedLoot.payload.parcel.status !== "distributed") {
    throw new Error("Loot parcel did not close after distribution");
  }
  const lootedSheet = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  const lootedStack = lootedSheet.payload.character.data.equipment.find(
    (entry) => entry.itemId === sword.id
  );
  if (!lootedStack || lootedStack.quantity !== 2)
    throw new Error("Loot item missing from the sheet");
  if (lootedSheet.payload.character.data.currency.gp !== 5)
    throw new Error("Loot coins missing from the sheet");
  if (lootedSheet.payload.character.data.wealthBudgetCp !== null) {
    throw new Error("Loot did not end the character's creation wealth budget");
  }
  const playerLoot = await fetch(`${base}/api/campaigns/${campaign.id}/loot`, {
    headers: { cookie: playerCookie },
  });
  if (playerLoot.status !== 403) throw new Error("Player should not be able to read GM loot prep");
  const lootAudit = await api(`/api/campaigns/${campaign.id}/loot/audit`, { cookie: gmCookie });
  const levelSix = lootAudit.payload.audit.byLevel.find((row) => row.level === 6);
  if (!levelSix || levelSix.parcelCount < 1 || levelSix.distributedCp < 1) {
    throw new Error("Loot audit did not group the parcel by level");
  }
  log("loot parcel distributed to the player's sheet with level coverage");

  const quartermaster = (
    await api("/api/characters", {
      method: "POST",
      cookie: gmCookie,
      body: { name: "Smoke Quartermaster", campaignId: campaign.id },
    })
  ).payload.character;
  const forgedTransfer = await fetch(`${base}/api/characters/${character.id}/transfer`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({
      toCharacterId: quartermaster.id,
      itemId: sword.id,
      quantity: 1,
      currency: { gp: 999, sp: 0, cp: 0 },
      data: {
        ...lootedSheet.payload.character.data,
        equipment: [{ itemId: sword.id, quantity: 99, equipped: false }],
        currency: { gp: 999, sp: 0, cp: 0 },
      },
    }),
  });
  if (forgedTransfer.status !== 400) {
    throw new Error("A fabricated source draft was accepted by the transfer route");
  }
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
  if (transferredFrom.data.wealthBudgetCp !== null || transferredTo.data.wealthBudgetCp !== null) {
    throw new Error("A transfer did not end the creation wealth budget");
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

  const daggerId = "item:rQWaJhI5Bko5x14Z";
  const currencyCp = (currency) =>
    (currency.gp ?? 0) * 100 + (currency.sp ?? 0) * 10 + (currency.cp ?? 0);
  const beforeShopCp = currencyCp(transferredFrom.data.currency);
  const bought = await api(`/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      characterId: character.id,
      itemId: daggerId,
      quantity: 1,
      expectedRevision: transferredFrom.revision,
    },
  });
  const boughtCharacter = bought.payload.character;
  if (
    !boughtCharacter.data.equipment.some((entry) => entry.itemId === daggerId) ||
    currencyCp(boughtCharacter.data.currency) !== beforeShopCp - 20
  ) {
    throw new Error("Shop purchase did not add the item or spend the correct coins");
  }
  const sold = await api(`/api/campaigns/${campaign.id}/shop/sell`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      characterId: character.id,
      itemId: daggerId,
      quantity: 1,
      expectedRevision: boughtCharacter.revision,
    },
  });
  const soldCharacter = sold.payload.character;
  if (
    soldCharacter.data.equipment.some((entry) => entry.itemId === daggerId) ||
    currencyCp(soldCharacter.data.currency) !== beforeShopCp - 10
  ) {
    throw new Error("Shop sale did not remove the item or pay half price");
  }
  const aboveLevel = await fetch(`${base}/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({
      characterId: character.id,
      itemId: "item:66yY2SClvqj0lMFX",
      quantity: 1,
    }),
  });
  if (aboveLevel.status !== 400) {
    throw new Error("Shop sold an item above the settlement level");
  }
  const uncommon = await fetch(`${base}/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({
      characterId: character.id,
      itemId: "item:NELpewmAIxQXaMtv",
      quantity: 1,
    }),
  });
  if (uncommon.status !== 400) {
    throw new Error("Shop sold an uncommon item without GM access");
  }
  const foreignShop = await fetch(`${base}/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({
      characterId: quartermaster.id,
      itemId: daggerId,
      quantity: 1,
    }),
  });
  if (foreignShop.status !== 403) {
    throw new Error("Player could shop for a character they do not control");
  }

  const initialShop = await api(`/api/campaigns/${campaign.id}/shop`, { cookie: playerCookie });
  if (initialShop.payload.shop.mode !== "open") {
    throw new Error("The campaign did not start with an open shop");
  }
  const playerStockEdit = await fetch(`${base}/api/campaigns/${campaign.id}/shop/stock`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ mode: "stocked", items: [] }),
  });
  if (playerStockEdit.status !== 403) {
    throw new Error("Player changed the merchant stock");
  }
  const stocked = await api(`/api/campaigns/${campaign.id}/shop/stock`, {
    method: "PUT",
    cookie: gmCookie,
    body: { mode: "stocked", items: [{ itemId: daggerId, quantity: 2 }] },
  });
  if (
    stocked.payload.shop.mode !== "stocked" ||
    stocked.payload.shop.stock.find((entry) => entry.itemId === daggerId)?.quantity !== 2
  ) {
    throw new Error("GM could not set tracked merchant stock");
  }
  const stockBuy = await api(`/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      characterId: character.id,
      itemId: daggerId,
      quantity: 1,
      expectedRevision: soldCharacter.revision,
    },
  });
  if (stockBuy.payload.stockQuantity !== 1) {
    throw new Error("Buying from tracked stock did not decrement the quantity");
  }
  const overStock = await fetch(`${base}/api/campaigns/${campaign.id}/shop/buy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({
      characterId: character.id,
      itemId: daggerId,
      quantity: 3,
      expectedRevision: stockBuy.payload.character.revision,
    }),
  });
  if (overStock.status !== 400) {
    throw new Error("Shop sold more items than the merchant stocked");
  }
  const stockSell = await api(`/api/campaigns/${campaign.id}/shop/sell`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      characterId: character.id,
      itemId: daggerId,
      quantity: 1,
      expectedRevision: stockBuy.payload.character.revision,
    },
  });
  if (stockSell.payload.stockQuantity !== 2) {
    throw new Error("Selling to tracked stock did not add the item back");
  }
  const originalMerchantId = stocked.payload.shop.merchantId;
  const secondMerchant = await api(`/api/campaigns/${campaign.id}/shop/merchants`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Smoke Traveling Trader",
      description: "A wagon full of oddments.",
      mode: "stocked",
      copyFromMerchantId: originalMerchantId,
    },
  });
  if (secondMerchant.payload.shop.merchants.length !== 2) {
    throw new Error("Second merchant was not created");
  }
  const playerMerchantEdit = await fetch(`${base}/api/campaigns/${campaign.id}/shop/merchants`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ name: "Player merchant" }),
  });
  if (playerMerchantEdit.status !== 403) {
    throw new Error("Player could add a merchant");
  }
  const travelingMerchant = secondMerchant.payload.shop.merchants.find(
    (merchant) => merchant.name === "Smoke Traveling Trader"
  );
  const activated = await api(
    `/api/campaigns/${campaign.id}/shop/merchants/${travelingMerchant.id}/activate`,
    { method: "POST", cookie: gmCookie }
  );
  if (
    activated.payload.shop.merchantName !== "Smoke Traveling Trader" ||
    activated.payload.shop.stock.find((entry) => entry.itemId === daggerId)?.quantity !== 2
  ) {
    throw new Error("Merchant activation did not switch stock");
  }
  const restocked = await api(
    `/api/campaigns/${campaign.id}/shop/merchants/${travelingMerchant.id}/restock`,
    { method: "POST", cookie: gmCookie, body: { quantity: 6 } }
  );
  if (restocked.payload.shop.stock.find((entry) => entry.itemId === daggerId)?.quantity !== 6) {
    throw new Error("Merchant restock did not raise the quantity");
  }
  await api(`/api/campaigns/${campaign.id}/shop/merchants/${originalMerchantId}/activate`, {
    method: "POST",
    cookie: gmCookie,
  });
  await api(`/api/campaigns/${campaign.id}/shop/stock`, {
    method: "PUT",
    cookie: gmCookie,
    body: { mode: "open", items: [] },
  });
  log("settlement shop buys and sells at the correct prices and supports multiple merchants");

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
  const playerJournal = await api(`/api/campaigns/${campaign.id}/journal`, {
    cookie: playerCookie,
  });
  const sharedHandout = playerJournal.payload.entries.find(
    (entry) => entry.title === "Smoke Handout"
  );
  if (
    !sharedHandout ||
    sharedHandout.kind !== "handout" ||
    sharedHandout.attachments.length !== 1
  ) {
    throw new Error("Shared handout or attachment missing from the player journal");
  }
  if (playerJournal.payload.entries.some((entry) => entry.title === "Smoke Secret Handout")) {
    throw new Error("Player received a GM-only handout");
  }
  log("shared handout reached the player with its attachment");

  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlwAAAABJRU5ErkJggg==",
    "base64"
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
    if (!response.ok)
      throw new Error(`Asset upload failed (${response.status}): ${JSON.stringify(payload)}`);
    return payload;
  };
  const firstAsset = await uploadImageFile("smoke-asset.png");
  const initialAssets = await api(`/api/campaigns/${campaign.id}/assets`, { cookie: gmCookie });
  const unusedAsset = initialAssets.payload.assets.find(
    (asset) => asset.filename === firstAsset.filename
  );
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
      attachments: [{ name: "Library image", url: firstAsset.url, mimeType: firstAsset.mimeType }],
    },
  });
  const usedAssets = await api(`/api/campaigns/${campaign.id}/assets`, { cookie: gmCookie });
  const usedAsset = usedAssets.payload.assets.find(
    (asset) => asset.filename === firstAsset.filename
  );
  if (
    !usedAsset ||
    usedAsset.unused ||
    usedAsset.deletable ||
    !usedAsset.usage.includes("Journal: Smoke Asset Handout")
  ) {
    throw new Error("Asset usage was not reflected in the library");
  }
  const attachedDelete = await fetch(
    `${base}/api/campaigns/${campaign.id}/assets/${encodeURIComponent(firstAsset.filename)}`,
    { method: "DELETE", headers: { cookie: gmCookie } }
  );
  if (attachedDelete.status !== 409) throw new Error("Referenced asset could be deleted");
  const secondAsset = await uploadImageFile("smoke-unused-asset.png");
  const removedAsset = await api(
    `/api/campaigns/${campaign.id}/assets/${encodeURIComponent(secondAsset.filename)}`,
    { method: "DELETE", cookie: gmCookie }
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

  const selfContainedExport = await api(`/api/campaigns/${campaign.id}/export?selfContained=1`, {
    cookie: gmCookie,
  });
  const embedded = selfContainedExport.payload.embeddedAssets?.[firstAsset.url];
  if (embedded !== pixel.toString("base64")) {
    throw new Error("Self-contained export did not embed the referenced asset");
  }
  const importedArchive = await api("/api/campaigns/import", {
    method: "POST",
    cookie: gmCookie,
    body: selfContainedExport.payload,
  });
  if (importedArchive.payload.stats.embeddedAssets < 1) {
    throw new Error("Import did not restore embedded assets");
  }
  const importedAssets = await api(`/api/campaigns/${importedArchive.payload.campaign.id}/assets`, {
    cookie: gmCookie,
  });
  if (!importedAssets.payload.assets.length) {
    throw new Error("Imported campaign did not register the embedded asset");
  }
  await api(`/api/campaigns/${importedArchive.payload.campaign.id}`, {
    method: "DELETE",
    cookie: gmCookie,
    body: { confirmName: importedArchive.payload.campaign.name },
  });
  log("self-contained archive embeds and restores uploaded files");

  const uploadsPath = path.join(tempDir, "uploads");
  const filesBeforeRejects = new Set(fs.existsSync(uploadsPath) ? fs.readdirSync(uploadsPath) : []);
  const rawUpload = async ({
    body,
    mimeType = "image/png",
    filename = "edge.png",
    cookie = gmCookie,
    campaignId = campaign.id,
  }) => {
    const form = new FormData();
    form.append("file", new Blob([body], { type: mimeType }), filename);
    const response = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(campaignId ? { "x-campaign-id": campaignId } : {}),
      },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  };

  const notAnImage = await rawUpload({ body: Buffer.from("<script>alert(1)</script>") });
  if (notAnImage.status !== 415) {
    throw new Error(`Non-image upload was accepted (${notAnImage.status})`);
  }
  const mismatchedType = await rawUpload({
    body: pixel,
    mimeType: "image/jpeg",
    filename: "mismatch.jpg",
  });
  if (mismatchedType.status !== 415) {
    throw new Error(`Mismatched image type was accepted (${mismatchedType.status})`);
  }
  const unsupportedType = await rawUpload({
    body: pixel,
    mimeType: "text/plain",
    filename: "note.txt",
  });
  if (unsupportedType.status !== 415) {
    throw new Error(`Unsupported upload type was accepted (${unsupportedType.status})`);
  }
  const emptyUpload = await rawUpload({ body: Buffer.alloc(0) });
  if (emptyUpload.status !== 400) {
    throw new Error(`Empty upload was accepted (${emptyUpload.status})`);
  }
  const hugeDimensions = Buffer.from(pixel);
  hugeDimensions.writeUInt32BE(12_001, 16);
  hugeDimensions.writeUInt32BE(1, 20);
  const oversizedDimensions = await rawUpload({ body: hugeDimensions });
  if (oversizedDimensions.status !== 413) {
    throw new Error(`Oversized dimensions were accepted (${oversizedDimensions.status})`);
  }
  const oversizedFile = Buffer.concat([pixel, Buffer.alloc(15 * 1024 * 1024)]);
  const oversized = await rawUpload({ body: oversizedFile, filename: "huge.png" });
  if (oversized.status !== 400 && oversized.status !== 413) {
    throw new Error(`Oversized file was accepted (${oversized.status})`);
  }
  const unauthenticated = await rawUpload({ body: pixel, cookie: null });
  if (unauthenticated.status !== 401) {
    throw new Error(`Unauthenticated upload was accepted (${unauthenticated.status})`);
  }
  const foreignCampaign = await rawUpload({
    body: pixel,
    cookie: playerCookie,
    campaignId: "campaign_missing",
  });
  if (foreignCampaign.status !== 403) {
    throw new Error(`Upload to a foreign campaign was accepted (${foreignCampaign.status})`);
  }
  const filesAfterRejects = new Set(fs.existsSync(uploadsPath) ? fs.readdirSync(uploadsPath) : []);
  const leaked = [...filesAfterRejects].filter((file) => !filesBeforeRejects.has(file));
  if (leaked.length) {
    throw new Error(`Rejected uploads left files behind: ${leaked.join(", ")}`);
  }
  log("upload validation rejects bad types, sizes, and foreign campaigns without leaking files");

  const dashboardResult = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    method: "PATCH",
    cookie: gmCookie,
    body: {
      lastSessionSummary: "The smoke test party survived the vault.",
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
  const playerDashboard = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    cookie: playerCookie,
  });
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
  await api(`/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/attendance/${player.id}`, {
    method: "PUT",
    cookie: gmCookie,
    body: { status: "attended" },
  });
  const agendaResult = await api(`/api/campaigns/${campaign.id}/sessions/${smokeSession.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: {
      agenda: [
        { id: "a1", text: "Open on the ferryman's bargain", done: false },
        { id: "a2", text: "Have the vault map ready", done: true },
      ],
    },
  });
  if (agendaResult.payload.session.agenda.length !== 2) {
    throw new Error("Session agenda was not saved");
  }
  const checkin = await api(`/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/checkin`, {
    method: "PUT",
    cookie: playerCookie,
    body: { status: "yes" },
  });
  if (
    checkin.payload.session.checkins.find((entry) => entry.userId === player.id)?.status !== "yes"
  ) {
    throw new Error("Player check-in was not saved");
  }
  const playerSessions = await api(`/api/campaigns/${campaign.id}/sessions`, {
    cookie: playerCookie,
  });
  const playerSession = playerSessions.payload.sessions.find(
    (session) => session.id === smokeSession.id
  );
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
  await api(`/api/campaigns/${campaign.id}/sessions/${smokeSession.id}/checkin`, {
    method: "PUT",
    cookie: playerCookie,
    body: { status: "unanswered" },
  });
  const clearedCheckin = await api(`/api/campaigns/${campaign.id}/sessions`, { cookie: gmCookie });
  const clearedSession = clearedCheckin.payload.sessions.find(
    (session) => session.id === smokeSession.id
  );
  if (
    clearedSession.checkins.find((entry) => entry.userId === player.id)?.status !== "unanswered"
  ) {
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
  const spoofedDashboard = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { nextSessionAt: scheduledAt + 86_400_000 },
  });
  if (spoofedDashboard.payload.dashboard?.nextSessionAt !== scheduledAt) {
    throw new Error("Dashboard next-session date drifted from the session calendar");
  }
  const pastSessionAt = Date.now() - 2 * 86_400_000;
  const pastSession = (
    await api(`/api/campaigns/${campaign.id}/sessions`, {
      method: "POST",
      cookie: gmCookie,
      body: { title: "Past Smoke Session", scheduledAt: pastSessionAt, durationMinutes: 120 },
    })
  ).payload.session;
  const dashboardAfterPast = await api(`/api/campaigns/${campaign.id}/dashboard`, {
    cookie: gmCookie,
  });
  if (dashboardAfterPast.payload.dashboard?.nextSessionAt !== pastSessionAt) {
    throw new Error("An overdue scheduled session stopped being the next session");
  }
  const sessionsWithPast = await api(`/api/campaigns/${campaign.id}/sessions`, {
    cookie: gmCookie,
  });
  const overdueSession = sessionsWithPast.payload.sessions.find(
    (session) => session.id === pastSession.id
  );
  if (!overdueSession || overdueSession.status !== "scheduled") {
    throw new Error("An overdue scheduled session disappeared from the session list");
  }
  await api(`/api/campaigns/${campaign.id}/sessions/${pastSession.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  log("sessions remain current until played and own the dashboard date");

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
  if (playerNpcs.status !== 403)
    throw new Error("Player should not be able to read the NPC library");
  log("NPC statblock placed a token and stayed GM-only");

  const factionResult = await api(`/api/campaigns/${campaign.id}/factions`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Smoke Harbor Guild",
      description: "The guild that controls the docks.",
      goals: "Keep the harbor open.",
      assets: "Two cranes and a lot of favors.",
      attitude: "friendly",
      reputation: 35,
      visible: true,
      gmNotes: "The guildmaster is secretly a doppelganger.",
    },
  });
  const faction = factionResult.payload.faction;
  if (!faction || faction.reputation !== 35 || !faction.visible) {
    throw new Error("Faction was not saved");
  }
  const linkedNpcResult = await api(`/api/campaigns/${campaign.id}/npcs/${npc.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: {
      factionId: faction.id,
      role: "Harbor master",
      location: "The Salt Dock",
      attitude: "helpful",
      publicDescription: "A weathered ferryman who knows every tide.",
      secrets: "He is the guildmaster's brother.",
      visible: true,
    },
  });
  const linkedNpc = linkedNpcResult.payload.npc;
  if (
    !linkedNpc ||
    linkedNpc.factionId !== faction.id ||
    linkedNpc.role !== "Harbor master" ||
    linkedNpc.secrets !== "He is the guildmaster's brother."
  ) {
    throw new Error("NPC social fields were not saved");
  }
  const hiddenNpcResult = await api(`/api/campaigns/${campaign.id}/npcs`, {
    method: "POST",
    cookie: gmCookie,
    body: { name: "Smoke Hidden Villain", level: 9, visible: false },
  });
  const hiddenNpc = hiddenNpcResult.payload.npc;
  const peopleResult = await api(`/api/campaigns/${campaign.id}/people`, {
    cookie: playerCookie,
  });
  const publicFactions = peopleResult.payload.factions;
  const publicNpcs = peopleResult.payload.npcs;
  if (publicFactions.length !== 1 || publicFactions[0].id !== faction.id) {
    throw new Error("Player People view did not include the visible faction");
  }
  if (publicFactions[0].gmNotes !== undefined) {
    throw new Error("Player People view leaked faction GM notes");
  }
  if (publicNpcs.length !== 1 || publicNpcs[0].id !== npc.id) {
    throw new Error("Player People view did not filter hidden NPCs");
  }
  if (publicNpcs[0].secrets !== undefined || publicNpcs[0].description !== "") {
    throw new Error("Player People view leaked NPC secrets or GM description");
  }
  if (publicNpcs[0].publicDescription !== "A weathered ferryman who knows every tide.") {
    throw new Error("Player People view did not include the public NPC description");
  }
  const playerFactions = await fetch(`${base}/api/campaigns/${campaign.id}/factions`, {
    headers: { cookie: playerCookie },
  });
  if (playerFactions.status !== 403) {
    throw new Error("Player should not be able to read the faction ledger");
  }
  const campaignExport = await api(`/api/campaigns/${campaign.id}/export`, { cookie: gmCookie });
  if (!campaignExport.payload.factions?.some((entry) => entry.id === faction.id)) {
    throw new Error("Campaign export did not include the faction ledger");
  }
  await api(`/api/campaigns/${campaign.id}/factions/${faction.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  const unlinkedNpc = await api(`/api/campaigns/${campaign.id}/npcs`, { cookie: gmCookie });
  if (unlinkedNpc.payload.npcs.find((entry) => entry.id === npc.id)?.factionId !== null) {
    throw new Error("Deleting a faction did not unlink its NPCs");
  }
  await api(`/api/campaigns/${campaign.id}/npcs/${hiddenNpc.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  log("faction ledger stayed GM-only while public people stayed player-safe");

  const visibleKnowledge = await api(`/api/campaigns/${campaign.id}/knowledge`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke: The Sunken Gate",
      content: "The gate opens at low tide.",
      visible: true,
    },
  });
  const hiddenKnowledge = await api(`/api/campaigns/${campaign.id}/knowledge`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke: The Traitor",
      content: "The harbor master works for the cult.",
      visible: false,
    },
  });
  const privateNote = await api(`/api/campaigns/${campaign.id}/notes`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      title: "Smoke: My suspicions",
      content: "The ferryman knows more than he says.",
    },
  });
  if (!privateNote.payload.note?.id) throw new Error("Private player note was not saved");
  const gmNotesView = await api(`/api/campaigns/${campaign.id}/notes`, { cookie: gmCookie });
  if (gmNotesView.payload.notes.length !== 0) {
    throw new Error("GM could read a player's private notes");
  }
  if (gmNotesView.payload.knowledge.length !== 2) {
    throw new Error("GM notes view did not include hidden knowledge");
  }
  const playerNotesView = await api(`/api/campaigns/${campaign.id}/notes`, {
    cookie: playerCookie,
  });
  if (playerNotesView.payload.notes.length !== 1) {
    throw new Error("Player could not read their own private note");
  }
  if (playerNotesView.payload.notes[0].content !== "The ferryman knows more than he says.") {
    throw new Error("Private note content did not round-trip");
  }
  if (
    playerNotesView.payload.knowledge.length !== 1 ||
    playerNotesView.payload.knowledge[0].id !== visibleKnowledge.payload.entry.id
  ) {
    throw new Error("Player saw hidden knowledge or missed shared knowledge");
  }
  const playerKnowledgeWrite = await fetch(`${base}/api/campaigns/${campaign.id}/knowledge`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Player lore", visible: true }),
  });
  if (playerKnowledgeWrite.status !== 403) {
    throw new Error("Player should not be able to edit campaign knowledge");
  }
  const otherNoteWrite = await fetch(
    `${base}/api/campaigns/${campaign.id}/notes/${privateNote.payload.note.id}`,
    {
      method: "PATCH",
      headers: { cookie: gmCookie, "content-type": "application/json" },
      body: JSON.stringify({ content: "GM overwrite" }),
    }
  );
  if (otherNoteWrite.status !== 404) {
    throw new Error("Another member could overwrite a private note");
  }
  const notesExport = await api(`/api/campaigns/${campaign.id}/export`, { cookie: gmCookie });
  if (notesExport.payload.knowledge.length !== 2) {
    throw new Error("Campaign export did not include knowledge entries");
  }
  if (JSON.stringify(notesExport.payload).includes("The ferryman knows more than he says.")) {
    throw new Error("Campaign export leaked a private player note");
  }
  await api(`/api/campaigns/${campaign.id}/knowledge/${hiddenKnowledge.payload.entry.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  await api(`/api/campaigns/${campaign.id}/notes/${privateNote.payload.note.id}`, {
    method: "DELETE",
    cookie: playerCookie,
  });
  log("private player notes stayed private and shared knowledge respected visibility");

  const firstChapter = await api(`/api/campaigns/${campaign.id}/chapters`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke: The Ashen Crown",
      summary: "The party learns the crown is waking.",
      levelStart: 1,
      levelEnd: 4,
      status: "active",
      gmNotes: "Smoke GM secret: the crown is a phylactery.",
    },
  });
  const secondChapter = await api(`/api/campaigns/${campaign.id}/chapters`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Smoke: Beneath the City",
      summary: "The road into the vault.",
      levelStart: 5,
      levelEnd: 8,
      visible: false,
      gmNotes: "Do not reveal the vault until the party finds the map.",
    },
  });
  if (firstChapter.payload.chapters.length !== 1 || secondChapter.payload.chapters.length !== 2) {
    throw new Error("Adventure chapters were not saved");
  }
  const playerChapters = await api(`/api/campaigns/${campaign.id}/chapters`, {
    cookie: playerCookie,
  });
  if (playerChapters.payload.chapters.length !== 1) {
    throw new Error("Player could see a GM-only chapter");
  }
  if ("gmNotes" in playerChapters.payload.chapters[0]) {
    throw new Error("Player chapter payload leaked GM prep notes");
  }
  const playerChapterWrite = await fetch(`${base}/api/campaigns/${campaign.id}/chapters`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Player chapter", levelStart: 1, levelEnd: 1 }),
  });
  if (playerChapterWrite.status !== 403) {
    throw new Error("Player edited the adventure arc");
  }
  const switched = await api(
    `/api/campaigns/${campaign.id}/chapters/${secondChapter.payload.chapter.id}`,
    {
      method: "PATCH",
      cookie: gmCookie,
      body: { status: "active" },
    }
  );
  const statusFor = (id) => switched.payload.chapters.find((chapter) => chapter.id === id)?.status;
  if (
    statusFor(firstChapter.payload.chapter.id) !== "planned" ||
    statusFor(secondChapter.payload.chapter.id) !== "active"
  ) {
    throw new Error("Only one adventure chapter should be active");
  }
  const hiddenActiveForPlayer = await api(`/api/campaigns/${campaign.id}/chapters`, {
    cookie: playerCookie,
  });
  if (hiddenActiveForPlayer.payload.chapters.length !== 1) {
    throw new Error("Hidden chapter became visible when it became active");
  }
  await api(`/api/campaigns/${campaign.id}/chapters/${secondChapter.payload.chapter.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { visible: true },
  });
  const revealedChapters = await api(`/api/campaigns/${campaign.id}/chapters`, {
    cookie: playerCookie,
  });
  if (revealedChapters.payload.chapters.length !== 2) {
    throw new Error("Revealed chapter did not reach the player");
  }
  const deletedChapter = await api(
    `/api/campaigns/${campaign.id}/chapters/${firstChapter.payload.chapter.id}`,
    { method: "DELETE", cookie: gmCookie }
  );
  if (deletedChapter.payload.chapters.length !== 1) {
    throw new Error("Adventure chapter was not deleted");
  }
  log("adventure chapters stay GM-managed and keep one active arc");

  const gmSocket = await connectSocket(gmCookie);
  const playerSocket = await connectSocket(playerCookie);
  await emitAck(gmSocket, "campaign:join", { campaignId: campaign.id });
  await emitAck(playerSocket, "campaign:join", { campaignId: campaign.id });
  log("both realtime sockets joined the campaign");

  const liveHandout = waitForEvent(
    playerSocket,
    "journal:created",
    (entry) => entry.title === "Live Handout"
  );
  await api(`/api/campaigns/${campaign.id}/journal`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      title: "Live Handout",
      content: "A live clue.",
      visible: true,
      kind: "handout",
    },
  });
  await liveHandout;
  log("journal changes reached a connected player without a reload");

  // A malformed payload must be rejected without taking down the server for
  // everyone else at the table.
  playerSocket.emit("campaign:join", null);
  playerSocket.emit("scene:reorder", null);
  playerSocket.emit("scene:create", { campaignId: campaign.id, scene: null });
  playerSocket.emit("dice:roll", null);
  playerSocket.emit("dice:request", null);
  await delay(300);
  const healthAfterMalformed = await fetch(`${base}/api/health`);
  if (!healthAfterMalformed.ok) {
    throw new Error("A malformed socket payload crashed the server");
  }
  log("malformed socket payloads are rejected without dropping the table");

  const smokeWall = {
    id: "wall_smoke",
    x1: 0,
    y1: 0,
    x2: 200,
    y2: 0,
    kind: "wall",
    hidden: false,
  };
  const wallsPromise = waitForEvent(
    gmSocket,
    "scene:walls",
    (payload) =>
      payload.sceneId === scene.id && payload.walls?.some((wall) => wall.id === "wall_smoke")
  );
  gmSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [smokeWall],
  });
  await wallsPromise;
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: {
      losEnabled: true,
      wallCollision: true,
      ambientLight: "darkness",
      visionScope: "per-player",
      propCollision: true,
    },
  });
  playerSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [],
  });
  await delay(200);
  const wallsTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const wallsScene = wallsTable.payload.scenes.find((entry) => entry.id === scene.id);
  if (
    !wallsScene?.losEnabled ||
    !wallsScene.wallCollision ||
    wallsScene.walls?.length !== 1 ||
    wallsScene.ambientLight !== "darkness" ||
    wallsScene.visionScope !== "per-player" ||
    wallsScene.propCollision !== true
  ) {
    throw new Error("Wall persistence or lighting/vision/collision settings were not saved");
  }

  const hiddenWall = {
    ...smokeWall,
    id: "wall_smoke_hidden",
    y1: 40,
    y2: 40,
    hidden: true,
  };
  const playerVisibleWalls = waitForEvent(
    playerSocket,
    "scene:walls",
    (payload) => payload.sceneId === scene.id && payload.walls?.length === 1
  );
  const gmVisibleWalls = waitForEvent(
    gmSocket,
    "scene:walls",
    (payload) => payload.sceneId === scene.id && payload.walls?.length === 2
  );
  gmSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [smokeWall, hiddenWall],
  });
  const [playerVisibleWallsPayload, gmVisibleWallsPayload] = await Promise.all([
    playerVisibleWalls,
    gmVisibleWalls,
  ]);
  if (
    playerVisibleWallsPayload.walls[0]?.id !== "wall_smoke" ||
    gmVisibleWallsPayload.walls.length !== 2
  ) {
    throw new Error("Hidden wall visibility was not filtered for players");
  }
  const playerWallsTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  const playerWallsScene = playerWallsTable.payload.scenes.find((entry) => entry.id === scene.id);
  if (playerWallsScene?.walls?.length !== 1) {
    throw new Error("Hidden wall was included in the player table snapshot");
  }
  gmSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [smokeWall],
  });
  log("GM walls persist, hidden walls stay GM-only, and scene settings are saved");

  const smokeProp = {
    id: "prop_smoke",
    name: "Crate",
    imageUrl: "/props/crate.svg",
    x: 200,
    y: 180,
    width: 100,
    height: 100,
    rotation: 0,
    layer: "ground",
    visible: true,
    locked: false,
    z: 1,
  };
  const propsPromise = waitForEvent(
    gmSocket,
    "scene:props",
    (payload) =>
      payload.sceneId === scene.id && payload.props?.some((prop) => prop.id === "prop_smoke")
  );
  gmSocket.emit("scene:props", {
    campaignId: campaign.id,
    sceneId: scene.id,
    props: [smokeProp],
  });
  await propsPromise;
  playerSocket.emit("scene:props", {
    campaignId: campaign.id,
    sceneId: scene.id,
    props: [],
  });
  await delay(200);
  const propsTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const propsScene = propsTable.payload.scenes.find((entry) => entry.id === scene.id);
  if (propsScene?.props?.length !== 1 || propsScene.props[0]?.id !== "prop_smoke") {
    throw new Error("Scene prop persistence or player rejection failed");
  }
  log("GM props persist and players cannot replace scene props");

  let playerSawPrepScene = false;
  const onPrepScene = (created) => {
    if (created.name === "GM Prep Vault") playerSawPrepScene = true;
  };
  playerSocket.on("scene:created", onPrepScene);
  const prepScene = await api(`/api/campaigns/${campaign.id}/scenes`, {
    method: "POST",
    cookie: gmCookie,
    body: { name: "GM Prep Vault", visible: false, activate: false },
  });
  if (prepScene.payload.scene.visible !== false) {
    throw new Error("GM-only scene was not created hidden");
  }
  const prepToken = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: prepScene.payload.scene.id,
    token: { name: "Vault Guardian", x: 120, y: 120, size: 1, hidden: false },
  });
  await delay(250);
  playerSocket.off("scene:created", onPrepScene);
  if (playerSawPrepScene) throw new Error("GM-only scene creation leaked to the player");
  const prepPlayerTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  if (prepPlayerTable.payload.scenes.some((entry) => entry.id === prepScene.payload.scene.id)) {
    throw new Error("GM-only scene appeared in the player snapshot");
  }
  if (prepPlayerTable.payload.tokens.some((entry) => entry.id === prepToken.id)) {
    throw new Error("Token on a GM-only scene appeared in the player snapshot");
  }
  const prepGmTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (
    !prepGmTable.payload.scenes.some((entry) => entry.id === prepScene.payload.scene.id) ||
    !prepGmTable.payload.tokens.some((entry) => entry.id === prepToken.id)
  ) {
    throw new Error("GM-only scene or token was missing from the GM snapshot");
  }
  await api(`/api/scenes/${prepScene.payload.scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { visible: true },
  });
  const revealedPrepTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  if (!revealedPrepTable.payload.scenes.some((entry) => entry.id === prepScene.payload.scene.id)) {
    throw new Error("Revealed scene did not reach the player snapshot");
  }
  log("GM-only scenes and their tokens stay out of player snapshots until revealed");

  const duplicatedScene = await api(`/api/scenes/${scene.id}/duplicate`, {
    method: "POST",
    cookie: gmCookie,
  });
  if (
    duplicatedScene.payload.scene.props?.length !== 1 ||
    duplicatedScene.payload.scene.propCollision !== true
  ) {
    throw new Error("Scene duplication did not preserve props or prop collision");
  }

  const token = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: {
      name: "Smoke Hero",
      characterId: character.id,
      x: 100,
      y: 100,
      size: 1,
      visionRadius: 30,
      lightRadius: 20,
      lightColor: "#7fb8ff",
      visionMode: "darkvision",
      color: "#c8a96b",
    },
  });
  if (!token) throw new Error("GM could not create a character token");
  if (
    token.visionRadius !== 30 ||
    token.lightRadius !== 20 ||
    token.lightColor !== "#7fb8ff" ||
    token.visionMode !== "darkvision"
  ) {
    throw new Error("Token vision/light settings were not saved");
  }

  const hiddenToken = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: { name: "Smoke Lurker", x: 500, y: 500, size: 1, hidden: true },
  });
  if (!hiddenToken?.hidden) throw new Error("Hidden token was not created hidden");
  let playerSawHiddenCreate = false;
  let playerSawHiddenMove = false;
  const onHiddenCreated = (created) => {
    if (created.id === hiddenToken.id) playerSawHiddenCreate = true;
  };
  const onHiddenMoved = (moved) => {
    if (moved.tokenId === hiddenToken.id) playerSawHiddenMove = true;
  };
  playerSocket.on("token:created", onHiddenCreated);
  playerSocket.on("token:moved", onHiddenMoved);
  await delay(250);
  if (playerSawHiddenCreate) throw new Error("Hidden token creation leaked to the player");
  gmSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: hiddenToken.id,
    x: 570,
    y: 500,
  });
  await delay(250);
  if (playerSawHiddenMove) throw new Error("Hidden token movement leaked to the player");
  playerSocket.off("token:created", onHiddenCreated);
  playerSocket.off("token:moved", onHiddenMoved);
  const hiddenPlayerTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  if (hiddenPlayerTable.payload.tokens.some((entry) => entry.id === hiddenToken.id)) {
    throw new Error("Hidden token appeared in the player snapshot");
  }
  const hiddenGmTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (!hiddenGmTable.payload.tokens.some((entry) => entry.id === hiddenToken.id)) {
    throw new Error("Hidden token disappeared from the GM snapshot");
  }
  const revealPromise = waitForEvent(
    playerSocket,
    "token:created",
    (created) => created.id === hiddenToken.id
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: hiddenToken.id, hidden: false },
  });
  await revealPromise;
  const hidePromise = waitForEvent(
    playerSocket,
    "token:deleted",
    (payload) => payload.tokenId === hiddenToken.id
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: hiddenToken.id, hidden: true },
  });
  await hidePromise;
  gmSocket.emit("token:delete", { campaignId: campaign.id, tokenId: hiddenToken.id });
  await delay(150);
  log("hidden tokens and hidden moves stay GM-only");

  const apothecarySearch = await api("/api/compendium/monsters?q=Apothecary&limit=1", {
    cookie: gmCookie,
  });
  const apothecary = apothecarySearch.payload.items?.[0];
  if (!apothecary?.id) throw new Error("Could not find a monster with a known resistance");
  const resistantToken = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: {
      name: "Resistance Test",
      monsterId: apothecary.id,
      x: 320,
      y: 320,
      size: 1,
      hpCurrent: 20,
      hpMax: 20,
      ac: 15,
    },
  });
  const resisted = await emitAck(gmSocket, "token:damage", {
    campaignId: campaign.id,
    tokenId: resistantToken.id,
    amount: 10,
    damageType: "poison",
  });
  if (resisted?.applied !== 8 || !resisted.notes?.some((note) => /Resistance 2/.test(note))) {
    throw new Error("Monster resistance was not applied to typed damage");
  }
  const resistedTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const resistedRow = resistedTable.payload.tokens.find((entry) => entry.id === resistantToken.id);
  if (resistedRow?.hpCurrent !== 12) {
    throw new Error("Resistant monster token did not lose the reduced damage");
  }
  gmSocket.emit("token:delete", { campaignId: campaign.id, tokenId: resistantToken.id });
  log("typed damage applies monster resistances and weaknesses");

  const hpTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const linkedToken = hpTable.payload.tokens.find((entry) => entry.id === token.id);
  const linkedCharacter = hpTable.payload.characters.find((entry) => entry.id === character.id);
  if (!linkedToken || linkedToken.hpMax === null || !linkedCharacter?.summary) {
    throw new Error("Linked token or character summary missing for HP sync");
  }
  const targetHp = Math.max(0, linkedToken.hpMax - 1);
  const hpUpdate = waitForEvent(
    gmSocket,
    "character:updated",
    (payload) => payload.characterId === character.id && payload.summary.currentHp === targetHp
  );
  playerSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: token.id, hpCurrent: targetHp },
  });
  await hpUpdate;
  const hpCharacter = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  if (
    hpCharacter.payload.character.data.play.hp !== targetHp ||
    hpCharacter.payload.character.summary.currentHp !== targetHp
  ) {
    throw new Error("Token HP did not write back to the linked character sheet");
  }

  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: token.id, hpMax: linkedToken.hpMax + 97 },
  });
  await delay(200);
  const maxTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const maxToken = maxTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!maxToken || maxToken.hpMax !== linkedToken.hpMax) {
    throw new Error("Max HP on a linked token ignored the character sheet");
  }

  const healedDraft = JSON.parse(JSON.stringify(hpCharacter.payload.character.data));
  healedDraft.play.hp = linkedToken.hpMax;
  await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: healedDraft, force: true },
  });
  const healedTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const healedToken = healedTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!healedToken || healedToken.hpCurrent !== linkedToken.hpMax) {
    throw new Error("Sheet save did not update the linked token HP");
  }
  log("token HP writes back to the sheet, sheet saves update tokens, and max HP is sheet-owned");

  const conditionUpdate = waitForEvent(
    gmSocket,
    "character:updated",
    (payload) =>
      payload.characterId === character.id &&
      payload.summary.conditions.some((condition) => condition.startsWith("Frightened 2"))
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: token.id, conditions: [{ name: "Frightened", value: 2, duration: 3 }] },
  });
  await conditionUpdate;
  const conditionCharacter = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  if (
    conditionCharacter.payload.character.data.play.conditions[0]?.name !== "Frightened" ||
    conditionCharacter.payload.character.data.play.conditions[0]?.value !== 2
  ) {
    throw new Error("Token conditions did not write back to the linked character sheet");
  }
  const sheetConditionDraft = JSON.parse(JSON.stringify(conditionCharacter.payload.character.data));
  sheetConditionDraft.play.conditions = [{ name: "Prone", value: null, duration: null }];
  await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: sheetConditionDraft, force: true },
  });
  const conditionTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const conditionToken = conditionTable.payload.tokens.find((entry) => entry.id === token.id);
  if (
    !conditionToken ||
    conditionToken.conditions.length !== 1 ||
    conditionToken.conditions[0]?.name !== "Prone"
  ) {
    throw new Error("Sheet conditions did not update the linked token");
  }
  log("sheet and token conditions share one source of truth");

  const tempSheet = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  const tempDraft = JSON.parse(JSON.stringify(tempSheet.payload.character.data));
  tempDraft.play.hp = linkedToken.hpMax;
  tempDraft.play.tempHp = 5;
  tempDraft.play.conditions = [];
  await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: tempDraft, force: true },
  });
  const tempDamage = waitForEvent(
    gmSocket,
    "character:updated",
    (payload) => payload.characterId === character.id && payload.summary.tempHp === 2
  );
  gmSocket.emit("token:damage", { campaignId: campaign.id, tokenId: token.id, amount: 3 });
  await tempDamage;
  const afterTemp = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  if (afterTemp.payload.character.data.play.tempHp !== 2) {
    throw new Error("Token damage did not spend temporary HP before current HP");
  }

  const downUpdate = waitForEvent(
    gmSocket,
    "character:updated",
    (payload) =>
      payload.characterId === character.id &&
      payload.summary.conditions.some((condition) => condition.startsWith("Dying"))
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: token.id, hpCurrent: 0 },
  });
  await downUpdate;
  const downCharacter = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  if (
    !downCharacter.payload.character.data.play.conditions.some(
      (condition) => condition.name === "Dying"
    ) ||
    !downCharacter.payload.character.data.play.conditions.some(
      (condition) => condition.name === "Unconscious"
    )
  ) {
    throw new Error("Direct token HP 0 did not apply dying/unconscious to the sheet");
  }
  const downTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const downToken = downTable.payload.tokens.find((entry) => entry.id === token.id);
  if (
    !downToken ||
    !downToken.conditions.some((condition) => condition.name === "Dying") ||
    !downToken.conditions.some((condition) => condition.name === "Unconscious")
  ) {
    throw new Error("Direct token HP 0 did not apply dying/unconscious to the token");
  }

  const recoverUpdate = waitForEvent(
    gmSocket,
    "character:updated",
    (payload) =>
      payload.characterId === character.id &&
      payload.summary.conditions.some((condition) => condition.startsWith("Wounded"))
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: token.id, hpCurrent: 1 },
  });
  await recoverUpdate;
  const recoveredCharacter = await api(`/api/characters/${character.id}`, {
    cookie: playerCookie,
  });
  if (
    recoveredCharacter.payload.character.data.play.conditions.some(
      (condition) => condition.name === "Dying"
    ) ||
    !recoveredCharacter.payload.character.data.play.conditions.some(
      (condition) => condition.name === "Wounded" && condition.value === 1
    )
  ) {
    throw new Error("Healing a linked token from dying did not add wounded");
  }

  const unlinkedToken = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: { name: "Smoke Unlinked HP", x: 780, y: 620, size: 1, hpCurrent: 10, hpMax: 10 },
  });
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: unlinkedToken.id, hpCurrent: 0 },
  });
  await delay(200);
  const unlinkedDownTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  const unlinkedDown = unlinkedDownTable.payload.tokens.find(
    (entry) => entry.id === unlinkedToken.id
  );
  if (
    !unlinkedDown ||
    unlinkedDown.hpCurrent !== 0 ||
    !unlinkedDown.conditions.some((condition) => condition.name === "Dying")
  ) {
    throw new Error("Direct unlinked token HP 0 did not apply dying");
  }
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: unlinkedToken.id, hpCurrent: 3 },
  });
  await delay(200);
  const unlinkedRecoveredTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  const unlinkedRecovered = unlinkedRecoveredTable.payload.tokens.find(
    (entry) => entry.id === unlinkedToken.id
  );
  if (
    !unlinkedRecovered ||
    unlinkedRecovered.conditions.some((condition) => condition.name === "Dying") ||
    !unlinkedRecovered.conditions.some(
      (condition) => condition.name === "Wounded" && condition.value === 1
    )
  ) {
    throw new Error("Direct unlinked token healing did not add wounded");
  }
  gmSocket.emit("token:delete", { campaignId: campaign.id, tokenId: unlinkedToken.id });
  log("direct token HP edits share temp HP, dying, and wounded rules");

  const detourPromise = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId === token.id && (event.x !== 100 || event.y !== 100)
  );
  playerSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 200,
    y: 180,
  });
  const detourEvent = await detourPromise;
  const detourTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const detourToken = detourTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!detourToken) throw new Error("Token disappeared during a prop detour");
  if (detourToken.x === 200 && detourToken.y === 180) {
    throw new Error("Prop collision did not stop the token inside the crate");
  }
  if (detourToken.x > 150 && detourToken.x < 250 && detourToken.y > 130 && detourToken.y < 230) {
    throw new Error("Prop detour ended inside the crate");
  }
  if (detourEvent.x !== detourToken.x || detourEvent.y !== detourToken.y) {
    throw new Error("Detour position did not match the authoritative token state");
  }
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { propCollision: false },
  });
  log("prop collision routes a move around the crate and stops at the last reachable square");

  const movedPromise = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId && event.x === 200 && event.y === 180
  );
  const revisionPromise = waitForEvent(
    gmSocket,
    "campaign:revision",
    (payload) => typeof payload.revision === "number"
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
    (message) => message.type === "chat" && message.content === "Smoke test message"
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
    (message) => message.type === "request" && message.data?.label === "Smoke Perception"
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
    (message) => message.type === "roll" && message.content === "Smoke Secret"
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
    { cookie: gmCookie }
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
    { headers: { cookie: playerCookie } }
  );
  if (playerRecap.status !== 403) throw new Error("Player could generate a GM recap");
  log("session recap assembled player-safe records for the GM");

  const duplicateResult = await api(
    `/api/campaigns/${campaign.id}/journal/${sharedHandout.id}/duplicate`,
    { method: "POST", cookie: gmCookie }
  );
  if (duplicateResult.payload.entry?.title !== "Smoke Handout (copy)") {
    throw new Error("Journal entry was not duplicated");
  }
  if (duplicateResult.payload.entry.attachments.length !== 1) {
    throw new Error("Duplicated handout lost its attachments");
  }
  const playerDuplicate = await fetch(
    `${base}/api/campaigns/${campaign.id}/journal/${sharedHandout.id}/duplicate`,
    { method: "POST", headers: { cookie: playerCookie } }
  );
  if (playerDuplicate.status !== 403) throw new Error("Player could duplicate a journal entry");
  log("journal handouts can be duplicated by the GM only");

  const questEntry = (
    await api(`/api/campaigns/${campaign.id}/journal`, {
      method: "POST",
      cookie: gmCookie,
      body: {
        title: "Smoke Quest",
        content: "Recover the brass key.",
        visible: true,
        kind: "handout",
        questStatus: "completed",
        questXp: 40,
      },
    })
  ).payload.entry;
  if (questEntry.questStatus !== "completed" || questEntry.questXp !== 40) {
    throw new Error("Quest fields were not saved on the handout");
  }
  const beforeQuestXp = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  const startingXp = beforeQuestXp.payload.character.data.play.xp;
  const milestoneQuestAward = await fetch(
    `${base}/api/campaigns/${campaign.id}/journal/${questEntry.id}/award-quest-xp`,
    {
      method: "POST",
      headers: { cookie: gmCookie, "content-type": "application/json" },
      body: "{}",
    }
  );
  if (milestoneQuestAward.status !== 400) {
    throw new Error("Milestone campaigns could award quest XP");
  }
  await api(`/api/campaigns/${campaign.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { xpMode: "xp" },
  });
  const questAward = await api(
    `/api/campaigns/${campaign.id}/journal/${questEntry.id}/award-quest-xp`,
    { method: "POST", cookie: gmCookie, body: {} }
  );
  if (
    questAward.payload.amount !== 40 ||
    questAward.payload.recipients < 1 ||
    questAward.payload.entry.questRewardedAt === null
  ) {
    throw new Error("Quest XP was not awarded to the party");
  }
  const afterQuestXp = await api(`/api/characters/${character.id}`, { cookie: playerCookie });
  if (afterQuestXp.payload.character.data.play.xp !== startingXp + 40) {
    throw new Error("Quest XP did not reach the party character");
  }
  const repeatQuest = await fetch(
    `${base}/api/campaigns/${campaign.id}/journal/${questEntry.id}/award-quest-xp`,
    {
      method: "POST",
      headers: { cookie: gmCookie, "content-type": "application/json" },
      body: "{}",
    }
  );
  if (repeatQuest.status !== 409) {
    throw new Error("A quest reward could be awarded twice");
  }
  const editedQuest = await api(`/api/campaigns/${campaign.id}/journal/${questEntry.id}`, {
    method: "PUT",
    cookie: gmCookie,
    body: { questXp: 60 },
  });
  if (editedQuest.payload.entry.questRewardedAt === null) {
    throw new Error("Editing a paid quest cleared its reward marker");
  }
  const playerQuest = await fetch(
    `${base}/api/campaigns/${campaign.id}/journal/${questEntry.id}/award-quest-xp`,
    {
      method: "POST",
      headers: { cookie: playerCookie, "content-type": "application/json" },
      body: "{}",
    }
  );
  if (playerQuest.status !== 403) throw new Error("Player could award quest XP");
  log("quest handouts award XP once and record the reward");

  const calendarSet = await api(`/api/campaigns/${campaign.id}/calendar`, {
    method: "PUT",
    cookie: gmCookie,
    body: { year: 4726, month: 1, day: 30 },
  });
  if (calendarSet.payload.worldDate?.month !== 1 || calendarSet.payload.worldDate?.day !== 30) {
    throw new Error("The GM could not set the in-world date");
  }
  const calendarAdvance = await api(`/api/campaigns/${campaign.id}/calendar/advance`, {
    method: "POST",
    cookie: gmCookie,
    body: { days: 3 },
  });
  if (
    calendarAdvance.payload.worldDate?.month !== 2 ||
    calendarAdvance.payload.worldDate?.day !== 2
  ) {
    throw new Error("The in-world calendar did not advance across the month boundary");
  }
  const playerCampaignUpdate = waitForEvent(
    playerSocket,
    "campaign:updated",
    (summary) => summary.worldDate?.month === 2 && summary.worldDate?.day === 9
  );
  const calendarPartial = await api(`/api/campaigns/${campaign.id}/calendar`, {
    method: "PUT",
    cookie: gmCookie,
    body: { day: 9 },
  });
  await playerCampaignUpdate;
  if (
    calendarPartial.payload.worldDate?.year !== 4726 ||
    calendarPartial.payload.worldDate?.month !== 2 ||
    calendarPartial.payload.worldDate?.day !== 9
  ) {
    throw new Error("A partial calendar update reset the year or month");
  }
  if (playerCampaignUpdate.inviteCode) {
    throw new Error("Player campaign updates leaked the invite code");
  }
  const playerCalendar = await fetch(`${base}/api/campaigns/${campaign.id}/calendar/advance`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ days: 1 }),
  });
  if (playerCalendar.status !== 403) throw new Error("Player advanced the in-world calendar");
  log("the GM controls the in-world calendar");

  const initialTravel = await api(`/api/campaigns/${campaign.id}/travel`, {
    cookie: playerCookie,
  });
  if (initialTravel.payload.travel !== null || initialTravel.payload.suggestedSpeed < 5) {
    throw new Error("A new campaign did not start without a travel plan");
  }
  const playerTravelEdit = await fetch(`${base}/api/campaigns/${campaign.id}/travel`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ origin: "Nowhere", destination: "Elsewhere", distanceMiles: 1 }),
  });
  if (playerTravelEdit.status !== 403) throw new Error("Player edited the travel plan");
  const journey = await api(`/api/campaigns/${campaign.id}/travel`, {
    method: "PUT",
    cookie: gmCookie,
    body: {
      origin: "Smoke Start",
      destination: "Smoke End",
      terrain: "difficult",
      distanceMiles: 24,
      partySpeed: 30,
      weather: "rain",
      notes: "A muddy road.",
      watches: { first: [character.id] },
      activities: { [character.id]: "scout" },
    },
  });
  if (
    journey.payload.travel.dailyMiles !== 12 ||
    journey.payload.travel.status !== "traveling" ||
    journey.payload.travel.watches.first[0] !== character.id ||
    journey.payload.travel.activities[character.id] !== "scout"
  ) {
    throw new Error("Travel plan did not calculate progress or keep assignments");
  }
  await api(`/api/campaigns/${campaign.id}/travel/waypoints`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Smoke Bridge",
      miles: 6,
      description: "A muddy crossing.",
      visible: true,
    },
  });
  await api(`/api/campaigns/${campaign.id}/travel/waypoints`, {
    method: "POST",
    cookie: gmCookie,
    body: { name: "Smoke Hidden Camp", miles: 18, visible: false },
  });
  const playerMap = await api(`/api/campaigns/${campaign.id}/travel`, {
    cookie: playerCookie,
  });
  if (
    playerMap.payload.travel.waypoints.length !== 1 ||
    playerMap.payload.travel.waypoints[0].name !== "Smoke Bridge" ||
    playerMap.payload.travel.encounterChecks
  ) {
    throw new Error("Player travel view leaked hidden waypoints or encounter checks");
  }
  const playerWaypoint = await fetch(`${base}/api/campaigns/${campaign.id}/travel/waypoints`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ name: "Player waypoint", miles: 1 }),
  });
  if (playerWaypoint.status !== 403) throw new Error("Player edited the route map");
  const encounterCheck = await api(`/api/campaigns/${campaign.id}/travel/check`, {
    method: "POST",
    cookie: gmCookie,
    body: { watch: 3, note: "Smoke patrol." },
  });
  if (
    !encounterCheck.payload.check ||
    encounterCheck.payload.check.roll < 1 ||
    encounterCheck.payload.check.roll > 20 ||
    encounterCheck.payload.travel.encounterChecks.length !== 1
  ) {
    throw new Error("Encounter check did not record a valid d20 result");
  }
  const firstDay = await api(`/api/campaigns/${campaign.id}/travel/advance`, {
    method: "POST",
    cookie: gmCookie,
    body: {},
  });
  if (firstDay.payload.travel.progressMiles !== 12 || firstDay.payload.travel.daysTravelled !== 1) {
    throw new Error("Advancing travel did not add the day's miles");
  }
  const arrived = await api(`/api/campaigns/${campaign.id}/travel/advance`, {
    method: "POST",
    cookie: gmCookie,
    body: {},
  });
  if (arrived.payload.travel.status !== "complete" || arrived.payload.travel.progressMiles !== 24) {
    throw new Error("Travel did not complete at the destination");
  }
  if (
    !arrived.payload.travel.waypoints.find((waypoint) => waypoint.name === "Smoke Bridge")?.reached
  ) {
    throw new Error("Travel did not mark the waypoint as reached");
  }
  const playerAdvance = await fetch(`${base}/api/campaigns/${campaign.id}/travel/advance`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: "{}",
  });
  if (playerAdvance.status !== 403) throw new Error("Player advanced the journey");
  await api(`/api/campaigns/${campaign.id}/travel`, { method: "DELETE", cookie: gmCookie });
  const clearedTravel = await api(`/api/campaigns/${campaign.id}/travel`, {
    cookie: playerCookie,
  });
  if (clearedTravel.payload.travel !== null) throw new Error("Travel plan was not cleared");
  log("the GM plans journeys and advances travel days");

  const emptySessionZero = await api(`/api/campaigns/${campaign.id}/session-zero`, {
    cookie: gmCookie,
  });
  if (emptySessionZero.payload.profile.pitch !== "") {
    throw new Error("A new campaign did not start without a session zero charter");
  }
  const playerCharterEdit = await fetch(`${base}/api/campaigns/${campaign.id}/session-zero`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ pitch: "Player-written pitch" }),
  });
  if (playerCharterEdit.status !== 403) throw new Error("Player edited the session zero charter");
  const charter = await api(`/api/campaigns/${campaign.id}/session-zero`, {
    method: "PUT",
    cookie: gmCookie,
    body: {
      pitch: "A city of ash and old debts.",
      genre: "Dark fantasy",
      tone: "Heroic with sharp edges",
      themes: "Loyalty, costly magic",
      expectations: "Share the spotlight and flag rules questions.",
      houseRules: "Free archetype.",
      contentLimits: "No graphic torture.",
      safetyTools: "Use the pause signal or message the GM privately.",
      allowedSources: "Player Core, GM Core, Monster Core.",
      partyGoal: "Break the Ashen Crown before it wakes.",
      partyHooks: "The ferryman owes the party a debt.",
      gmNotes: "The Ash Warden is the final antagonist.",
      checklist: { pitch: true, themes: true, safety: true, sources: true, hooks: true },
    },
  });
  if (
    charter.payload.profile.pitch !== "A city of ash and old debts." ||
    charter.payload.profile.allowedSources !== "Player Core, GM Core, Monster Core." ||
    charter.payload.profile.partyGoal !== "Break the Ashen Crown before it wakes." ||
    charter.payload.profile.gmNotes !== "The Ash Warden is the final antagonist."
  ) {
    throw new Error("GM session zero charter did not save");
  }
  const playerCharterView = await api(`/api/campaigns/${campaign.id}/session-zero`, {
    cookie: playerCookie,
  });
  if (
    playerCharterView.payload.profile.pitch !== "A city of ash and old debts." ||
    playerCharterView.payload.profile.allowedSources !== "Player Core, GM Core, Monster Core." ||
    playerCharterView.payload.profile.partyGoal !== "Break the Ashen Crown before it wakes." ||
    "gmNotes" in playerCharterView.payload.profile
  ) {
    throw new Error("Player session zero view leaked GM notes or missed the charter");
  }
  const preference = await api(`/api/campaigns/${campaign.id}/session-zero/preference`, {
    method: "PUT",
    cookie: playerCookie,
    body: { lines: "Spiders", veils: "Torture", notes: "Check in after hard scenes." },
  });
  if (preference.payload.preference.lines !== "Spiders") {
    throw new Error("Safety preference did not save");
  }
  const responses = await api(`/api/campaigns/${campaign.id}/session-zero`, {
    cookie: gmCookie,
  });
  const namedResponse = responses.payload.responses.find((entry) => entry.lines === "Spiders");
  if (!namedResponse || !namedResponse.authorName || namedResponse.anonymous) {
    throw new Error("GM could not read a named safety response");
  }
  await api(`/api/campaigns/${campaign.id}/session-zero/preference`, {
    method: "PUT",
    cookie: playerCookie,
    body: { anonymous: true },
  });
  const anonymousResponses = await api(`/api/campaigns/${campaign.id}/session-zero`, {
    cookie: gmCookie,
  });
  const anonymousResponse = anonymousResponses.payload.responses.find(
    (entry) => entry.lines === "Spiders"
  );
  if (!anonymousResponse?.anonymous || anonymousResponse.authorName !== null) {
    throw new Error("Anonymous safety response exposed the player");
  }
  const signal = await fetch(`${base}/api/campaigns/${campaign.id}/session-zero/signal`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: playerCookie },
    body: JSON.stringify({ note: "Need a pause." }),
  });
  if (signal.status !== 200) throw new Error("Safety pause signal failed");
  const gmTableView = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const playerTableView = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  const signalMessage = gmTableView.payload.messages.find((message) =>
    message.content.includes("safety pause")
  );
  const leakedSignal = playerTableView.payload.messages.some((message) =>
    message.content.includes("safety pause")
  );
  if (!signalMessage || leakedSignal) {
    throw new Error("Safety signal was not GM-only");
  }
  const sessionZeroExport = await api(`/api/campaigns/${campaign.id}/export`, {
    cookie: gmCookie,
  });
  if (
    sessionZeroExport.payload.sessionZero.pitch !== "A city of ash and old debts." ||
    "safetyPreferences" in sessionZeroExport.payload
  ) {
    throw new Error("Campaign export did not include the charter or leaked safety preferences");
  }
  log("session zero, private safety limits, and the pause signal work");

  const downtimeGrant = await api(`/api/campaigns/${campaign.id}/downtime`, {
    method: "POST",
    cookie: gmCookie,
    body: { days: 8, characterIds: [character.id] },
  });
  const downtimeSummary = downtimeGrant.payload.characters?.find(
    (entry) => entry.id === character.id
  )?.summary?.downtimeDays;
  if (downtimeGrant.payload.recipients !== 1 || downtimeSummary !== 8) {
    throw new Error("Downtime grant did not reach the character summary");
  }
  const downtimeCharacter = await api(`/api/characters/${character.id}`, {
    cookie: playerCookie,
  });
  if (downtimeCharacter.payload.character.data.play.downtimeDays !== 8) {
    throw new Error("Downtime grant did not reach the character data");
  }
  const trainingDraft = JSON.parse(JSON.stringify(downtimeCharacter.payload.character.data));
  trainingDraft.skills.trained = [
    ...new Set([...(trainingDraft.skills.trained ?? []), "crafting", "medicine"]),
  ];
  trainingDraft.play.hp = 10;
  trainingDraft.play.treatWoundsImmune = false;
  trainingDraft.play.battleMedicineImmuneBy = [];
  const trainedCharacter = await api(`/api/characters/${character.id}`, {
    method: "PUT",
    cookie: playerCookie,
    body: { data: trainingDraft, force: true },
  });
  const beforePurse = trainedCharacter.payload.character.data.currency;
  const beforePurseCp =
    (beforePurse?.gp ?? 0) * 100 + (beforePurse?.sp ?? 0) * 10 + (beforePurse?.cp ?? 0);
  const spent = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: { days: 1 },
  });
  if (spent.payload.character.data.play.downtimeDays !== 7) {
    throw new Error("Spending downtime did not update the character data");
  }
  if (spent.payload.paidCp !== 6 || spent.payload.lifestyle !== "subsistence") {
    throw new Error("Downtime spend did not charge the subsistence upkeep");
  }
  const afterPurse = spent.payload.character.data.currency;
  const afterPurseCp =
    (afterPurse?.gp ?? 0) * 100 + (afterPurse?.sp ?? 0) * 10 + (afterPurse?.cp ?? 0);
  if (afterPurseCp !== beforePurseCp - 6) {
    throw new Error("Downtime spend did not deduct cost of living from the purse");
  }

  const earn = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: {
      activity: {
        kind: "earn-income",
        skill: "crafting",
        taskLevel: 0,
        dc: 1,
        label: "Smoke job",
      },
    },
  });
  if (
    earn.payload.activity?.kind !== "earn-income" ||
    earn.payload.activity.daysSpent !== 1 ||
    earn.payload.activity.dailyEarnedCp === null ||
    earn.payload.paidCp !== 6
  ) {
    throw new Error("Earn Income did not record a job and charge upkeep");
  }
  if (earn.payload.character.data.play.downtimeDays !== 6) {
    throw new Error("Earn Income did not consume a downtime day");
  }
  const continued = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: { activity: { activityId: earn.payload.activity.id } },
  });
  if (
    continued.payload.roll !== null ||
    continued.payload.earnedCp !== earn.payload.activity.dailyEarnedCp ||
    continued.payload.character.data.play.downtimeDays !== 5
  ) {
    throw new Error("Earn Income did not repeat the first day's pay");
  }

  const subsist = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: { activity: { kind: "subsist", skill: "survival", dc: 1 } },
  });
  const subsistWaived =
    subsist.payload.degree === "success" || subsist.payload.degree === "critical-success";
  if (subsist.payload.upkeepWaived !== subsistWaived) {
    throw new Error("Subsist did not report whether upkeep was waived");
  }
  if (subsistWaived && subsist.payload.paidCp !== 0) {
    throw new Error("A successful Subsist still charged upkeep");
  }
  if (
    !subsistWaived &&
    !subsist.payload.character.data.play.conditions.some(
      (condition) => condition.name === "Fatigued"
    )
  ) {
    throw new Error("A failed Subsist did not apply fatigue");
  }

  const craft = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: { activity: { kind: "craft", label: "Smoke project", daysRequired: 2 } },
  });
  if (craft.payload.completed || craft.payload.activity?.daysSpent !== 1) {
    throw new Error("A crafting project completed too early");
  }
  const crafted = await api(`/api/characters/${character.id}/downtime/spend`, {
    method: "POST",
    cookie: playerCookie,
    body: { activity: { activityId: craft.payload.activity.id } },
  });
  if (!crafted.payload.completed || crafted.payload.activity?.daysSpent !== 2) {
    throw new Error("A crafting project did not complete on its last day");
  }
  if (crafted.payload.character.data.play.downtimeDays !== 2) {
    throw new Error("Downtime activities did not consume the expected days");
  }
  const spentTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (
    spentTable.payload.characters.find((entry) => entry.id === character.id)?.summary
      ?.downtimeDays !== 2
  ) {
    throw new Error("Spending downtime did not update the character summary");
  }
  const playerDowntime = await fetch(`${base}/api/campaigns/${campaign.id}/downtime`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ days: 1 }),
  });
  if (playerDowntime.status !== 403) throw new Error("Player granted downtime");
  log("the GM grants downtime and the player spends it on the sheet");

  const recovery = await api(`/api/characters/${character.id}/recovery`, {
    method: "POST",
    cookie: playerCookie,
    body: { activity: "treat-wounds", targetId: character.id, dc: 15 },
  });
  if (
    !["critical-success", "success", "failure", "critical-failure"].includes(
      recovery.payload.degree
    )
  ) {
    throw new Error("Treat Wounds did not return a degree of success");
  }
  if (recovery.payload.character.data.play.treatWoundsImmune !== true) {
    throw new Error("Treat Wounds did not record the target's immunity");
  }
  const immuneRecovery = await fetch(`${base}/api/characters/${character.id}/recovery`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ activity: "treat-wounds", targetId: character.id, dc: 15 }),
  });
  if (immuneRecovery.status !== 400) throw new Error("Treat Wounds ignored immunity");
  const notDying = await fetch(`${base}/api/characters/${character.id}/recovery`, {
    method: "POST",
    headers: { cookie: playerCookie, "content-type": "application/json" },
    body: JSON.stringify({ activity: "stabilize", targetId: character.id, dc: 15 }),
  });
  if (notDying.status !== 400) throw new Error("Stabilize accepted a target that was not dying");
  const clearedRecovery = await api(`/api/characters/${character.id}/recovery/clear`, {
    method: "POST",
    cookie: playerCookie,
  });
  if (clearedRecovery.payload.character.data.play.treatWoundsImmune !== false) {
    throw new Error("Clearing recovery immunity did not update the character");
  }
  log("Treat Wounds rolls on the server and tracks immunity");

  const libraryResponse = await fetch(`${base}/api/campaigns/${campaign.id}/audio/library`, {
    headers: { cookie: gmCookie },
  });
  if (libraryResponse.status !== 200) {
    throw new Error(`Music library failed (${libraryResponse.status})`);
  }
  const libraryPayload = await libraryResponse.json();
  if (!Array.isArray(libraryPayload.tracks) || libraryPayload.tracks.length < 14) {
    throw new Error("Bundled music library is missing tracks");
  }
  const battleLibraryTrack = libraryPayload.tracks.find(
    (track) => track.mood === "battle" && !track.added
  );
  if (!battleLibraryTrack?.url?.startsWith("/audio-library/")) {
    throw new Error("Bundled music library did not expose a battle track");
  }
  const libraryFile = await fetch(`${base}${battleLibraryTrack.url}`);
  if (
    libraryFile.status !== 200 ||
    !String(libraryFile.headers.get("content-type") || "").startsWith("audio/")
  ) {
    throw new Error("Bundled music file was not served as audio");
  }
  const libraryForbidden = await fetch(`${base}/api/campaigns/${campaign.id}/audio/library`, {
    headers: { cookie: playerCookie },
  });
  if (libraryForbidden.status !== 403) {
    throw new Error("Player browsed the GM-only music library");
  }
  const addLibraryResponse = await fetch(
    `${base}/api/campaigns/${campaign.id}/audio/library/${encodeURIComponent(battleLibraryTrack.id)}`,
    { method: "POST", headers: { cookie: gmCookie } }
  );
  if (addLibraryResponse.status !== 201) {
    throw new Error(`Adding a library track failed (${addLibraryResponse.status})`);
  }
  const addedLibraryTrack = (await addLibraryResponse.json()).track;
  if (!addedLibraryTrack?.url?.startsWith("/audio-library/")) {
    throw new Error("Added library track did not keep its bundled URL");
  }
  const duplicateLibraryResponse = await fetch(
    `${base}/api/campaigns/${campaign.id}/audio/library/${encodeURIComponent(battleLibraryTrack.id)}`,
    { method: "POST", headers: { cookie: gmCookie } }
  );
  if (duplicateLibraryResponse.status !== 409) {
    throw new Error("Duplicate library track was accepted");
  }
  const libraryExport = await api(`/api/campaigns/${campaign.id}/export`, {
    cookie: gmCookie,
  });
  const importedLibrary = await api("/api/campaigns/import", {
    method: "POST",
    cookie: gmCookie,
    body: libraryExport.payload,
  });
  if (importedLibrary.payload.stats?.audioTracks !== 1) {
    throw new Error("Campaign import did not carry the bundled library track");
  }
  const importedLibraryTable = await api(
    `/api/campaigns/${importedLibrary.payload.campaign.id}/table`,
    { cookie: gmCookie }
  );
  if (
    !importedLibraryTable.payload.audioTracks?.some((track) => track.url === addedLibraryTrack.url)
  ) {
    throw new Error("Imported campaign lost the bundled library URL");
  }
  await api(`/api/campaigns/${importedLibrary.payload.campaign.id}`, {
    method: "DELETE",
    cookie: gmCookie,
    body: { confirmName: importedLibrary.payload.campaign.name },
  });
  await api(`/api/campaigns/${campaign.id}/audio/${addedLibraryTrack.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  log("music library exposes CC0 mood tracks and the GM can add one");

  const wav = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  const audioForm = new FormData();
  audioForm.append("file", new Blob([wav], { type: "audio/wav" }), "smoke-theme.wav");
  const audioTracksPromise = waitForEvent(playerSocket, "audio:tracks", (payload) =>
    payload.tracks?.some((track) => track.name === "smoke-theme")
  );
  const audioUpload = await fetch(`${base}/api/uploads/audio`, {
    method: "POST",
    headers: { cookie: gmCookie, "x-campaign-id": campaign.id },
    body: audioForm,
  });
  if (audioUpload.status !== 201) {
    throw new Error(`Audio upload failed (${audioUpload.status})`);
  }
  const uploadedTracks = await audioTracksPromise;
  if (!uploadedTracks.tracks.some((track) => track.name === "smoke-theme")) {
    throw new Error("New soundtrack did not reach the connected player");
  }
  const audioTrack = (await audioUpload.json()).track;
  if (!audioTrack?.id || audioTrack.url.startsWith("/uploads/") === false) {
    throw new Error("Audio upload did not return a stored track");
  }
  const anonymousAudioFile = await fetch(`${base}${audioTrack.url}`);
  if (anonymousAudioFile.status !== 401) {
    throw new Error("Uploaded audio was readable without a session");
  }
  const audioStatePromise = waitForEvent(
    playerSocket,
    "audio:state",
    (payload) => payload.state?.trackId === audioTrack.id && payload.state?.playing === true
  );
  gmSocket.emit("audio:update", {
    campaignId: campaign.id,
    trackId: audioTrack.id,
    playing: true,
    position: 12.5,
  });
  await audioStatePromise;
  const audioTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (
    audioTable.payload.audioTracks?.length !== 1 ||
    audioTable.payload.audioState?.trackId !== audioTrack.id ||
    audioTable.payload.audioState?.playing !== true ||
    audioTable.payload.audioState?.position !== 12.5
  ) {
    throw new Error("Audio track or playback state was not persisted");
  }
  const audioExport = await api(`/api/campaigns/${campaign.id}/export`, { cookie: gmCookie });
  if (!audioExport.payload.audioTracks?.some((track) => track.id === audioTrack.id)) {
    throw new Error("Campaign export did not include the soundtrack");
  }
  const importedAudio = await api("/api/campaigns/import", {
    method: "POST",
    cookie: gmCookie,
    body: audioExport.payload,
  });
  if (importedAudio.payload.stats?.audioTracks !== 1) {
    throw new Error("Campaign import did not report the soundtrack");
  }
  const importedAudioTable = await api(
    `/api/campaigns/${importedAudio.payload.campaign.id}/table`,
    { cookie: gmCookie }
  );
  if (
    importedAudioTable.payload.audioTracks?.length !== 1 ||
    importedAudioTable.payload.audioTracks[0]?.url !== audioTrack.url
  ) {
    throw new Error("Campaign import did not carry the soundtrack metadata");
  }
  await api(`/api/campaigns/${importedAudio.payload.campaign.id}`, {
    method: "DELETE",
    cookie: gmCookie,
    body: { confirmName: importedAudio.payload.campaign.name },
  });
  log("soundtrack survives campaign export and import");
  playerSocket.emit("audio:update", {
    campaignId: campaign.id,
    trackId: audioTrack.id,
    playing: false,
    position: 0,
  });
  await delay(200);
  const audioAfterPlayer = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  if (audioAfterPlayer.payload.audioState?.playing !== true) {
    throw new Error("Player changed the shared audio state");
  }
  const audioTracksCleared = waitForEvent(
    playerSocket,
    "audio:tracks",
    (payload) => payload.tracks?.length === 0
  );
  const audioDelete = await api(`/api/campaigns/${campaign.id}/audio/${audioTrack.id}`, {
    method: "DELETE",
    cookie: gmCookie,
  });
  await audioTracksCleared;
  if (!audioDelete.payload.ok) throw new Error("GM could not delete the audio track");
  const deletedAudioFile = await fetch(`${base}${audioTrack.url}`, {
    headers: { cookie: gmCookie },
  });
  if (deletedAudioFile.status !== 404) {
    throw new Error("Deleting a soundtrack left its backing file behind");
  }
  const audioTableAfter = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  if (
    audioTableAfter.payload.audioTracks?.length !== 0 ||
    audioTableAfter.payload.audioState?.trackId !== null
  ) {
    throw new Error("Deleted audio track or state was not cleared");
  }
  log("GM uploads and controls the shared soundtrack; players cannot change it");

  const initiativePromise = waitForEvent(playerSocket, "initiative:updated", (payload) =>
    payload.entries.some((entry) => entry.tokenId === token.id)
  );
  gmSocket.emit("initiative:roll", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenIds: [token.id],
  });
  const initiative = await initiativePromise;
  const entry = initiative.entries.find((item) => item.tokenId === token.id);
  if (!entry) throw new Error("Token missing from initiative order");
  const rerollPromise = waitForEvent(playerSocket, "initiative:updated", (payload) =>
    payload.entries.some((item) => item.id === entry.id)
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
  const groupInitiativePromise = waitForEvent(playerSocket, "initiative:updated", (payload) =>
    payload.entries.some((entry) => entry.groupId === smokeGroup)
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

  const beforeReconnect = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  playerSocket.disconnect();
  await delay(150);
  const offlineMove = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId === token.id && event.x === 420 && event.y === 360
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
  const reconnectedTable = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: playerCookie,
  });
  const reconnectedToken = reconnectedTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!reconnectedToken || reconnectedToken.x !== 420 || reconnectedToken.y !== 360) {
    throw new Error("Reconnected client did not receive the authoritative token position");
  }
  if (reconnectedTable.payload.revision <= beforeReconnect.payload.revision) {
    throw new Error("Reconnect snapshot did not advance the campaign revision");
  }
  reconnectedPlayer.close();
  log("disconnected client caught up from the authoritative snapshot");

  const movementSetup = waitForEvent(
    gmSocket,
    "initiative:updated",
    (payload) => payload.entries.length === 1 && payload.entries[0].id === "init_move_test"
  );
  gmSocket.emit("initiative:update", {
    campaignId: campaign.id,
    entries: [
      {
        id: "init_move_test",
        tokenId: token.id,
        name: "Smoke Hero",
        initiative: 20,
        color: "#c8a96b",
        ownerId: player.id,
        sceneId: scene.id,
        movementUsed: 0,
        diagonalSteps: 0,
      },
    ],
    round: 1,
    turnIndex: 0,
  });
  await movementSetup;

  const firstMove = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return (
      active?.id === "init_move_test" && active.movementUsed === 15 && active.diagonalSteps === 2
    );
  });
  gmSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 560,
    y: 500,
  });
  await firstMove;

  const secondMove = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return (
      active?.id === "init_move_test" && active.movementUsed === 20 && active.diagonalSteps === 3
    );
  });
  gmSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 630,
    y: 570,
  });
  await secondMove;

  const movementReset = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return active?.id === "init_move_test" && active.movementUsed === 0;
  });
  gmSocket.emit("initiative:next", { campaignId: campaign.id, direction: 1 });
  await movementReset;
  log("movement carries the 5/10 diagonal count across moves and resets on the next turn");

  const speedCrate = {
    id: "prop_speed",
    name: "Speed crate",
    imageUrl: "/props/crate.svg",
    x: 665,
    y: 735,
    width: 100,
    height: 100,
    rotation: 0,
    layer: "ground",
    visible: true,
    locked: false,
    z: 1,
  };
  const speedProps = waitForEvent(
    gmSocket,
    "scene:props",
    (payload) =>
      payload.sceneId === scene.id && payload.props?.some((prop) => prop.id === "prop_speed")
  );
  gmSocket.emit("scene:props", {
    campaignId: campaign.id,
    sceneId: scene.id,
    props: [speedCrate],
  });
  await speedProps;
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { propCollision: true },
  });
  const speedSetup = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return active?.id === "init_move_test" && active.movementUsed === 20;
  });
  gmSocket.emit("initiative:update", {
    campaignId: campaign.id,
    entries: [
      {
        id: "init_move_test",
        tokenId: token.id,
        name: "Smoke Hero",
        initiative: 20,
        color: "#c8a96b",
        ownerId: player.id,
        sceneId: scene.id,
        movementUsed: 20,
        diagonalSteps: 0,
      },
    ],
    round: 1,
    turnIndex: 0,
  });
  await speedSetup;

  const speedPlayer = await connectSocket(playerCookie);
  await emitAck(speedPlayer, "campaign:join", { campaignId: campaign.id });
  const speedMove = waitForEvent(gmSocket, "token:moved", (event) => event.tokenId === token.id);
  const speedMovement = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return active?.id === "init_move_test" && active.movementUsed === 25;
  });
  speedPlayer.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: 665,
    y: 875,
  });
  const speedEvent = await speedMove;
  await speedMovement;
  speedPlayer.close();
  if (speedEvent.x === 665 && speedEvent.y === 875) {
    throw new Error("A speed-limited detour reached a square beyond the remaining Speed");
  }
  const speedTable = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const speedToken = speedTable.payload.tokens.find((entry) => entry.id === token.id);
  if (!speedToken || speedToken.x !== speedEvent.x || speedToken.y !== speedEvent.y) {
    throw new Error("Speed-limited detour position did not match the authoritative token state");
  }
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { propCollision: false },
  });
  log("a detour stops at the last square covered by the remaining Speed");

  const wallStart = { x: speedEvent.x, y: speedEvent.y };
  const wallTarget = { x: wallStart.x + 140, y: wallStart.y };
  const wallBarrier = {
    id: "wall_move_smoke",
    x1: wallStart.x + 35,
    y1: wallStart.y - 140,
    x2: wallStart.x + 35,
    y2: wallStart.y + 140,
    kind: "wall",
  };
  const wallBarrierPromise = waitForEvent(
    gmSocket,
    "scene:walls",
    (payload) =>
      payload.sceneId === scene.id && payload.walls?.some((wall) => wall.id === "wall_move_smoke")
  );
  gmSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [wallBarrier],
  });
  await wallBarrierPromise;
  const wallMove = waitForEvent(
    gmSocket,
    "token:moved",
    (event) => event.tokenId === token.id && event.x === wallTarget.x && event.y === wallTarget.y
  );
  const wallMovement = waitForEvent(gmSocket, "initiative:updated", (payload) => {
    const active = payload.entries[payload.turnIndex];
    return active?.id === "init_move_test" && (active.movementUsed ?? 0) > 35;
  });
  gmSocket.emit("token:move", {
    campaignId: campaign.id,
    sceneId: scene.id,
    tokenId: token.id,
    x: wallTarget.x,
    y: wallTarget.y,
  });
  await wallMove;
  await wallMovement;
  await api(`/api/scenes/${scene.id}`, {
    method: "PATCH",
    cookie: gmCookie,
    body: { wallCollision: false },
  });
  gmSocket.emit("scene:walls", {
    campaignId: campaign.id,
    sceneId: scene.id,
    walls: [],
  });
  log("wall collision routes a move around a wall and charges the detour distance");

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
    { method: "PATCH", cookie: gmCookie, body: { wave: 3, count: 2 } }
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
    { method: "POST", cookie: gmCookie, body: { sceneId: scene.id, wave: 1, mode: "fresh" } }
  );
  if (firstLaunch.payload.mode !== "fresh" || firstLaunch.payload.combatants !== 2) {
    throw new Error("Wave one did not launch as a fresh encounter");
  }
  const waveOneEntries = firstLaunch.payload.initiative.filter((entry) =>
    String(entry.name).startsWith("Wave One Guard")
  );
  if (
    waveOneEntries.length !== 1 ||
    !waveOneEntries[0].groupId ||
    !String(waveOneEntries[0].name).includes("×2")
  ) {
    throw new Error(
      "Encounter launch did not group a multi-creature wave into one initiative entry"
    );
  }
  const beforeReinforcement = await api(`/api/campaigns/${campaign.id}/table`, {
    cookie: gmCookie,
  });
  const activeBefore =
    beforeReinforcement.payload.initiative[beforeReinforcement.payload.turnIndex];
  const reinforcement = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`,
    { method: "POST", cookie: gmCookie, body: { sceneId: scene.id, wave: 3, mode: "reinforce" } }
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
    String(entry.name).startsWith("Wave Two Guard")
  );
  if (
    reinforcedEntries.length !== 1 ||
    !reinforcedEntries[0].groupId ||
    !String(reinforcedEntries[0].name).includes("×2")
  ) {
    throw new Error("Reinforcement wave did not create one grouped initiative entry");
  }
  const duplicateWave = await fetch(
    `${base}/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`,
    {
      method: "POST",
      headers: { cookie: gmCookie, "content-type": "application/json" },
      body: JSON.stringify({ sceneId: scene.id, wave: 3, mode: "reinforce" }),
    }
  );
  if (duplicateWave.status !== 400) {
    throw new Error("Reinforcing an already-launched wave was allowed");
  }
  const playerEncounter = await fetch(`${base}/api/campaigns/${campaign.id}/encounters`, {
    headers: { cookie: playerCookie },
  });
  if (playerEncounter.status !== 403) throw new Error("Player could read GM encounter prep");

  // Hidden combatants stay out of the player-facing initiative order even when
  // a reinforcement launch re-broadcasts the authoritative order.
  await api(`/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/combatants`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: "Wave Four Guard",
      level: 2,
      count: 1,
      hp: 20,
      ac: 16,
      perception: 8,
      wave: 4,
    },
  });
  const hiddenWatcher = await connectSocket(playerCookie);
  await emitAck(hiddenWatcher, "campaign:join", { campaignId: campaign.id });
  const hiddenCombatant = await emitAck(gmSocket, "token:create", {
    campaignId: campaign.id,
    sceneId: scene.id,
    token: { name: "Smoke Hidden Reinforcer", x: 740, y: 740, size: 1 },
  });
  if (!hiddenCombatant?.id) {
    throw new Error(`Hidden combatant token was not created: ${JSON.stringify(hiddenCombatant)}`);
  }
  const hiddenRoll = waitForEvent(gmSocket, "initiative:updated", (payload) =>
    payload.entries?.some((entry) => entry.tokenId === hiddenCombatant.id)
  );
  gmSocket.emit("initiative:roll", { campaignId: campaign.id, sceneId: scene.id });
  await hiddenRoll.catch((error) => {
    throw new Error(`Hidden combatant roll failed: ${error.message}`);
  });
  const hiddenRemoved = waitForEvent(
    hiddenWatcher,
    "token:deleted",
    (payload) => payload.tokenId === hiddenCombatant.id
  );
  gmSocket.emit("token:update", {
    campaignId: campaign.id,
    token: { id: hiddenCombatant.id, hidden: true },
  });
  await hiddenRemoved.catch((error) => {
    throw new Error(`Hidden combatant removal failed: ${error.message}`);
  });
  const playerReinforcement = waitForEvent(hiddenWatcher, "initiative:updated", (payload) =>
    payload.entries?.some((entry) => String(entry.name).startsWith("Wave Four Guard"))
  );
  await api(`/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`, {
    method: "POST",
    cookie: gmCookie,
    body: { sceneId: scene.id, wave: 4, mode: "reinforce" },
  });
  const playerReinforcementPayload = await playerReinforcement.catch((error) => {
    throw new Error(`Reinforcement did not reach the player: ${error.message}`);
  });
  if (
    playerReinforcementPayload.entries.some(
      (entry) =>
        entry.tokenId === hiddenCombatant.id ||
        String(entry.name).includes("Smoke Hidden Reinforcer")
    )
  ) {
    throw new Error("Reinforcement leaked a hidden combatant to players");
  }

  const freshAgain = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/launch`,
    { method: "POST", cookie: gmCookie, body: { sceneId: scene.id, wave: 1, mode: "fresh" } }
  );
  if (freshAgain.payload.tokens.length !== 2) {
    throw new Error("A second fresh launch did not replace the earlier encounter tokens");
  }
  const afterFresh = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  const staleTokens = afterFresh.payload.tokens.filter((entry) =>
    String(entry.name).startsWith("Wave Two Guard")
  );
  if (
    staleTokens.length ||
    !afterFresh.payload.tokens.some((entry) => entry.id === hiddenCombatant.id)
  ) {
    throw new Error("Fresh launch did not clear only its own encounter tokens");
  }
  const playerClear = await fetch(
    `${base}/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/clear`,
    { method: "POST", headers: { cookie: playerCookie } }
  );
  if (playerClear.status !== 403) throw new Error("Player could clear a launched encounter");
  const clearedEncounter = await api(
    `/api/campaigns/${campaign.id}/encounters/${smokeEncounter.id}/clear`,
    { method: "POST", cookie: gmCookie }
  );
  if (clearedEncounter.payload.removed !== 2) {
    throw new Error("Clearing a launched encounter did not remove its tokens");
  }
  const afterClear = await api(`/api/campaigns/${campaign.id}/table`, { cookie: gmCookie });
  if (
    afterClear.payload.tokens.some((entry) => String(entry.name).startsWith("Wave One Guard")) ||
    afterClear.payload.initiative.some((entry) => String(entry.name).startsWith("Wave One Guard"))
  ) {
    throw new Error("Encounter clear left launched tokens or initiative entries behind");
  }
  if (!afterClear.payload.tokens.some((entry) => entry.id === hiddenCombatant.id)) {
    throw new Error("Encounter clear removed a token it did not launch");
  }
  gmSocket.emit("token:delete", { campaignId: campaign.id, tokenId: hiddenCombatant.id });
  hiddenWatcher.close();
  log("encounter waves, reinforcement launches, hidden initiative, and cleanup are supported");

  gmSocket.close();
  playerSocket.close();

  const transfer = await api(`/api/campaigns/${campaign.id}/transfer`, {
    method: "POST",
    cookie: gmCookie,
    body: { userId: player.id },
  });
  if (transfer.payload.campaign.gmId !== player.id) {
    throw new Error("GM transfer did not change the campaign owner");
  }
  const playerAudit = await fetch(`${base}/api/campaigns/${campaign.id}/loot/audit`, {
    headers: { cookie: playerCookie },
  });
  const formerGmAudit = await fetch(`${base}/api/campaigns/${campaign.id}/loot/audit`, {
    headers: { cookie: gmCookie },
  });
  if (playerAudit.status !== 200 || formerGmAudit.status !== 403) {
    throw new Error("GM permissions did not change immediately after transfer");
  }
  const transferBack = await api(`/api/campaigns/${campaign.id}/transfer`, {
    method: "POST",
    cookie: playerCookie,
    body: { userId: gm.id },
  });
  if (transferBack.payload.campaign.gmId !== gm.id) {
    throw new Error("The new GM could not transfer the campaign back");
  }
  log("campaign ownership transfers between members");

  const unconfirmedDelete = await fetch(`${base}/api/campaigns/${campaign.id}`, {
    method: "DELETE",
    headers: { cookie: gmCookie },
  });
  if (unconfirmedDelete.status !== 400) {
    throw new Error("Campaign deletion did not require the campaign name");
  }
  await api(`/api/campaigns/${importedCampaign.id}`, {
    method: "DELETE",
    cookie: gmCookie,
    body: { confirmName: importedCampaign.name },
  });
  await api(`/api/campaigns/${campaign.id}`, {
    method: "DELETE",
    cookie: gmCookie,
    body: { confirmName: campaign.name },
  });
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
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1500)]);
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
    console.warn(
      `Could not remove temporary smoke directory ${tempDir}:`,
      error instanceof Error ? error.message : error
    );
  }
  process.exit(exitCode);
}
