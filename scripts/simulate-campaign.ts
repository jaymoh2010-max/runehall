#!/usr/bin/env node
/**
 * Campaign-level simulation.
 *
 * Boots an isolated server, creates real accounts and campaigns, and plays two
 * complete 1-20 arcs through the HTTP and Socket.IO APIs:
 *
 *   A. "The Ashen Crown" - XP advancement, tokens, scene visibility,
 *      initiative ownership, handouts, quests, and export/import.
 *   B. "The Quiet Ledger" - milestone advancement, story level-ups,
 *      quest gating, and live campaign metadata.
 *
 * The output separates hard failures (things the app should do and does not),
 * observations (rule gaps or risky behaviour), and metrics. It is deterministic
 * except for server dice rolls.
 *
 * Usage:
 *   npm run simulate:campaign
 *   npm run simulate:campaign -- --report campaign-simulation.json
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { io, type Socket } from "socket.io-client";
import { characterSummary } from "../src/shared/rules";
import { normalizeAdvancementSpeed, xpPerLevel } from "../src/shared/xp";
import { buildSimulatedHero, contextForDraft } from "./lib/simHeroes";
import type { CharacterDraft, CharacterRecord } from "../src/shared/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "runehall-campaign-"));
const databasePath = path.join(tempDir, "runehall.db");
const compendiumDir = path.join(projectRoot, "data", "compendium");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const reportArgIndex = process.argv.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && process.argv[reportArgIndex + 1]
    ? path.resolve(process.argv[reportArgIndex + 1])
    : null;

type Json = Record<string, any>;
type CheckStatus = "pass" | "fail" | "observation";
interface CheckRecord {
  campaign: string;
  name: string;
  status: CheckStatus;
  detail?: string;
  error?: string;
}

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: "",
  checks: [] as CheckRecord[],
  metrics: {} as Record<string, number | string | boolean>,
  serverExit: null as number | null,
};

let child: ChildProcess | undefined;
let base = "";
let currentCampaign = "setup";
let serverOutput = "";

function log(message: string): void {
  console.log(`  ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort(): Promise<number> {
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

async function waitForServer(url: string): Promise<void> {
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

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function api(
  pathname: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    /** Defaults to any 2xx. Pass null to skip the status assertion. */
    expect?: number | null;
  } = {}
): Promise<{ status: number; payload: Json; cookie: string }> {
  const {
    method = "GET",
    body,
    cookie,
    expect = "2xx",
  } = options as {
    method?: string;
    body?: unknown;
    cookie?: string;
    expect?: number | "2xx" | null;
  };
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as Json;
  const statusMatches =
    expect === null ||
    (expect === "2xx"
      ? response.status >= 200 && response.status < 300
      : response.status === expect);
  if (!statusMatches) {
    throw new Error(
      `${method} ${pathname} returned ${response.status} (expected ${expect}): ${JSON.stringify(payload)}`
    );
  }
  return { status: response.status, payload, cookie: cookiesFrom(response) };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
    );
  }
}

async function check(
  campaign: string,
  name: string,
  fn: () => Promise<void> | void
): Promise<void> {
  const previous = currentCampaign;
  currentCampaign = campaign;
  try {
    await fn();
    report.checks.push({ campaign, name, status: "pass" });
    log(`[ok] ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.checks.push({ campaign, name, status: "fail", error: message });
    log(`[FAIL] ${name}: ${message}`);
  } finally {
    currentCampaign = previous;
  }
}

function metric(key: string, value: number | string | boolean): void {
  report.metrics[key] = value;
}

function waitForEvent<T = any>(
  socket: Socket,
  event: string,
  predicate: (value: T) => boolean = () => true,
  timeout = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const handler = (value: T) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(value);
    };
    socket.on(event, handler);
  });
}

function emitAck<T = any>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeout = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} ack`)),
      timeout
    );
    socket.emit(event, payload, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function emitAndWait<T = any>(
  socket: Socket,
  emitEvent: string,
  payload: unknown,
  listenEvent: string,
  predicate: (value: T) => boolean = () => true,
  timeout = 5_000
): Promise<T> {
  const result = waitForEvent<T>(socket, listenEvent, predicate, timeout);
  socket.emit(emitEvent, payload);
  return result;
}

function connectSocket(cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(base, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5_000,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

interface Account {
  id: string;
  username: string;
  displayName: string;
  cookie: string;
}

async function register(username: string, displayName: string): Promise<Account> {
  const result = await api("/api/auth/register", {
    method: "POST",
    body: {
      username,
      displayName,
      password: "campaign-sim-password-123",
      bootstrapToken: "campaign-sim-bootstrap-token",
    },
  });
  return {
    id: result.payload.user.id,
    username,
    displayName,
    cookie: result.cookie,
  };
}

async function createHero(
  account: Account,
  spec: {
    name: string;
    className: string;
    backgroundName: string;
    heritageName?: string;
  }
): Promise<CharacterRecord> {
  const created = await api("/api/characters", {
    method: "POST",
    cookie: account.cookie,
    body: { name: spec.name },
  });
  const id = created.payload.character.id as string;
  const draft = buildSimulatedHero(spec);
  const saved = await api(`/api/characters/${id}`, {
    method: "PUT",
    cookie: account.cookie,
    body: { data: draft, force: true },
  });
  return saved.payload.character as CharacterRecord;
}

async function joinCampaign(
  account: Account,
  campaignId: string,
  inviteCode: string,
  characterId: string
): Promise<Json> {
  const joined = await api("/api/campaigns/join", {
    method: "POST",
    cookie: account.cookie,
    body: { code: inviteCode, characterId },
  });
  assert(joined.payload.campaign?.id === campaignId, "Join returned a different campaign");
  return joined.payload;
}

async function getTable(campaignId: string, cookie: string): Promise<Json> {
  return (await api(`/api/campaigns/${campaignId}/table`, { cookie })).payload;
}

function summaryFor(table: Json, characterId: string): Json {
  const character = (table.characters as Json[]).find((entry) => entry.id === characterId);
  assert(character, `Character ${characterId} missing from table snapshot`);
  return character.summary;
}

function characterFor(table: Json, characterId: string): Json {
  const character = (table.characters as Json[]).find((entry) => entry.id === characterId);
  assert(character, `Character ${characterId} missing from table snapshot`);
  return character;
}

function localSummary(character: Json): Json {
  return characterSummary(character.data as CharacterDraft, contextForDraft(character.data));
}

async function runCampaignA(gm: Account, players: Account[]): Promise<void> {
  const campaignName = "A: The Ashen Crown";
  const created = await api("/api/campaigns", {
    method: "POST",
    cookie: gm.cookie,
    body: {
      name: campaignName,
      description: "A 1-20 simulation campaign with XP advancement.",
      ruleset: "expanded",
      xpMode: "xp",
      advancementSpeed: "fast",
    },
  });
  const campaign = created.payload.campaign;
  const campaignId = campaign.id as string;
  const inviteCode = campaign.inviteCode as string;
  const levelXp = xpPerLevel(normalizeAdvancementSpeed(campaign.advancementSpeed));
  assertEqual(campaign.xpMode, "xp", "Campaign XP mode");
  assertEqual(campaign.advancementSpeed, "fast", "Campaign advancement speed");
  assertEqual(levelXp, 800, "Fast advancement threshold");
  assertEqual(campaign.worldDate?.year, 4726, "Default world year");
  assertEqual(campaign.memberCount, 1, "New campaign member count");

  const heroSpecs = [
    { className: "Fighter", backgroundName: "Warrior", name: "Bram Ironvow" },
    { className: "Wizard", backgroundName: "Scholar", name: "Sela Quill" },
    { className: "Cleric", backgroundName: "Acolyte", name: "Mother Yara" },
    { className: "Rogue", backgroundName: "Criminal", name: "Pip Vex" },
  ];
  const heroes: CharacterRecord[] = [];
  for (let index = 0; index < players.length; index++) {
    const spec = heroSpecs[index];
    const hero = await createHero(players[index], {
      ...spec,
      heritageName: "Skilled Human",
    });
    heroes.push(hero);
    const join = await joinCampaign(players[index], campaignId, inviteCode, hero.id);
    assertEqual(join.campaign.role, "player", `${spec.name} join role`);
    assertEqual(join.character?.summary?.level, 1, `${spec.name} join level`);
    assert(join.character?.data?.classId, `${spec.name} lost its class on join`);
  }

  await check(campaignName, "campaign contains four joined level-1 characters", async () => {
    const table = await getTable(campaignId, gm.cookie);
    assertEqual(table.characters.length, 4, "Party size");
    for (const hero of heroes) {
      const summary = summaryFor(table, hero.id);
      assertEqual(summary.level, 1, `${hero.name} level`);
      assert(summary.hp > 0, `${hero.name} has no HP`);
      assert(summary.ac >= 10, `${hero.name} has no AC`);
      const local = localSummary(characterFor(table, hero.id));
      assertEqual(summary.hp, local.hp, `${hero.name} HP matches local rules`);
      assertEqual(summary.ac, local.ac, `${hero.name} AC matches local rules`);
    }
    assertEqual(table.characters.length, 4, "Table party size");
    metric("campaignA.partySize", 4);
  });

  // --- Table: tokens, ownership, hidden initiative --------------------------
  const gmSocket = await connectSocket(gm.cookie);
  const playerSocket = await connectSocket(players[0].cookie);
  await emitAck(gmSocket, "campaign:join", { campaignId });
  await emitAck(playerSocket, "campaign:join", { campaignId });
  const table0 = await getTable(campaignId, gm.cookie);
  const sceneId = table0.scenes[0].id as string;
  const tokens = new Map<string, Json>();
  for (const hero of heroes) {
    const token = await emitAck<Json>(gmSocket, "token:create", {
      campaignId,
      sceneId,
      token: {
        name: hero.name,
        characterId: hero.id,
        x: 100 + tokens.size * 96,
        y: 120,
        size: 1,
      },
    });
    tokens.set(hero.id, token);
  }

  await check(campaignName, "character tokens inherit sheet HP and AC", async () => {
    const table = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      const token = (table.tokens as Json[]).find((entry) => entry.id === tokens.get(hero.id)?.id);
      assert(token, `Token for ${hero.name} missing`);
      const summary = summaryFor(table, hero.id);
      assertEqual(token.hpMax, summary.hp, `${hero.name} token max HP`);
      assertEqual(token.hpCurrent, summary.currentHp, `${hero.name} token current HP`);
      assertEqual(token.ac, summary.ac, `${hero.name} token AC`);
    }
  });

  await check(
    campaignName,
    "a new token for a wounded character starts at the sheet's current HP",
    async () => {
      const sheet = await api(`/api/characters/${heroes[0].id}`, { cookie: players[0].cookie });
      const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      draft.play.hp = 7;
      await api(`/api/characters/${heroes[0].id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: draft, force: true },
      });
      const woundedToken = await emitAck<Json>(gmSocket, "token:create", {
        campaignId,
        sceneId,
        token: {
          name: "Wounded Bram",
          characterId: heroes[0].id,
          x: 200,
          y: 300,
          size: 1,
        },
      });
      try {
        assertEqual(woundedToken.hpCurrent, 7, "New token current HP");
        assertEqual(
          woundedToken.hpMax,
          summaryFor(await getTable(campaignId, gm.cookie), heroes[0].id).hp,
          "New token max HP"
        );
      } finally {
        const deleted = waitForEvent<Json>(
          gmSocket,
          "token:deleted",
          (payload) => payload.tokenId === woundedToken.id
        );
        gmSocket.emit("token:delete", { campaignId, tokenId: woundedToken.id });
        await deleted;
        const restore = JSON.parse(JSON.stringify(draft)) as Json;
        restore.play.hp = null;
        await api(`/api/characters/${heroes[0].id}`, {
          method: "PUT",
          cookie: players[0].cookie,
          body: { data: restore, force: true },
        });
      }
    }
  );

  await check(
    campaignName,
    "token damage absorbs temp HP and applies dying/unconscious at 0 HP",
    async () => {
      const sheet = await api(`/api/characters/${heroes[0].id}`, { cookie: players[0].cookie });
      const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      draft.play.hp = 10;
      draft.play.tempHp = 5;
      draft.play.conditions = [];
      await api(`/api/characters/${heroes[0].id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: draft, force: true },
      });
      const token = tokens.get(heroes[0].id)!;
      const first = waitForEvent<Json>(
        gmSocket,
        "token:updated",
        (payload) => payload.id === token.id && payload.hpCurrent === 7,
        4_000
      );
      gmSocket.emit("token:damage", { campaignId, tokenId: token.id, amount: 8 });
      await first;
      const afterFirst = await api(`/api/characters/${heroes[0].id}`, {
        cookie: players[0].cookie,
      });
      assertEqual(afterFirst.payload.character.data.play.tempHp, 0, "Temp HP after damage");
      assertEqual(afterFirst.payload.character.summary.currentHp, 7, "HP after temp HP damage");

      const second = waitForEvent<Json>(
        gmSocket,
        "token:updated",
        (payload) => payload.id === token.id && payload.hpCurrent === 0,
        4_000
      );
      gmSocket.emit("token:damage", { campaignId, tokenId: token.id, amount: 20 });
      await second;
      const afterSecond = await api(`/api/characters/${heroes[0].id}`, {
        cookie: players[0].cookie,
      });
      assertEqual(afterSecond.payload.character.summary.currentHp, 0, "HP at 0");
      assert(
        afterSecond.payload.character.data.play.conditions.some(
          (condition: Json) => condition.name === "Dying"
        ),
        "Damage did not apply Dying"
      );
      assert(
        afterSecond.payload.character.data.play.conditions.some(
          (condition: Json) => condition.name === "Unconscious"
        ),
        "Damage did not apply Unconscious"
      );

      const healed = waitForEvent<Json>(
        gmSocket,
        "token:updated",
        (payload) =>
          payload.id === token.id &&
          payload.hpCurrent === 5 &&
          !(payload.conditions as Json[]).some((condition) =>
            ["Dying", "Unconscious"].includes(condition.name)
          ),
        4_000
      );
      gmSocket.emit("token:update", {
        campaignId,
        token: { id: token.id, hpCurrent: 5 },
      });
      const healedToken = await healed;
      assert(
        !(healedToken.conditions as Json[]).some((condition) =>
          ["Dying", "Unconscious"].includes(condition.name)
        ),
        "Healing above 0 did not clear token life conditions"
      );
      const afterHeal = await api(`/api/characters/${heroes[0].id}`, {
        cookie: players[0].cookie,
      });
      assert(
        !(afterHeal.payload.character.data.play.conditions as Json[]).some((condition) =>
          ["Dying", "Unconscious"].includes(condition.name)
        ),
        "Healing above 0 did not clear sheet life conditions"
      );

      const restore = JSON.parse(JSON.stringify(afterSecond.payload.character.data)) as Json;
      restore.play.hp = null;
      restore.play.tempHp = 0;
      restore.play.conditions = [];
      await api(`/api/characters/${heroes[0].id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: restore, force: true },
      });
    }
  );

  // Removed with the manual-combat pivot: turn effects and movement limits are no longer automated.

  // Removed with the manual-combat pivot: turn effects and movement limits are no longer automated.

  // Removed with the manual-combat pivot: turn effects and movement limits are no longer automated.

  // Removed with the manual-combat pivot: turn effects and movement limits are no longer automated.

  await check(
    campaignName,
    "hidden scene props are filtered from the player table and live updates",
    async () => {
      const visible = {
        id: "prop_visible",
        name: "Visible Crate",
        imageUrl: "/uploads/sim-prop.webp",
        x: 100,
        y: 100,
        width: 64,
        height: 64,
        rotation: 0,
        layer: "ground",
        visible: true,
        locked: false,
        z: 1,
      };
      const hidden = {
        ...visible,
        id: "prop_hidden",
        name: "Secret Altar",
        visible: false,
        z: 2,
      };
      const playerEvent = waitForEvent<Json>(
        playerSocket,
        "scene:props",
        (payload) => payload.sceneId === sceneId,
        4_000
      );
      const gmEvent = waitForEvent<Json>(
        gmSocket,
        "scene:props",
        (payload) => payload.sceneId === sceneId,
        4_000
      );
      gmSocket.emit("scene:props", {
        campaignId,
        sceneId,
        props: [visible, hidden],
      });
      const [playerPayload, gmPayload] = await Promise.all([playerEvent, gmEvent]);
      assertEqual(playerPayload.props.length, 1, "Player visible prop count");
      assertEqual(playerPayload.props[0].name, "Visible Crate", "Player visible prop");
      assertEqual(gmPayload.props.length, 2, "GM prop count");
      const playerTable = await getTable(campaignId, players[0].cookie);
      assertEqual(
        (playerTable.scenes as Json[]).find((scene) => scene.id === sceneId)?.props.length,
        1,
        "Player snapshot prop count"
      );
      gmSocket.emit("scene:props", { campaignId, sceneId, props: [] });
    }
  );

  await check(
    campaignName,
    "hidden walls and templates are filtered from player snapshots and live updates",
    async () => {
      const visibleWall = {
        id: "wall_visible",
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        kind: "wall",
        hidden: false,
      };
      const hiddenWall = {
        id: "wall_hidden",
        x1: 0,
        y1: 40,
        x2: 100,
        y2: 40,
        kind: "wall",
        hidden: true,
      };
      const playerWallEvent = waitForEvent<Json>(
        playerSocket,
        "scene:walls",
        (payload) => payload.sceneId === sceneId,
        4_000
      );
      const gmWallEvent = waitForEvent<Json>(
        gmSocket,
        "scene:walls",
        (payload) => payload.sceneId === sceneId,
        4_000
      );
      gmSocket.emit("scene:walls", {
        campaignId,
        sceneId,
        walls: [visibleWall, hiddenWall],
      });
      const [playerWalls, gmWalls] = await Promise.all([playerWallEvent, gmWallEvent]);
      assertEqual(playerWalls.walls.length, 1, "Player visible wall count");
      assertEqual(playerWalls.walls[0].id, "wall_visible", "Player visible wall");
      assertEqual(gmWalls.walls.length, 2, "GM wall count");
      const playerWallsTable = await getTable(campaignId, players[0].cookie);
      assertEqual(
        (playerWallsTable.scenes as Json[]).find((scene) => scene.id === sceneId)?.walls.length,
        1,
        "Player snapshot wall count"
      );
      const gmWallsTable = await getTable(campaignId, gm.cookie);
      assertEqual(
        (gmWallsTable.scenes as Json[]).find((scene) => scene.id === sceneId)?.walls.length,
        2,
        "GM snapshot wall count"
      );

      const clearedTemplates = waitForEvent<Json>(
        gmSocket,
        "scene:templates",
        (payload) => payload.sceneId === sceneId && payload.templates.length === 0,
        4_000
      );
      gmSocket.emit("template:clear", { campaignId, sceneId });
      await clearedTemplates;

      const visibleTemplate = {
        kind: "burst",
        size: 20,
        x: 120,
        y: 120,
        direction: 0,
        hidden: false,
      };
      const hiddenTemplate = {
        kind: "cone",
        size: 15,
        x: 220,
        y: 120,
        direction: 0,
        hidden: true,
      };
      const playerTemplateEvent = waitForEvent<Json>(
        playerSocket,
        "scene:templates",
        (payload) => payload.sceneId === sceneId && payload.templates.length === 1,
        4_000
      );
      const gmTemplateEvent = waitForEvent<Json>(
        gmSocket,
        "scene:templates",
        (payload) => payload.sceneId === sceneId && payload.templates.length === 2,
        4_000
      );
      gmSocket.emit("template:add", { campaignId, sceneId, template: hiddenTemplate });
      gmSocket.emit("template:add", { campaignId, sceneId, template: visibleTemplate });
      const [playerTemplates, gmTemplates] = await Promise.all([
        playerTemplateEvent,
        gmTemplateEvent,
      ]);
      assertEqual(playerTemplates.templates.length, 1, "Player visible template count");
      assertEqual(playerTemplates.templates[0].hidden, false, "Player visible template");
      assertEqual(gmTemplates.templates.length, 2, "GM template count");
      const playerTemplatesTable = await getTable(campaignId, players[0].cookie);
      assertEqual(
        (playerTemplatesTable.scenes as Json[]).find((scene) => scene.id === sceneId)?.templates
          .length,
        1,
        "Player snapshot template count"
      );
      const gmTemplatesTable = await getTable(campaignId, gm.cookie);
      assertEqual(
        (gmTemplatesTable.scenes as Json[]).find((scene) => scene.id === sceneId)?.templates.length,
        2,
        "GM snapshot template count"
      );

      gmSocket.emit("scene:walls", { campaignId, sceneId, walls: [] });
      gmSocket.emit("template:clear", { campaignId, sceneId });
    }
  );

  await check(
    campaignName,
    "player can move an owned token but not another player's token",
    async () => {
      const owned = tokens.get(heroes[0].id)!;
      const other = tokens.get(heroes[1].id)!;
      const current = await getTable(campaignId, gm.cookie);
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries: [], round: current.round, turnIndex: 0 },
        "initiative:updated"
      );
      const moved = waitForEvent<Json>(
        gmSocket,
        "token:moved",
        (event) => event.tokenId === owned.id && event.x === 260,
        4_000
      );
      playerSocket.emit("token:move", { campaignId, sceneId, tokenId: owned.id, x: 260, y: 120 });
      await moved;
      const error = waitForEvent<Json>(
        playerSocket,
        "error:toast",
        (payload) => String(payload.message).includes("own"),
        4_000
      );
      playerSocket.emit("token:move", { campaignId, sceneId, tokenId: other.id, x: 300, y: 120 });
      await error;
    }
  );

  // Removed with the manual-combat pivot: turn effects and movement limits are no longer automated.

  await check(
    campaignName,
    "hiding a token removes it from the player's initiative view",
    async () => {
      const fighterToken = tokens.get(heroes[0].id)!;
      await emitAndWait(
        gmSocket,
        "initiative:roll",
        { campaignId, sceneId, tokenIds: [fighterToken.id] },
        "initiative:updated"
      );
      const playerBefore = await getTable(campaignId, players[0].cookie);
      assert(
        (playerBefore.initiative as Json[]).some((entry) => entry.tokenId === fighterToken.id),
        "Player could not see the visible token's initiative entry"
      );
      try {
        await emitAndWait(
          gmSocket,
          "token:update",
          { campaignId, token: { id: fighterToken.id, hidden: true } },
          "token:updated",
          (token) => token.id === fighterToken.id
        );
        const playerAfter = await getTable(campaignId, players[0].cookie);
        const leaked = (playerAfter.initiative as Json[]).some(
          (entry) => entry.tokenId === fighterToken.id
        );
        assert(!leaked, "Hidden token still appears in the player's initiative order");
      } finally {
        await emitAndWait(
          gmSocket,
          "token:update",
          { campaignId, token: { id: fighterToken.id, hidden: false } },
          "token:updated",
          (token) => token.id === fighterToken.id
        );
      }
    }
  );

  // --- Party advancement and journal ---------------------------------------
  await check(campaignName, "GM level-up advances the party and syncs tokens", async () => {
    const before = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      assertEqual(summaryFor(before, hero.id).level, 1, `${hero.name} pre-level check`);
    }
    const leveled = await api(`/api/campaigns/${campaignId}/level-up`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
    });
    assertEqual(leveled.payload.leveled, 4, "Party level-up count");
    assertEqual(leveled.payload.atMaxLevel, 0, "Party at max level unexpectedly");
    const after = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      const summary = summaryFor(after, hero.id);
      const previous = summaryFor(before, hero.id);
      assertEqual(summary.level, 2, `${hero.name} level after advancement`);
      assert(summary.hp > previous.hp, `${hero.name} HP did not increase`);
      assert(summary.ac >= previous.ac, `${hero.name} AC decreased`);
      const local = localSummary(characterFor(after, hero.id));
      assertEqual(summary.hp, local.hp, `${hero.name} server/local HP`);
      const token = (after.tokens as Json[]).find((entry) => entry.id === tokens.get(hero.id)?.id);
      assert(token, `${hero.name} token missing after level-up`);
      assertEqual(token.hpMax, summary.hp, `${hero.name} token max HP`);
      assertEqual(token.ac, summary.ac, `${hero.name} token AC`);
    }
  });

  await check(campaignName, "XP campaign advances to level 20 and enforces the cap", async () => {
    for (let level = 3; level <= 20; level++) {
      const leveled = await api(`/api/campaigns/${campaignId}/level-up`, {
        method: "POST",
        cookie: gm.cookie,
        body: {},
      });
      assertEqual(leveled.payload.leveled, 4, `Party level-up to ${level}`);
      assertEqual(leveled.payload.atMaxLevel, 0, `Unexpected max-level count at ${level}`);
    }
    const after = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      const summary = summaryFor(after, hero.id);
      assertEqual(summary.level, 20, `${hero.name} level at cap`);
      const token = (after.tokens as Json[]).find((entry) => entry.id === tokens.get(hero.id)?.id);
      assert(token, `${hero.name} token missing at level 20`);
      assertEqual(token.hpMax, summary.hp, `${hero.name} level-20 token max HP`);
      assertEqual(token.ac, summary.ac, `${hero.name} level-20 token AC`);
    }
    const capped = await api(`/api/campaigns/${campaignId}/level-up`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
    });
    assertEqual(capped.payload.leveled, 0, "Level 20 cap: no characters advanced");
    assertEqual(capped.payload.atMaxLevel, 4, "Level 20 cap: party counted");
  });

  await check(campaignName, "handouts and quest rewards respect player visibility", async () => {
    const shared = (
      await api(`/api/campaigns/${campaignId}/journal`, {
        method: "POST",
        cookie: gm.cookie,
        body: {
          title: "The Ashen Crown: Act II",
          content: "The crown was last seen beneath the drowned abbey.",
          visible: true,
          kind: "handout",
          questStatus: "completed",
          questXp: 40,
        },
      })
    ).payload.entry;
    await api(`/api/campaigns/${campaignId}/journal`, {
      method: "POST",
      cookie: gm.cookie,
      body: {
        title: "GM: The crown is a phylactery",
        content: "Do not reveal until Act III.",
        visible: false,
        kind: "handout",
      },
    });
    const playerJournal = await api(`/api/campaigns/${campaignId}/journal`, {
      cookie: players[0].cookie,
    });
    assert(
      (playerJournal.payload.entries as Json[]).some((entry) => entry.id === shared.id),
      "Shared handout missing for the player"
    );
    assert(
      !(playerJournal.payload.entries as Json[]).some((entry) =>
        entry.title.includes("phylactery")
      ),
      "GM-only handout leaked to the player"
    );
    const award = await api(`/api/campaigns/${campaignId}/journal/${shared.id}/award-quest-xp`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
    });
    assertEqual(award.payload.amount, 40, "Quest XP amount");
    assertEqual(award.payload.recipients, 4, "Quest XP recipients");
    const table = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      assertEqual(summaryFor(table, hero.id).xp, 40, `${hero.name} quest XP`);
    }
  });

  // --- Permissions, export/import ------------------------------------------
  await check(campaignName, "players cannot advance levels or export", async () => {
    for (const [method, pathname, body] of [
      ["POST", `/api/campaigns/${campaignId}/level-up`, {}],
      ["GET", `/api/campaigns/${campaignId}/export`, undefined],
    ] as const) {
      const result = await api(pathname, {
        method,
        cookie: players[0].cookie,
        ...(body ? { body } : {}),
        expect: null,
      });
      assertEqual(result.status, 403, `${method} ${pathname} player status`);
    }
  });

  await check(
    campaignName,
    "campaign export preserves characters, scenes, and journal",
    async () => {
      const exported = await api(`/api/campaigns/${campaignId}/export`, { cookie: gm.cookie });
      const payload = exported.payload;
      assertEqual(payload.format, "runehall-campaign", "Export format");
      assertEqual(payload.characters.length, 4, "Export character count");
      assert(
        (payload.characters as Json[]).every((character) => character.data.level === 20),
        "Export did not preserve level 20"
      );
      assert((payload.scenes as Json[]).length >= 1, "Export did not include scenes");
      assert((payload.journal as Json[]).length >= 2, "Export did not include journal entries");
      assertEqual(payload.state.activeSceneId, sceneId, "Export active scene");
      metric("campaignA.exportBytes", JSON.stringify(payload).length);

      const imported = await api("/api/campaigns/import", {
        method: "POST",
        cookie: gm.cookie,
        body: payload,
      });
      const importedCampaign = imported.payload.campaign;
      assert(importedCampaign.id !== campaignId, "Import reused the source campaign id");
      assertEqual(imported.payload.stats.characters, 4, "Imported character count");
      const importedTable = await getTable(importedCampaign.id, gm.cookie);
      assertEqual(importedTable.characters.length, 4, "Imported table party size");
      assert(
        (importedTable.characters as Json[]).every((character) => character.summary.level === 20),
        "Imported characters lost their level"
      );
      metric("campaignA.importedCampaignId", importedCampaign.id);
      await api(`/api/campaigns/${importedCampaign.id}`, {
        method: "DELETE",
        cookie: gm.cookie,
        body: { confirmName: importedCampaign.name },
      });
    }
  );

  await check(campaignName, "revisions reject concurrent character writes", async () => {
    const sheet = await api(`/api/characters/${heroes[0].id}`, { cookie: players[0].cookie });
    const character = sheet.payload.character;
    const first = await api(`/api/characters/${heroes[0].id}`, {
      method: "PUT",
      cookie: players[0].cookie,
      body: { data: character.data, expectedRevision: character.revision },
    });
    assertEqual(first.payload.character.revision, character.revision + 1, "Revision increment");
    const stale = await api(`/api/characters/${heroes[0].id}`, {
      method: "PUT",
      cookie: players[0].cookie,
      body: { data: character.data, expectedRevision: character.revision },
      expect: null,
    });
    assertEqual(stale.status, 409, "Stale save status");
  });

  gmSocket.close();
  playerSocket.close();
  metric("campaignA.id", campaignId);
  metric("campaignA.memberCount", 5);
}

async function runCampaignB(gm: Account, players: Account[]): Promise<void> {
  const campaignName = "B: The Quiet Ledger";
  const created = await api("/api/campaigns", {
    method: "POST",
    cookie: gm.cookie,
    body: {
      name: campaignName,
      description: "A milestone campaign with story advancement and replacement characters.",
      ruleset: "core",
      xpMode: "milestone",
    },
  });
  const campaign = created.payload.campaign;
  const campaignId = campaign.id as string;
  const inviteCode = campaign.inviteCode as string;
  assertEqual(campaign.xpMode, "milestone", "Milestone campaign XP mode");

  const heroes: CharacterRecord[] = [];
  for (let index = 0; index < 2; index++) {
    const spec =
      index === 0
        ? { className: "Fighter", backgroundName: "Warrior", name: "Captain Rook" }
        : { className: "Cleric", backgroundName: "Acolyte", name: "Sister Alma" };
    const hero = await createHero(players[index], {
      ...spec,
      heritageName: "Skilled Human",
    });
    heroes.push(hero);
    await joinCampaign(players[index], campaignId, inviteCode, hero.id);
  }

  await check(campaignName, "milestone level-ups need no XP and preserve zero XP", async () => {
    const table = await getTable(campaignId, gm.cookie);
    assertEqual(table.characters.length, 2, "Milestone party size");
    let currentLevel = 1;
    for (const targetLevel of [5, 10, 15, 20]) {
      while (currentLevel < targetLevel) {
        const result = await api(`/api/campaigns/${campaignId}/level-up`, {
          method: "POST",
          cookie: gm.cookie,
          body: {},
        });
        assertEqual(result.payload.leveled, 2, `Milestone level-up to ${currentLevel + 1}`);
        currentLevel += 1;
      }
      const after = await getTable(campaignId, gm.cookie);
      for (const hero of heroes) {
        assertEqual(summaryFor(after, hero.id).level, targetLevel, `${hero.name} story level`);
        assertEqual(summaryFor(after, hero.id).xp, 0, `${hero.name} milestone XP`);
      }
    }
  });

  await check(campaignName, "quest XP is gated in milestone mode", async () => {
    const quest = (
      await api(`/api/campaigns/${campaignId}/journal`, {
        method: "POST",
        cookie: gm.cookie,
        body: {
          title: "Find the ledger",
          content: "The ledger names every silent partner in Absalom.",
          visible: true,
          kind: "handout",
          questStatus: "completed",
          questXp: 200,
        },
      })
    ).payload.entry;
    const award = await api(`/api/campaigns/${campaignId}/journal/${quest.id}/award-quest-xp`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
      expect: null,
    });
    assertEqual(award.status, 400, "Milestone quest XP award status");
    const table = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      assertEqual(summaryFor(table, hero.id).xp, 0, `${hero.name} milestone quest XP`);
    }
  });

  await check(campaignName, "live campaign metadata reaches a connected player", async () => {
    const playerSocket = await connectSocket(players[0].cookie);
    await emitAck(playerSocket, "campaign:join", { campaignId });
    const update = waitForEvent<Json>(
      playerSocket,
      "campaign:updated",
      (payload) => payload.description === "The ledger is open.",
      5_000
    );
    await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      cookie: gm.cookie,
      body: { description: "The ledger is open." },
    });
    const payload = await update;
    assertEqual(payload.description, "The ledger is open.", "Live campaign description");
    assert(!payload.inviteCode, "Campaign summary leaked the invite code to the player");
    playerSocket.close();
  });

  metric("campaignB.id", campaignId);
  metric("campaignB.memberCount", 3);
}

async function main(): Promise<void> {
  console.log("Starting isolated Runehall server for campaign simulation.");
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
      COOKIE_SECURE: "0",
      REGISTRATION_MODE: "open",
      BOOTSTRAP_TOKEN: "campaign-sim-bootstrap-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
  child.on("exit", (code) => {
    report.serverExit = code ?? null;
  });

  try {
    await waitForServer(base);
    log("isolated server is healthy");

    const gm = await register("campaign_sim_gm", "Campaign Sim GM");
    const players = [
      await register("campaign_sim_p1", "Bram's Player"),
      await register("campaign_sim_p2", "Sela's Player"),
      await register("campaign_sim_p3", "Yara's Player"),
      await register("campaign_sim_p4", "Pip's Player"),
    ];
    log("registered one GM and four players");

    await runCampaignA(gm, players);
    await runCampaignB(gm, players);

    await check("cleanup", "campaigns delete cleanly", async () => {
      const campaigns = await api("/api/campaigns", { cookie: gm.cookie });
      for (const campaign of campaigns.payload.campaigns as Json[]) {
        await api(`/api/campaigns/${campaign.id}`, {
          method: "DELETE",
          cookie: gm.cookie,
          body: { confirmName: String(campaign.name ?? "") },
        });
      }
      const after = await api("/api/campaigns", { cookie: gm.cookie });
      assertEqual((after.payload.campaigns as Json[]).length, 0, "Campaigns after cleanup");
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    report.checks.push({
      campaign: currentCampaign,
      name: "simulation aborted",
      status: "fail",
      error: message,
    });
    console.error(`Simulation aborted: ${message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    child?.kill();
    await delay(250);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
    const failures = report.checks.filter((entry) => entry.status === "fail");
    const passes = report.checks.filter((entry) => entry.status === "pass");
    const observations = report.checks.filter((entry) => entry.status === "observation");
    console.log("");
    console.log(
      `Campaign simulation: ${passes.length} passed, ${failures.length} failed, ${observations.length} observations.`
    );
    if (failures.length) {
      for (const failure of failures) {
        console.log(`  FAIL ${failure.campaign} :: ${failure.name}: ${failure.error}`);
      }
    }
    if (observations.length) {
      for (const observation of observations) {
        console.log(`  GAP  ${observation.campaign} :: ${observation.name}: ${observation.detail}`);
      }
    }
    if (reportPath) {
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(`Report written to ${reportPath}`);
    }
    if (failures.length) process.exitCode = 1;
  }
}

void main();
