#!/usr/bin/env node
/**
 * Campaign-level simulation.
 *
 * Boots an isolated server, creates real accounts and campaigns, and plays two
 * complete 1-20 arcs through the HTTP and Socket.IO APIs:
 *
 *   A. "The Ashen Crown" - XP advancement, encounter budgets, treasure,
 *      long rests, downtime, sessions, handouts, calendar, export/import.
 *   B. "The Quiet Ledger" - milestone advancement, story level-ups, recaps,
 *      live campaign metadata, and a mid-campaign replacement character.
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
import { characterSummary, computeCharacter, startingWealthCp } from "../src/shared/rules";
import { currencyToCp } from "../src/shared/inventory";
import { longRestHealing } from "../src/shared/rest";
import { encounterBudget, encounterAwardXp } from "../src/shared/encounters";
import { normalizeAdvancementSpeed, xpPerLevel } from "../src/shared/xp";
import { TREASURE_CURRENCY_GP, treasureBudgetGp } from "../src/shared/treasure";
import { formatGolarionDate, shiftGolarionDate } from "../src/shared/calendar";
import { buildSimulatedHero, contextForDraft } from "./lib/simHeroes";
import type { CharacterDraft, CharacterRecord, Encounter } from "../src/shared/types";

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

function observe(campaign: string, name: string, detail: string): void {
  report.checks.push({ campaign, name, status: "observation", detail });
  log(`[gap] ${name}: ${detail}`);
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
    body: { username, displayName, password: "campaign-sim-password-123" },
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

/** Encounters that make up one level of play in the simulation. */
const LEVEL_ENCOUNTERS = [
  { label: "Trivial", count: 1, levelOffset: 0, xp: 40 },
  { label: "Low", count: 2, levelOffset: -1, xp: 60 },
  { label: "Moderate", count: 2, levelOffset: 0, xp: 80 },
  { label: "Severe", count: 3, levelOffset: 0, xp: 120 },
  { label: "Extreme", count: 4, levelOffset: 0, xp: 160 },
];

async function launchSimulatedEncounter(input: {
  campaignId: string;
  sceneId: string;
  gmCookie: string;
  partyLevel: number;
  partySize: number;
  template: (typeof LEVEL_ENCOUNTERS)[number];
  sequence: number;
}): Promise<{ encounter: Encounter; initiative: Json[]; tokens: Json[] }> {
  const { campaignId, sceneId, gmCookie, partyLevel, partySize, template, sequence } = input;
  const creatureLevel = Math.max(0, partyLevel + template.levelOffset);
  const encounterResult = await api(`/api/campaigns/${campaignId}/encounters`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: `Sim ${template.label} ${sequence}`,
      description: "Campaign simulation encounter.",
      sceneId,
    },
  });
  const encounter = encounterResult.payload.encounter as Encounter;
  await api(`/api/campaigns/${campaignId}/encounters/${encounter.id}/combatants`, {
    method: "POST",
    cookie: gmCookie,
    body: {
      name: `${template.label} Fixture`,
      level: creatureLevel,
      count: template.count,
      hp: 6 + creatureLevel * 6,
      ac: 14 + creatureLevel,
      perception: creatureLevel + 4,
      wave: 1,
    },
  });
  const expectedXp = encounterAwardXp(
    [{ level: creatureLevel, count: template.count } as any],
    partyLevel
  );
  assertEqual(expectedXp, template.xp, `${template.label} fixture XP`);
  const budget = encounterBudget(
    [{ level: creatureLevel, count: template.count } as any],
    partyLevel,
    partySize
  );
  assertEqual(
    budget.difficulty,
    template.label.toLowerCase() === "moderate"
      ? "moderate"
      : template.label.toLowerCase() === "low"
        ? "low"
        : template.label.toLowerCase(),
    `${template.label} encounter classification`
  );
  const launched = await api(`/api/campaigns/${campaignId}/encounters/${encounter.id}/launch`, {
    method: "POST",
    cookie: gmCookie,
    body: { sceneId, wave: 1, mode: "fresh" },
  });
  assertEqual(launched.payload.mode, "fresh", "Encounter launch mode");
  assert(Array.isArray(launched.payload.initiative), "Encounter launch returned no initiative");
  const launchedTokens = launched.payload.tokens as Json[];
  const groupedEntry =
    template.count === 1
      ? (launched.payload.initiative as Json[]).find((entry) =>
          launchedTokens.some((token) => token.id === entry.tokenId)
        )
      : (launched.payload.initiative as Json[]).find((entry) =>
          String(entry.name).includes(`×${template.count}`)
        );
  assert(
    groupedEntry,
    `No initiative entry for the launched ${template.label} creature(s) in ${launched.payload.initiative.length} entries`
  );
  return {
    encounter,
    initiative: launched.payload.initiative as Json[],
    tokens: launched.payload.tokens as Json[],
  };
}

async function awardXp(
  campaignId: string,
  gmCookie: string,
  amount: number,
  reason: string,
  characterIds: string[],
  extra: Json = {}
): Promise<Json> {
  return (
    await api(`/api/campaigns/${campaignId}/award-xp`, {
      method: "POST",
      cookie: gmCookie,
      body: { amount, characterIds, reason, ...extra },
    })
  ).payload;
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

  await check(campaignName, "settlement shop buys and sells with server-side prices", async () => {
    const updated = await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      cookie: gm.cookie,
      body: { settlementLevel: 5 },
    });
    assertEqual(updated.payload.campaign.settlementLevel, 5, "Campaign settlement level");
    const before = await getTable(campaignId, gm.cookie);
    const hero = characterFor(before, heroes[0].id);
    const beforeCp = currencyToCp(hero.data.currency);
    const daggerId = "item:rQWaJhI5Bko5x14Z";
    const bought = await api(`/api/campaigns/${campaignId}/shop/buy`, {
      method: "POST",
      cookie: players[0].cookie,
      body: {
        characterId: heroes[0].id,
        itemId: daggerId,
        quantity: 2,
        expectedRevision: hero.revision,
      },
    });
    const boughtCharacter = bought.payload.character;
    assertEqual(currencyToCp(boughtCharacter.data.currency), beforeCp - 40, "Buy price");
    assertEqual(
      boughtCharacter.data.equipment.find((entry: Json) => entry.itemId === daggerId)?.quantity,
      2,
      "Purchased quantity"
    );
    assertEqual(boughtCharacter.campaignSettlementLevel, 5, "Shop level on character");
    const sold = await api(`/api/campaigns/${campaignId}/shop/sell`, {
      method: "POST",
      cookie: players[0].cookie,
      body: {
        characterId: heroes[0].id,
        itemId: daggerId,
        quantity: 1,
        expectedRevision: boughtCharacter.revision,
      },
    });
    const soldCharacter = sold.payload.character;
    assertEqual(currencyToCp(soldCharacter.data.currency), beforeCp - 30, "Sale price");
    assertEqual(
      soldCharacter.data.equipment.find((entry: Json) => entry.itemId === daggerId)?.quantity,
      1,
      "Remaining quantity after sale"
    );
    const aboveLevel = await api(`/api/campaigns/${campaignId}/shop/buy`, {
      method: "POST",
      cookie: players[0].cookie,
      body: {
        characterId: heroes[0].id,
        itemId: "item:66yY2SClvqj0lMFX",
        quantity: 1,
      },
      expect: null,
    });
    assertEqual(aboveLevel.status, 400, "Above-level shop purchase");
    await api(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      cookie: gm.cookie,
      body: { settlementLevel: 1 },
    });
  });

  await check(campaignName, "Hero Points award, cap, reset, and permissions", async () => {
    const award = await api(`/api/campaigns/${campaignId}/award-hero-points`, {
      method: "POST",
      cookie: gm.cookie,
      body: { amount: 1, characterIds: [heroes[0].id] },
    });
    let hero = (award.payload.characters as Json[]).find((entry) => entry.id === heroes[0].id);
    assertEqual(hero?.data?.play?.heroPoints, 2, "Hero Point award");
    const capped = await api(`/api/campaigns/${campaignId}/award-hero-points`, {
      method: "POST",
      cookie: gm.cookie,
      body: { amount: 3, characterIds: [heroes[0].id] },
    });
    hero = (capped.payload.characters as Json[]).find((entry) => entry.id === heroes[0].id);
    assertEqual(hero?.data?.play?.heroPoints, 3, "Hero Point cap");
    assertEqual(capped.payload.capped, 1, "Hero Point capped count");
    const reset = await api(`/api/campaigns/${campaignId}/reset-hero-points`, {
      method: "POST",
      cookie: gm.cookie,
      body: { value: 1 },
    });
    for (const entry of reset.payload.characters as Json[]) {
      assertEqual(entry.data.play.heroPoints, 1, `${entry.name} session reset`);
    }
    const forbidden = await api(`/api/campaigns/${campaignId}/award-hero-points`, {
      method: "POST",
      cookie: players[0].cookie,
      body: { amount: 1, characterIds: [heroes[0].id] },
      expect: null,
    });
    assertEqual(forbidden.status, 403, "Player Hero Point award status");
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

  await check(
    campaignName,
    "initiative advance resolves persistent damage once and posts a roll",
    async () => {
      const hero = heroes[1];
      const sheet = await api(`/api/characters/${hero.id}`, { cookie: players[1].cookie });
      const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      draft.play.hp = 10;
      draft.play.tempHp = 0;
      draft.play.conditions = [];
      draft.play.persistentDamage = [
        { id: "sim-persistent-fire", formula: "1d2", type: "fire", dc: 15, notes: "" },
      ];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[1].cookie,
        body: { data: draft, force: true },
      });
      await emitAndWait(
        gmSocket,
        "initiative:roll",
        {
          campaignId,
          sceneId,
          tokenIds: [...tokens.values()].map((token) => token.id),
        },
        "initiative:updated"
      );
      const rolled = await getTable(campaignId, gm.cookie);
      const entries = rolled.initiative as Json[];
      const heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
      assert(heroIndex >= 0, "Persistent damage hero missing from initiative");
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round: rolled.round, turnIndex: heroIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );
      const damageRoll = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) =>
          payload.type === "roll" &&
          String((payload.data as Json)?.label ?? "").includes("Persistent fire damage"),
        5_000
      );
      const characterUpdate = waitForEvent<Json>(
        gmSocket,
        "character:updated",
        (payload) => payload.characterId === hero.id,
        5_000
      );
      const nextTurn = waitForEvent<Json>(gmSocket, "initiative:updated", () => true, 5_000);
      gmSocket.emit("initiative:next", { campaignId, direction: 1 });
      await Promise.all([damageRoll, characterUpdate, nextTurn]);
      const after = await api(`/api/characters/${hero.id}`, { cookie: players[1].cookie });
      const afterHp = after.payload.character.data.play.hp as number;
      assert(afterHp < 10 && afterHp >= 8, `Automated persistent damage produced HP ${afterHp}`);
      assert(
        [0, 1].includes(after.payload.character.data.play.persistentDamage.length),
        "Persistent damage state was neither kept nor cleared"
      );

      await emitAndWait(
        gmSocket,
        "initiative:next",
        { campaignId, direction: -1 },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );
      await emitAndWait(
        gmSocket,
        "initiative:next",
        { campaignId, direction: 1 },
        "initiative:updated"
      );
      const repeated = await api(`/api/characters/${hero.id}`, { cookie: players[1].cookie });
      assertEqual(
        repeated.payload.character.data.play.hp,
        afterHp,
        "Persistent damage repeated after stepping back"
      );
      const restore = JSON.parse(JSON.stringify(repeated.payload.character.data)) as Json;
      restore.play.hp = null;
      restore.play.tempHp = 0;
      restore.play.conditions = [];
      restore.play.persistentDamage = [];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[1].cookie,
        body: { data: restore, force: true },
      });
    }
  );

  await check(campaignName, "initiative start resolves a dying recovery check", async () => {
    const hero = heroes[2];
    const sheet = await api(`/api/characters/${hero.id}`, { cookie: players[2].cookie });
    const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
    draft.play.hp = 0;
    draft.play.tempHp = 0;
    draft.play.heroPoints = 0;
    draft.play.conditions = [{ name: "Dying", value: 1 }];
    await api(`/api/characters/${hero.id}`, {
      method: "PUT",
      cookie: players[2].cookie,
      body: { data: draft, force: true },
    });
    const table = await getTable(campaignId, gm.cookie);
    const entries = table.initiative as Json[];
    const heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
    assert(heroIndex >= 0, "Dying hero missing from initiative");
    const otherIndex = (heroIndex + 1) % entries.length;
    const nextRound = Number(table.round) + 1;
    await emitAndWait(
      gmSocket,
      "initiative:update",
      { campaignId, entries, round: nextRound, turnIndex: otherIndex },
      "initiative:updated",
      (payload) => payload.turnIndex === otherIndex
    );
    const recoveryRoll = waitForEvent<Json>(
      gmSocket,
      "chat:message",
      (payload) =>
        payload.type === "roll" &&
        String((payload.data as Json)?.label ?? "").includes("Dying recovery check"),
      5_000
    );
    await emitAndWait(
      gmSocket,
      "initiative:update",
      { campaignId, entries, round: nextRound, turnIndex: heroIndex },
      "initiative:updated",
      (payload) => payload.turnIndex === heroIndex
    );
    await recoveryRoll;
    const after = await api(`/api/characters/${hero.id}`, { cookie: players[2].cookie });
    assert(
      after.payload.character.revision > sheet.payload.character.revision,
      "Dying recovery did not update the character"
    );
    const restore = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
    restore.play.hp = null;
    restore.play.tempHp = 0;
    restore.play.conditions = [];
    await api(`/api/characters/${hero.id}`, {
      method: "PUT",
      cookie: players[2].cookie,
      body: { data: restore, force: true },
    });
  });

  await check(campaignName, "Heroic Recovery spends all points and avoids wounded", async () => {
    const hero = heroes[3];
    const sheet = await api(`/api/characters/${hero.id}`, { cookie: players[3].cookie });
    const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
    draft.play.hp = 0;
    draft.play.tempHp = 0;
    draft.play.heroPoints = 2;
    draft.play.conditions = [
      { name: "Dying", value: 1 },
      { name: "Wounded", value: 1 },
    ];
    await api(`/api/characters/${hero.id}`, {
      method: "PUT",
      cookie: players[3].cookie,
      body: { data: draft, force: true },
    });
    const forbidden = await api(`/api/characters/${hero.id}/heroic-recovery`, {
      method: "POST",
      cookie: players[0].cookie,
      expect: null,
    });
    assertEqual(forbidden.status, 403, "Foreign Heroic Recovery status");
    const recovery = await api(`/api/characters/${hero.id}/heroic-recovery`, {
      method: "POST",
      cookie: players[3].cookie,
    });
    const recovered = recovery.payload.character.data.play;
    assertEqual(recovered.heroPoints, 0, "Heroic Recovery Hero Points");
    assertEqual(recovered.hp, 0, "Heroic Recovery HP");
    assert(
      !recovered.conditions.some((condition: Json) => condition.name === "Dying"),
      "Heroic Recovery left dying"
    );
    assert(
      recovered.conditions.some((condition: Json) => condition.name === "Unconscious"),
      "Heroic Recovery did not leave unconscious"
    );
    assertEqual(
      recovered.conditions.find((condition: Json) => condition.name === "Wounded")?.value,
      1,
      "Heroic Recovery changed wounded"
    );
    const restore = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
    restore.play.hp = null;
    restore.play.tempHp = 0;
    restore.play.heroPoints = 1;
    restore.play.conditions = [];
    await api(`/api/characters/${hero.id}`, {
      method: "PUT",
      cookie: players[3].cookie,
      body: { data: restore, force: true },
    });
  });

  await check(
    campaignName,
    "linked fast healing and regeneration resolve at turn start",
    async () => {
      const hero = heroes[0];
      const sheet = await api(`/api/characters/${hero.id}`, { cookie: players[0].cookie });
      const maxHp = Number(sheet.payload.character.summary.hp);
      const startHp = Math.max(0, maxHp - 10);
      const healTarget = Math.min(maxHp, startHp + 10);
      const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      draft.play.hp = startHp;
      draft.play.tempHp = 0;
      draft.play.heroPoints = 0;
      draft.play.conditions = [];
      draft.play.persistentDamage = [];
      draft.play.fastHealing = 4;
      draft.play.fastHealingActive = true;
      draft.play.regeneration = 6;
      draft.play.regenerationActive = true;
      draft.play.regenerationDeactivatedBy = ["fire", "acid"];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: draft, force: true },
      });

      let table = await getTable(campaignId, gm.cookie);
      let entries = table.initiative as Json[];
      let heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
      assert(heroIndex >= 0, "Fast healing hero missing from initiative");
      let otherIndex = (heroIndex + 1) % entries.length;
      let round = Number(table.round) + 1;
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: otherIndex },
        "initiative:updated"
      );
      const healedUpdate = waitForEvent<Json>(
        gmSocket,
        "character:updated",
        (payload) => payload.characterId === hero.id,
        5_000
      );
      const healedNote = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) =>
          payload.type === "chat" &&
          String(payload.content).includes("from fast healing or regeneration"),
        5_000
      );
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: heroIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );
      await Promise.all([healedUpdate, healedNote]);
      const healed = await api(`/api/characters/${hero.id}`, { cookie: players[0].cookie });
      assertEqual(healed.payload.character.data.play.hp, healTarget, "Linked fast healing HP");
      const healedToken = ((await getTable(campaignId, gm.cookie)).tokens as Json[]).find(
        (token) => token.characterId === hero.id
      );
      assertEqual(healedToken?.hpCurrent, healTarget, "Linked fast healing token mirror");
      assertEqual(healedToken?.turnEffects?.regeneration, 6, "Linked turn effects token mirror");

      const suppressedDraft = JSON.parse(JSON.stringify(healed.payload.character.data)) as Json;
      const suppressedStart = Math.max(0, maxHp - 4);
      const suppressedTarget = Math.min(maxHp, suppressedStart + 4);
      suppressedDraft.play.hp = suppressedStart;
      suppressedDraft.play.conditions = [{ name: "Regeneration Suppressed", value: null }];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: suppressedDraft, force: true },
      });
      table = await getTable(campaignId, gm.cookie);
      entries = table.initiative as Json[];
      heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
      otherIndex = (heroIndex + 1) % entries.length;
      round = Number(table.round) + 1;
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: otherIndex },
        "initiative:updated"
      );
      const suppressedUpdate = waitForEvent<Json>(
        gmSocket,
        "character:updated",
        (payload) => payload.characterId === hero.id,
        5_000
      );
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: heroIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );
      await suppressedUpdate;
      const suppressed = await api(`/api/characters/${hero.id}`, {
        cookie: players[0].cookie,
      });
      assertEqual(
        suppressed.payload.character.data.play.hp,
        suppressedTarget,
        "Suppressed regeneration HP"
      );
      assert(
        !suppressed.payload.character.data.play.conditions.some(
          (condition: Json) => condition.name === "Regeneration Suppressed"
        ),
        "Regeneration suppression was not cleared after its turn"
      );

      const restore = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      restore.play.hp = null;
      restore.play.tempHp = 0;
      restore.play.heroPoints = 1;
      restore.play.conditions = [];
      restore.play.persistentDamage = [];
      restore.play.fastHealing = 0;
      restore.play.fastHealingActive = true;
      restore.play.fastHealingNote = "";
      restore.play.regeneration = 0;
      restore.play.regenerationActive = true;
      restore.play.regenerationNote = "";
      restore.play.regenerationDeactivatedBy = [];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[0].cookie,
        body: { data: restore, force: true },
      });
    }
  );

  await check(
    campaignName,
    "affliction onset and interval timers tick at the end of the turn",
    async () => {
      const hero = heroes[1];
      const sheet = await api(`/api/characters/${hero.id}`, { cookie: players[1].cookie });
      const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      draft.play.hp = 20;
      draft.play.tempHp = 0;
      draft.play.conditions = [];
      draft.play.persistentDamage = [];
      draft.play.afflictions = [
        {
          id: "sim-affliction-venom",
          name: "Sim Venom",
          type: "poison",
          dc: 1,
          save: "fortitude",
          stage: 5,
          stageMax: 10,
          interval: "1 round",
          duration: "",
          onset: "1 round",
          onsetRemaining: 1,
          intervalRemaining: null,
          virulent: false,
          virulentSuccesses: 0,
          virulentCrit: "reduce",
          savesCanEnd: true,
          notes: "Stage 1: clumsy 1.",
        },
      ];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[1].cookie,
        body: { data: draft, force: true },
      });

      let table = await getTable(campaignId, gm.cookie);
      let entries = table.initiative as Json[];
      let heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
      assert(heroIndex >= 0, "Afflicted hero missing from initiative");
      let otherIndex = (heroIndex + 1) % entries.length;
      let round = Number(table.round) + 1;
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: heroIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );

      const onsetNote = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) => payload.type === "chat" && String(payload.content).includes("onset ends"),
        5_000
      );
      const onsetUpdate = waitForEvent<Json>(
        gmSocket,
        "character:updated",
        (payload) => payload.characterId === hero.id,
        5_000
      );
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: otherIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === otherIndex
      );
      await Promise.all([onsetNote, onsetUpdate]);
      const afterOnset = await api(`/api/characters/${hero.id}`, {
        cookie: players[1].cookie,
      });
      const onsetAffliction = afterOnset.payload.character.data.play.afflictions[0];
      assertEqual(onsetAffliction?.onsetRemaining, 0, "Affliction onset countdown");
      assertEqual(onsetAffliction?.intervalRemaining, 1, "Affliction interval start");
      assertEqual(onsetAffliction?.stage, 5, "Affliction stage after onset");

      table = await getTable(campaignId, gm.cookie);
      entries = table.initiative as Json[];
      heroIndex = entries.findIndex((entry) => entry.tokenId === tokens.get(hero.id)?.id);
      otherIndex = (heroIndex + 1) % entries.length;
      round = Number(table.round) + 1;
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: heroIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === heroIndex
      );
      const stageRoll = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) =>
          payload.type === "roll" &&
          String((payload.data as Json)?.label ?? "").includes("Sim Venom stage save"),
        5_000
      );
      const stageUpdate = waitForEvent<Json>(
        gmSocket,
        "character:updated",
        (payload) => payload.characterId === hero.id,
        5_000
      );
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round, turnIndex: otherIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === otherIndex
      );
      await Promise.all([stageRoll, stageUpdate]);
      const afterSave = await api(`/api/characters/${hero.id}`, {
        cookie: players[1].cookie,
      });
      const savedAffliction = afterSave.payload.character.data.play.afflictions[0];
      assert(savedAffliction, "Affliction ended after the interval save");
      assert(
        savedAffliction.stage !== 5 && savedAffliction.stage >= 3 && savedAffliction.stage <= 7,
        `Affliction stage after interval save was ${savedAffliction.stage}`
      );
      assertEqual(savedAffliction.intervalRemaining, 1, "Affliction interval reset");

      const restore = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
      restore.play.hp = null;
      restore.play.tempHp = 0;
      restore.play.conditions = [];
      restore.play.persistentDamage = [];
      restore.play.afflictions = [];
      await api(`/api/characters/${hero.id}`, {
        method: "PUT",
        cookie: players[1].cookie,
        body: { data: restore, force: true },
      });
    }
  );

  await check(
    campaignName,
    "unlinked token turn effects heal, damage, and resolve once",
    async () => {
      const created = await emitAck<Json>(gmSocket, "token:create", {
        campaignId,
        sceneId,
        token: {
          name: "Regenerating Test Monster",
          x: 500,
          y: 300,
          size: 1,
          hpCurrent: 10,
          hpMax: 20,
          ac: 15,
          turnEffects: {
            fastHealing: 5,
            persistentDamage: [
              { id: "token-pd-fire", formula: "1d2", type: "fire", dc: 15, notes: "" },
            ],
          },
        },
      });
      assertEqual(created.turnEffects?.fastHealing, 5, "Token turn effects were not saved");
      await emitAndWait(
        gmSocket,
        "initiative:roll",
        {
          campaignId,
          sceneId,
          tokenIds: [...tokens.values()].map((token) => token.id).concat(created.id),
        },
        "initiative:updated"
      );
      await emitAndWait(
        gmSocket,
        "token:update",
        { campaignId, token: { id: created.id, hpCurrent: 10 } },
        "token:updated",
        (payload) => payload.id === created.id && payload.hpCurrent === 10
      );
      const table = await getTable(campaignId, gm.cookie);
      const entries = table.initiative as Json[];
      const tokenIndex = entries.findIndex((entry) => entry.tokenId === created.id);
      assert(tokenIndex >= 0, "Test monster missing from initiative");
      const otherIndex = (tokenIndex + 1) % entries.length;
      const nextRound = Number(table.round) + 1;
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round: nextRound, turnIndex: otherIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === otherIndex
      );
      const healNote = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) =>
          payload.type === "chat" && String(payload.content ?? "").includes("heals 5 HP"),
        5_000
      );
      const healedToken = waitForEvent<Json>(
        gmSocket,
        "token:updated",
        (payload) => payload.id === created.id && payload.hpCurrent === 15,
        5_000
      );
      await emitAndWait(
        gmSocket,
        "initiative:update",
        { campaignId, entries, round: nextRound, turnIndex: tokenIndex },
        "initiative:updated",
        (payload) => payload.turnIndex === tokenIndex
      );
      await Promise.all([healNote, healedToken]);

      const damageRoll = waitForEvent<Json>(
        gmSocket,
        "chat:message",
        (payload) =>
          payload.type === "roll" &&
          String((payload.data as Json)?.label ?? "").includes("Persistent fire damage"),
        5_000
      );
      const damagedToken = waitForEvent<Json>(
        gmSocket,
        "token:updated",
        (payload) =>
          payload.id === created.id &&
          typeof payload.hpCurrent === "number" &&
          payload.hpCurrent < 15,
        5_000
      );
      gmSocket.emit("initiative:next", { campaignId, direction: 1 });
      await Promise.all([damageRoll, damagedToken]);
      const afterTable = await getTable(campaignId, gm.cookie);
      const afterToken = (afterTable.tokens as Json[]).find((token) => token.id === created.id);
      assert(afterToken, "Test monster disappeared");
      const afterHp = afterToken.hpCurrent as number;
      assert(afterHp >= 13 && afterHp <= 14, `Persistent damage produced HP ${afterHp}`);

      await emitAndWait(
        gmSocket,
        "initiative:next",
        { campaignId, direction: -1 },
        "initiative:updated",
        (payload) => payload.turnIndex === tokenIndex
      );
      await emitAndWait(
        gmSocket,
        "initiative:next",
        { campaignId, direction: 1 },
        "initiative:updated"
      );
      const repeatedTable = await getTable(campaignId, gm.cookie);
      const repeatedToken = (repeatedTable.tokens as Json[]).find(
        (token) => token.id === created.id
      );
      assertEqual(repeatedToken?.hpCurrent, afterHp, "Token persistent damage repeated");

      const deleted = waitForEvent<Json>(
        gmSocket,
        "token:deleted",
        (payload) => payload.tokenId === created.id,
        5_000
      );
      gmSocket.emit("token:delete", { campaignId, tokenId: created.id });
      await deleted;
    }
  );

  await check(
    campaignName,
    "encounter launch seeds regeneration from the monster statblock",
    async () => {
      const encounter = (
        await api(`/api/campaigns/${campaignId}/encounters`, {
          method: "POST",
          cookie: gm.cookie,
          body: { name: "Trollhound Seed Test", description: "", sceneId },
        })
      ).payload.encounter as Json;
      await api(`/api/campaigns/${campaignId}/encounters/${encounter.id}/combatants`, {
        method: "POST",
        cookie: gm.cookie,
        body: { monsterId: "mon:gTkvu3RRiDHNONzf", count: 1, wave: 1 },
      });
      const launched = await api(`/api/campaigns/${campaignId}/encounters/${encounter.id}/launch`, {
        method: "POST",
        cookie: gm.cookie,
        body: { sceneId, wave: 1, mode: "fresh" },
      });
      const token = (launched.payload.tokens as Json[]).find((entry) =>
        String(entry.name).includes("Trollhound")
      );
      assert(token, "Trollhound token missing after launch");
      assertEqual(token.turnEffects?.regeneration, 15, "Seeded regeneration");
      assert(
        (token.turnEffects?.regenerationDeactivatedBy as string[]).includes("electricity"),
        "Seeded regeneration deactivation types"
      );
      await api(`/api/campaigns/${campaignId}/encounters/${encounter.id}/clear`, {
        method: "POST",
        cookie: gm.cookie,
      });
    }
  );

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
    "player can move an owned token but not another player's token",
    async () => {
      const owned = tokens.get(heroes[0].id)!;
      const other = tokens.get(heroes[1].id)!;
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

  // --- 1-20 progression -----------------------------------------------------
  let previousSummaries = new Map<string, Json>();
  let parcelCount = 0;
  for (let level = 1; level <= 20; level++) {
    const isActLevel = level === 1 || level % 5 === 0;
    const campaignLabel = `${campaignName} L${level}`;
    let earned = 0;
    if (isActLevel) {
      const table = await getTable(campaignId, gm.cookie);
      const partySize = (table.characters as Json[]).length;
      let sequence = 0;
      for (const template of LEVEL_ENCOUNTERS) {
        const launched = await launchSimulatedEncounter({
          campaignId,
          sceneId,
          gmCookie: gm.cookie,
          partyLevel: level,
          partySize,
          template,
          sequence: sequence++,
        });
        earned += template.xp;
        await awardXp(
          campaignId,
          gm.cookie,
          template.xp,
          `${template.label} encounter at level ${level}`,
          heroes.map((hero) => hero.id)
        );
        if (template.label === "Moderate") {
          const activeToken = launched.tokens[0];
          const activeIndex = launched.initiative.findIndex(
            (entry) => entry.tokenId === activeToken?.id
          );
          if (activeToken && activeIndex >= 0) {
            await emitAndWait(
              gmSocket,
              "token:update",
              {
                campaignId,
                token: {
                  id: activeToken.id,
                  conditions: [{ name: "Frightened", value: 1, duration: 1 }],
                },
              },
              "token:updated",
              (token) => token.id === activeToken.id
            );
            await emitAndWait(
              gmSocket,
              "initiative:update",
              {
                campaignId,
                entries: launched.initiative,
                round: 1,
                turnIndex: activeIndex,
              },
              "initiative:updated",
              (payload) => payload.turnIndex === activeIndex
            );
            await emitAndWait(
              gmSocket,
              "initiative:next",
              { campaignId, direction: 1 },
              "initiative:updated"
            );
            const afterTick = await getTable(campaignId, gm.cookie);
            const tokenAfter = (afterTick.tokens as Json[]).find(
              (entry) => entry.id === activeToken.id
            );
            assert(
              tokenAfter && Array.isArray(tokenAfter.conditions),
              "Token conditions disappeared after initiative advance"
            );
            assert(
              !(tokenAfter.conditions as Json[]).some((entry) => entry.name === "Frightened"),
              "Frightened 1 (1 round) did not expire when its turn ended"
            );
          }
        }
        await api(`/api/campaigns/${campaignId}/encounters/${launched.encounter.id}/clear`, {
          method: "POST",
          cookie: gm.cookie,
        });
        const cleaned = await getTable(campaignId, gm.cookie);
        assert(
          !(cleaned.tokens as Json[]).some((token) =>
            launched.tokens.some((created) => created.id === token.id)
          ),
          "Encounter cleanup left launched tokens behind"
        );
      }
      const remaining = levelXp - earned;
      await awardXp(
        campaignId,
        gm.cookie,
        remaining,
        `Exploration and accomplishments at level ${level}`,
        heroes.map((hero) => hero.id)
      );
      earned += remaining;
    } else {
      await awardXp(
        campaignId,
        gm.cookie,
        levelXp,
        `Simulated adventures at level ${level}`,
        heroes.map((hero) => hero.id)
      );
      earned = levelXp;
    }

    await check(campaignLabel, "XP accumulates without automatic leveling", async () => {
      const table = await getTable(campaignId, gm.cookie);
      for (const hero of heroes) {
        const summary = summaryFor(table, hero.id);
        assertEqual(summary.level, level, `${hero.name} level before GM advancement`);
        assertEqual(summary.xp, earned, `${hero.name} XP before GM advancement`);
      }
    });

    if (level >= 20) break;

    await check(
      campaignLabel,
      "GM level-up advances the whole party and syncs tokens",
      async () => {
        const before = await getTable(campaignId, gm.cookie);
        for (const hero of heroes) {
          const summary = summaryFor(before, hero.id);
          previousSummaries.set(hero.id, summary);
          assertEqual(summary.level, level, `${hero.name} pre-level check`);
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
          const previous = previousSummaries.get(hero.id)!;
          assertEqual(summary.level, level + 1, `${hero.name} level after advancement`);
          assertEqual(summary.xp, 0, `${hero.name} XP after advancement`);
          assert(
            summary.hp > previous.hp,
            `${hero.name} HP did not increase at level ${level + 1}`
          );
          assert(summary.ac >= previous.ac, `${hero.name} AC decreased at level ${level + 1}`);
          const local = localSummary(characterFor(after, hero.id));
          assertEqual(summary.hp, local.hp, `${hero.name} server/local HP at level ${level + 1}`);
          const token = (after.tokens as Json[]).find(
            (entry) => entry.id === tokens.get(hero.id)?.id
          );
          assert(token, `${hero.name} token missing after level-up`);
          assertEqual(token.hpMax, summary.hp, `${hero.name} token max HP after level-up`);
          assertEqual(token.ac, summary.ac, `${hero.name} token AC after level-up`);
        }
      }
    );

    if (isActLevel) {
      await check(
        campaignLabel,
        "long rest restores the party after an adventuring day",
        async () => {
          const table = await getTable(campaignId, gm.cookie);
          const fighter = characterFor(table, heroes[0].id);
          const draft = JSON.parse(JSON.stringify(fighter.data)) as Json;
          draft.play.hp = 1;
          draft.play.tempHp = 6;
          draft.play.conditions = [
            { name: "Fatigued", value: null, duration: null },
            { name: "Drained", value: 2, duration: null },
          ];
          await api(`/api/characters/${heroes[0].id}`, {
            method: "PUT",
            cookie: players[0].cookie,
            body: { data: draft, force: true },
          });
          const rested = await api(`/api/campaigns/${campaignId}/long-rest`, {
            method: "POST",
            cookie: gm.cookie,
          });
          assertEqual(rested.payload.rested, 4, "Party long-rest count");
          const restedFighter = (rested.payload.characters as Json[]).find(
            (entry) => entry.id === heroes[0].id
          );
          assert(restedFighter, "Long rest did not return the fighter");
          const restedDerived = computeCharacter(
            restedFighter.data as CharacterDraft,
            contextForDraft(restedFighter.data)
          );
          const expectedHp = Math.min(
            restedFighter.summary.hp,
            1 + longRestHealing(restedFighter.data as CharacterDraft, restedDerived)
          );
          assertEqual(
            restedFighter.summary.currentHp,
            expectedHp,
            "Long rest natural healing (CON mod × level)"
          );
          assertEqual(restedFighter.data.play.tempHp, 0, "Long rest temp HP");
          assert(
            !restedFighter.data.play.conditions.some((entry: Json) => entry.name === "Fatigued"),
            "Long rest left fatigued"
          );
          assertEqual(
            restedFighter.data.play.conditions.find((entry: Json) => entry.name === "Drained")
              ?.value,
            1,
            "Long rest drained reduction"
          );
          const restedWizard = (rested.payload.characters as Json[]).find(
            (entry) => entry.id === heroes[1].id
          );
          const restedCleric = (rested.payload.characters as Json[]).find(
            (entry) => entry.id === heroes[2].id
          );
          const restedRogue = (rested.payload.characters as Json[]).find(
            (entry) => entry.id === heroes[3].id
          );
          assertEqual(
            restedFighter.data.spells.preparationsPending,
            false,
            "Non-caster daily preparations"
          );
          assertEqual(
            restedWizard?.data.spells.preparationsPending,
            true,
            "Wizard daily preparations"
          );
          assertEqual(
            restedCleric?.data.spells.preparationsPending,
            true,
            "Cleric daily preparations"
          );
          assertEqual(
            restedRogue?.data.spells.preparationsPending,
            false,
            "Rogue daily preparations"
          );
        }
      );

      await check(campaignLabel, "treasure parcel distribution reaches the sheet", async () => {
        const target = heroes[Math.floor(level / 5) % heroes.length];
        const currency = TREASURE_CURRENCY_GP[level - 1];
        const parcel = (
          await api(`/api/campaigns/${campaignId}/loot`, {
            method: "POST",
            cookie: gm.cookie,
            body: {
              name: `Level ${level} treasure`,
              description: "Simulated level budget (currency portion).",
            },
          })
        ).payload.parcel;
        await api(`/api/campaigns/${campaignId}/loot/${parcel.id}`, {
          method: "PATCH",
          cookie: gm.cookie,
          body: { gp: currency, sp: 0, cp: 0 },
        });
        const before = await api(`/api/characters/${target.id}`, { cookie: gm.cookie });
        const beforeGp = before.payload.character.data.currency.gp as number;
        await api(`/api/campaigns/${campaignId}/loot/${parcel.id}/distribute`, {
          method: "POST",
          cookie: gm.cookie,
          body: { characterId: target.id },
        });
        const after = await api(`/api/characters/${target.id}`, { cookie: gm.cookie });
        assertEqual(
          after.payload.character.data.currency.gp,
          beforeGp + currency,
          `${target.name} purse after level ${level} treasure`
        );
        parcelCount += 1;
      });
    }

    if (level === 5) {
      await check(
        campaignLabel,
        "downtime days are granted by the GM and spent by the player",
        async () => {
          const grant = await api(`/api/campaigns/${campaignId}/downtime`, {
            method: "POST",
            cookie: gm.cookie,
            body: { days: 14, characterIds: heroes.map((hero) => hero.id) },
          });
          assertEqual(grant.payload.recipients, 4, "Downtime recipients");
          const sheet = await api(`/api/characters/${heroes[0].id}`, {
            cookie: players[0].cookie,
          });
          const draft = JSON.parse(JSON.stringify(sheet.payload.character.data)) as Json;
          draft.play.downtimeDays = 7;
          await api(`/api/characters/${heroes[0].id}`, {
            method: "PUT",
            cookie: players[0].cookie,
            body: { data: draft, force: true },
          });
          const table = await getTable(campaignId, gm.cookie);
          assertEqual(
            summaryFor(table, heroes[0].id).downtimeDays,
            7,
            "Downtime summary after spending"
          );
        }
      );

      await check(
        campaignLabel,
        "calendar handles month, year, and leap-day boundaries",
        async () => {
          await api(`/api/campaigns/${campaignId}/calendar`, {
            method: "PUT",
            cookie: gm.cookie,
            body: { year: 4726, month: 1, day: 1 },
          });
          const monthEnd = await api(`/api/campaigns/${campaignId}/calendar/advance`, {
            method: "POST",
            cookie: gm.cookie,
            body: { days: 30 },
          });
          assertEqual(monthEnd.payload.worldDate.month, 1, "Calendar month boundary");
          assertEqual(monthEnd.payload.worldDate.day, 31, "Calendar day boundary");
          const leap = shiftGolarionDate({ year: 4728, month: 2, day: 28 }, 1);
          assertEqual(leap.day, 29, "Calendar leap day");
          assertEqual(formatGolarionDate(leap), "29 Calistril, 4728 AR", "Calendar leap label");
        }
      );
    }

    if (level === 10) {
      await check(campaignLabel, "sessions, attendance, check-ins, and recap work", async () => {
        const scheduledAt = Date.now() + 86_400_000;
        const session = (
          await api(`/api/campaigns/${campaignId}/sessions`, {
            method: "POST",
            cookie: gm.cookie,
            body: {
              title: "The Ashen Crown, Act II",
              scheduledAt,
              durationMinutes: 180,
              status: "played",
              notes: "GM-only: the crown is a phylactery.",
            },
          })
        ).payload.session;
        for (const player of players) {
          await api(`/api/campaigns/${campaignId}/sessions/${session.id}/attendance/${player.id}`, {
            method: "PUT",
            cookie: gm.cookie,
            body: { status: "attended" },
          });
          await api(`/api/campaigns/${campaignId}/sessions/${session.id}/checkin`, {
            method: "PUT",
            cookie: player.cookie,
            body: { status: "yes" },
          });
        }
        const playerView = await api(`/api/campaigns/${campaignId}/sessions`, {
          cookie: players[0].cookie,
        });
        const playerSession = (playerView.payload.sessions as Json[]).find(
          (entry) => entry.id === session.id
        );
        assert(playerSession, "Player could not see the session");
        assertEqual(playerSession.notes, "", "Player session notes were not redacted");
        assertEqual(playerSession.agenda.length, 0, "Player received GM agenda");
        assertEqual(playerSession.attendance[0].status, "attended", "Player attendance");
        const recap = await api(
          `/api/campaigns/${campaignId}/recap?from=${Date.now() - 7 * 86_400_000}&to=${Date.now() + 86_400_000}`,
          { cookie: gm.cookie }
        );
        assert(
          String(recap.payload.recap?.draft).includes("The Ashen Crown, Act II"),
          "Recap did not include the played session"
        );
        assertEqual(recap.payload.recap?.sessionTitle, "The Ashen Crown, Act II", "Recap title");
      });

      await check(campaignLabel, "handouts and quests respect player visibility", async () => {
        const shared = (
          await api(`/api/campaigns/${campaignId}/journal`, {
            method: "POST",
            cookie: gm.cookie,
            body: {
              title: "The Ashen Crown: Act II",
              content: "The crown was last seen beneath the drowned abbey.",
              visible: true,
              kind: "handout",
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
      });
    }
  }

  // --- Level-20 cap ---------------------------------------------------------
  await check(campaignName, "level 20 is the cap and excess XP is preserved", async () => {
    const before = await getTable(campaignId, gm.cookie);
    const xpBefore = new Map<string, number>();
    for (const hero of heroes) {
      assertEqual(summaryFor(before, hero.id).level, 20, `${hero.name} final level`);
      xpBefore.set(hero.id, summaryFor(before, hero.id).xp);
    }
    await awardXp(
      campaignId,
      gm.cookie,
      500,
      "Post-cap accomplishment",
      heroes.map((h) => h.id)
    );
    const capped = await api(`/api/campaigns/${campaignId}/level-up`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
    });
    assertEqual(capped.payload.atMaxLevel, 4, "Max-level party detection");
    assertEqual(capped.payload.leveled, 0, "Party leveled past 20");
    const after = await getTable(campaignId, gm.cookie);
    for (const hero of heroes) {
      assertEqual(summaryFor(after, hero.id).level, 20, `${hero.name} remained at level 20`);
      assertEqual(
        summaryFor(after, hero.id).xp,
        (xpBefore.get(hero.id) ?? 0) + 500,
        `${hero.name} excess XP preserved`
      );
    }
  });

  // --- Permissions, export/import ------------------------------------------
  await check(
    campaignName,
    "players cannot award XP, advance levels, rest the party, or export",
    async () => {
      for (const [method, pathname, body] of [
        [
          "POST",
          `/api/campaigns/${campaignId}/award-xp`,
          { amount: 10, characterIds: [heroes[0].id] },
        ],
        ["POST", `/api/campaigns/${campaignId}/level-up`, {}],
        ["POST", `/api/campaigns/${campaignId}/long-rest`, {}],
        ["POST", `/api/campaigns/${campaignId}/downtime`, { days: 1 }],
        ["GET", `/api/campaigns/${campaignId}/export`, undefined],
        ["GET", `/api/campaigns/${campaignId}/loot`, undefined],
        ["GET", `/api/campaigns/${campaignId}/npcs`, undefined],
        ["GET", `/api/campaigns/${campaignId}/encounters`, undefined],
      ] as const) {
        const result = await api(pathname, {
          method,
          cookie: players[0].cookie,
          ...(body ? { body } : {}),
          expect: null,
        });
        assertEqual(result.status, 403, `${method} ${pathname} player status`);
      }
    }
  );

  await check(
    campaignName,
    "campaign export preserves levels, calendar, and content counts",
    async () => {
      await api(`/api/campaigns/${campaignId}/npcs`, {
        method: "POST",
        cookie: gm.cookie,
        body: {
          name: "The Ash Warden",
          level: 20,
          hp: 400,
          ac: 42,
          perception: 30,
          description: "Final antagonist.",
        },
      });
      const exported = await api(`/api/campaigns/${campaignId}/export`, { cookie: gm.cookie });
      const payload = exported.payload;
      assertEqual(payload.format, "runehall-campaign", "Export format");
      assertEqual(payload.characters.length, 4, "Export character count");
      assert(
        payload.characters.every((character: Json) => character.data.level === 20),
        "Export did not preserve level 20"
      );
      assertEqual(payload.campaign.worldDate.year, 4726, "Export world year");
      assertEqual(payload.campaign.xpMode, "xp", "Export XP mode");
      assert(payload.scenes.length >= 1, "Export did not include scenes");
      assert(payload.journal.length >= 2, "Export did not include journal entries");
      assert(payload.loot.length >= parcelCount, "Export did not include loot parcels");
      assert(payload.sessions.length >= 1, "Export did not include sessions");
      assert(payload.npcs.length >= 1, "Export did not include NPCs");
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
      assertEqual(importedCampaign.worldDate.year, 4726, "Imported world year");
      assertEqual(importedCampaign.xpMode, "xp", "Imported XP mode");
      metric("campaignA.importedCampaignId", importedCampaign.id);

      // Clean up the copy so the simulation leaves one campaign behind.
      await api(`/api/campaigns/${importedCampaign.id}`, { method: "DELETE", cookie: gm.cookie });
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

  await check(campaignName, "loot audit values parcels and character wealth", async () => {
    const response = await api(`/api/campaigns/${campaignId}/loot/audit`, { cookie: gm.cookie });
    const audit = response.payload.audit;
    assertEqual(audit.partyLevel, 20, "Audit party level");
    assertEqual(audit.budget.totalGp, treasureBudgetGp(20).totalGp, "Level 20 treasure budget");
    assertEqual(audit.parcels.length, parcelCount, "Audited parcel count");
    assertEqual(audit.preparedCp, 0, "All simulated parcels were distributed");
    assert(audit.distributedCp > 0, "Distributed treasure was not valued");
    assertEqual(audit.characters.length, 4, "Audited character count");
    assert(
      audit.characters.every((character: Json) => character.expectedCp > 0),
      "Character wealth benchmark missing"
    );
    metric("campaignA.treasureDistributedCp", audit.distributedCp);
  });

  await check(
    campaignName,
    "hazard and accomplishment awards use PF2e values and reach the ledger",
    async () => {
      const before = await getTable(campaignId, gm.cookie);
      const ids = heroes.map((hero) => hero.id);
      const complex = await awardXp(campaignId, gm.cookie, 0, "", ids, {
        kind: "hazard",
        hazardLevel: 11,
        partyLevel: 10,
        hazardComplexity: "complex",
      });
      assertEqual(complex.amount, 60, "Complex hazard XP");
      const simple = await awardXp(campaignId, gm.cookie, 0, "", ids, {
        kind: "hazard",
        hazardLevel: 10,
        partyLevel: 10,
        hazardComplexity: "simple",
      });
      assertEqual(simple.amount, 8, "Simple hazard XP");
      const accomplishment = await awardXp(campaignId, gm.cookie, 0, "", ids, {
        kind: "accomplishment",
        tier: "major",
      });
      assertEqual(accomplishment.amount, 80, "Major accomplishment XP");
      const after = await getTable(campaignId, gm.cookie);
      for (const hero of heroes) {
        const previous = summaryFor(before, hero.id);
        const current = summaryFor(after, hero.id);
        assertEqual(current.xp, previous.xp + 148, `${hero.name} XP after hazard and story awards`);
      }
      const ledger = await api(`/api/campaigns/${campaignId}/xp-awards`, { cookie: gm.cookie });
      const kinds = (ledger.payload.awards as Json[]).slice(0, 3).map((award) => award.kind);
      assertEqual(kinds.join(","), "accomplishment,hazard,hazard", "XP ledger award kinds");
      assertEqual(
        (ledger.payload.awards as Json[])[0].reason,
        "Major accomplishment",
        "Accomplishment ledger label"
      );
    }
  );

  // --- Observations --------------------------------------------------------
  observe(
    campaignName,
    "Treasure audit is advisory",
    `Valued ${parcelCount} distributed parcels (${TREASURE_CURRENCY_GP[0]} gp at level 1 to ${TREASURE_CURRENCY_GP[19]} gp at level 20) and each character's gear and coins. Parcels are not tagged by level, and the app does not enforce the permanent-item/consumable item mix from GM Core table 10-9.`
  );

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
      (payload) => payload.worldDate?.day === 2,
      5_000
    );
    await api(`/api/campaigns/${campaignId}/calendar`, {
      method: "PUT",
      cookie: gm.cookie,
      body: { year: 4726, month: 1, day: 1 },
    });
    await api(`/api/campaigns/${campaignId}/calendar/advance`, {
      method: "POST",
      cookie: gm.cookie,
      body: { days: 1 },
    });
    const payload = await update;
    assertEqual(payload.worldDate.day, 2, "Live world date");
    assert(!payload.inviteCode, "Campaign summary leaked the invite code to the player");
    playerSocket.close();
  });

  await check(
    campaignName,
    "replacement character can join and be advanced to the party level",
    async () => {
      const replacement = await createHero(players[2], {
        name: "Tobin Ash",
        className: "Rogue",
        backgroundName: "Criminal",
        heritageName: "Skilled Human",
      });
      await joinCampaign(players[2], campaignId, inviteCode, replacement.id);
      for (let level = 1; level < 10; level++) {
        await api(`/api/campaigns/${campaignId}/level-up`, {
          method: "POST",
          cookie: gm.cookie,
          body: { characterId: replacement.id },
        });
      }
      const table = await getTable(campaignId, gm.cookie);
      assertEqual(summaryFor(table, replacement.id).level, 10, "Replacement character level");
      const grant = await api(`/api/campaigns/${campaignId}/characters/${replacement.id}/wealth`, {
        method: "POST",
        cookie: gm.cookie,
      });
      assert(grant.payload.grantCp > 0, "Replacement wealth grant was empty");
      assertEqual(grant.payload.targetCp, startingWealthCp(10), "Replacement wealth benchmark");
      const sheet = await api(`/api/characters/${replacement.id}`, { cookie: gm.cookie });
      const committed = computeCharacter(
        sheet.payload.character.data as CharacterDraft,
        contextForDraft(sheet.payload.character.data)
      ).wealth.committed;
      assertEqual(committed, startingWealthCp(10), "Replacement wealth after grant");
      const secondGrant = await api(
        `/api/campaigns/${campaignId}/characters/${replacement.id}/wealth`,
        { method: "POST", cookie: gm.cookie }
      );
      assertEqual(secondGrant.payload.grantCp, 0, "Repeated replacement wealth grant");
    }
  );

  await check(
    campaignName,
    "milestone campaign supports sessions, recap, and a shared handout",
    async () => {
      const session = (
        await api(`/api/campaigns/${campaignId}/sessions`, {
          method: "POST",
          cookie: gm.cookie,
          body: {
            title: "The Quiet Ledger, Session 1",
            scheduledAt: Date.now() - 3_600_000,
            durationMinutes: 180,
            status: "played",
            notes: "GM-only notes.",
          },
        })
      ).payload.session;
      await api(`/api/campaigns/${campaignId}/journal`, {
        method: "POST",
        cookie: gm.cookie,
        body: {
          title: "Ledger clue",
          content: "Three names are scratched out.",
          visible: true,
          kind: "handout",
        },
      });
      const recap = await api(
        `/api/campaigns/${campaignId}/recap?from=${Date.now() - 7 * 86_400_000}&to=${Date.now() + 60_000}`,
        { cookie: gm.cookie }
      );
      assert(
        String(recap.payload.recap?.draft).includes("The Quiet Ledger, Session 1"),
        "Milestone recap did not include the session"
      );
      assert(
        String(recap.payload.recap?.draft).includes("Ledger clue"),
        "Milestone recap did not include the handout"
      );
      const playerSessions = await api(`/api/campaigns/${campaignId}/sessions`, {
        cookie: players[0].cookie,
      });
      const playerSession = (playerSessions.payload.sessions as Json[]).find(
        (entry) => entry.id === session.id
      );
      assertEqual(playerSession?.notes, "", "Milestone session notes leaked");
    }
  );

  await check(campaignName, "milestone mode rejects XP awards", async () => {
    const award = await api(`/api/campaigns/${campaignId}/award-xp`, {
      method: "POST",
      cookie: gm.cookie,
      body: { amount: 10, characterIds: [heroes[0].id] },
      expect: null,
    });
    assertEqual(award.status, 400, "Milestone XP award status");
    const table = await getTable(campaignId, gm.cookie);
    assertEqual(summaryFor(table, heroes[0].id).xp, 0, "Milestone XP after rejected award");
  });

  metric("campaignB.id", campaignId);
  metric("campaignB.memberCount", 4);
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
        await api(`/api/campaigns/${campaign.id}`, { method: "DELETE", cookie: gm.cookie });
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
