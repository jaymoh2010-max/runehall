#!/usr/bin/env node
/**
 * Multi-party campaign progression simulation.
 *
 * Boots an isolated server, then runs seven campaigns with different class
 * combinations from level 1 to 20. At every level each character is rebuilt
 * from the deterministic class simulator, saved through the real character
 * API, and compared against the server's table summary. This exercises class
 * features, feats, spells, gear, saves, attacks, and level-up sync across all
 * 29 remaster classes.
 *
 * Usage:
 *   npm run simulate:parties
 *   npm run simulate:parties -- --report party-report.json
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { io, type Socket } from "socket.io-client";
import { computeCharacter, grantedTrainedSkills } from "../src/shared/rules";
import { contextForDraft } from "../src/server/compendium";
import {
  advanceSimulatedCharacter,
  buildSimulatedCharacter,
  type SimulatedCharacterBuild,
} from "./simulate-characters";
import type { CharacterDraft } from "../src/shared/types";

type Json = Record<string, any>;
type CheckStatus = "pass" | "fail" | "observation";
interface CheckRecord {
  campaign: string;
  name: string;
  status: CheckStatus;
  detail?: string;
  error?: string;
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const tempDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "runehall-parties-"));
const databasePath = path.join(tempDir, "runehall.db");
const compendiumDir = path.join(projectRoot, "data", "compendium");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const reportArgIndex = process.argv.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && process.argv[reportArgIndex + 1]
    ? path.resolve(process.argv[reportArgIndex + 1])
    : null;

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
      password: "party-sim-password-123",
      bootstrapToken: "party-sim-bootstrap-token",
    },
  });
  return {
    id: result.payload.user.id,
    username,
    displayName,
    cookie: result.cookie,
  };
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

interface Party {
  name: string;
  classes: string[];
  variants?: {
    freeArchetype?: boolean;
    automaticBonusProgression?: boolean;
  };
}

const PARTIES: Party[] = [
  {
    name: "A: Iron Vanguard",
    classes: ["Fighter", "Wizard", "Cleric", "Rogue"],
    variants: { freeArchetype: true, automaticBonusProgression: true },
  },
  {
    name: "B: Wild Hunt",
    classes: ["Barbarian", "Sorcerer", "Druid", "Ranger"],
  },
  {
    name: "C: Radiant Ledger",
    classes: ["Champion", "Oracle", "Alchemist", "Investigator"],
  },
  {
    name: "D: Mind and Spirit",
    classes: ["Monk", "Psychic", "Animist", "Summoner"],
  },
  {
    name: "E: Gun and Grimoire",
    classes: ["Gunslinger", "Witch", "Magus", "Swashbuckler"],
  },
  {
    name: "F: Occult Edge",
    classes: ["Bard", "Commander", "Necromancer", "Kineticist"],
  },
  {
    name: "G: The Last Theorem",
    classes: ["Exemplar", "Guardian", "Inventor", "Thaumaturge", "Runesmith"],
  },
];

interface HeroSim {
  characterId: string;
  className: string;
  seed: number;
  name: string;
  player: Account;
  ancestryName: string;
  backgroundName: string;
  heritageName: string | null;
  deityName: string | null;
  build: SimulatedCharacterBuild;
}

function advanceForHero(
  hero: HeroSim,
  level: number,
  variants: Party["variants"]
): SimulatedCharacterBuild {
  const build = advanceSimulatedCharacter({
    previous: hero.build,
    level,
    seed: hero.seed,
    freeArchetype: Boolean(variants?.freeArchetype),
  });
  build.draft.name = hero.name;
  if (variants?.automaticBonusProgression) {
    if (build.draft.level >= 3 && !build.draft.abpSkill) build.draft.abpSkill = "athletics";
    if (build.draft.level >= 17 && !build.draft.abpApex) build.draft.abpApex = "str";
  }
  return build;
}

function assertPreservedChoices(
  previous: CharacterDraft,
  saved: CharacterDraft,
  label: string,
  variants?: Party["variants"]
): void {
  for (const key of [
    "ancestryId",
    "heritageId",
    "backgroundId",
    "classId",
    "deityId",
    "deitySkill",
    "backgroundFeat",
    "keyAbility",
  ] as const) {
    assertEqual(saved[key], previous[key], `${label} preserved ${key}`);
  }
  for (const key of ["ancestry", "background", "free"] as const) {
    assertEqual(
      JSON.stringify(saved.boosts[key]),
      JSON.stringify(previous.boosts[key]),
      `${label} preserved ${key} boosts`
    );
  }
  for (const category of ["ancestry", "class", "skill", "general", "freeArchetype"] as const) {
    for (const [slot, featId] of Object.entries(previous.feats[category])) {
      assertEqual(
        saved.feats[category][slot],
        featId,
        `${label} preserved ${category} feat at level ${slot}`
      );
    }
  }
  for (const [group, ids] of Object.entries(previous.classChoices)) {
    assertEqual(
      JSON.stringify(saved.classChoices[group] ?? []),
      JSON.stringify(ids),
      `${label} preserved class choice ${group}`
    );
  }
  for (const [group, ids] of Object.entries(previous.grantChoices)) {
    for (const id of ids) {
      assert(
        (saved.grantChoices[group] ?? []).includes(id),
        `${label} lost grant choice ${group}:${id}`
      );
    }
  }
  for (const id of previous.spells.cantrips) {
    assert(saved.spells.cantrips.includes(id), `${label} lost cantrip ${id}`);
  }
  for (const id of previous.spells.known) {
    assert(saved.spells.known.includes(id), `${label} lost known spell ${id}`);
  }
  for (const id of previous.spells.focus) {
    assert(saved.spells.focus.includes(id), `${label} lost focus spell ${id}`);
  }
  for (const entry of previous.equipment) {
    assert(
      saved.equipment.some((candidate) => candidate.itemId === entry.itemId),
      `${label} lost equipment ${entry.itemId}`
    );
  }
  // Free-archetype feats can change which skills are fixed, so the builder may
  // legitimately rebalance an earlier increase. The variant campaign still
  // checks every derived number and every selected feat below.
  if (variants?.freeArchetype) return;

  const fixedSkills = grantedTrainedSkills(
    saved,
    contextForDraft(
      saved,
      Boolean(variants?.freeArchetype),
      Boolean(variants?.automaticBonusProgression)
    )
  );
  for (const [slot, skill] of Object.entries(previous.skills.increases)) {
    const savedSkill = saved.skills.increases[slot];
    if (savedSkill === skill) continue;
    assert(
      fixedSkills.has(skill),
      `${label} moved the level ${slot} skill increase from ${skill} to ${savedSkill}`
    );
  }
}

function assertFiniteSheet(derived: ReturnType<typeof computeCharacter>, label: string): void {
  const numeric: [string, number | null][] = [
    ["HP", derived.maxHp],
    ["AC", derived.ac],
    ["Speed", derived.speed],
    ["Perception", derived.perception],
    ["Class DC", derived.classDc],
    ["Spell DC", derived.spellDc],
    ["Spell attack", derived.spellAttack],
    ["Fortitude", derived.saves.fortitude],
    ["Reflex", derived.saves.reflex],
    ["Will", derived.saves.will],
  ];
  for (const [name, value] of numeric) {
    if (value === null) continue;
    assert(Number.isFinite(value), `${label}: ${name} is not finite (${value})`);
  }
  for (const skill of derived.skills) {
    assert(Number.isFinite(skill.mod), `${label}: ${skill.name} modifier is not finite`);
  }
  for (const attack of derived.attacks) {
    assert(Number.isFinite(attack.attackBonus), `${label}: ${attack.name} attack is not finite`);
    assert(
      !/undefined|NaN|\[object Object\]/.test(attack.damageFormula),
      `${label}: ${attack.name} damage formula is invalid (${attack.damageFormula})`
    );
  }
  assert(derived.attacks.length > 0, `${label}: no attacks were derived`);
  assert(
    derived.validation.every((issue) => issue.severity !== "error"),
    `${label}: validation errors: ${derived.validation
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .slice(0, 3)
      .join("; ")}`
  );
}

async function runParty(gm: Account, players: Account[], party: Party, index: number) {
  const created = await api("/api/campaigns", {
    method: "POST",
    cookie: gm.cookie,
    body: {
      name: party.name,
      description: `Level 1-20 class-combination simulation: ${party.classes.join(", ")}.`,
      ruleset: "expanded",
      xpMode: "milestone",
      freeArchetype: Boolean(party.variants?.freeArchetype),
      automaticBonusProgression: Boolean(party.variants?.automaticBonusProgression),
    },
  });
  const campaign = created.payload.campaign;
  const campaignId = campaign.id as string;
  const inviteCode = campaign.inviteCode as string;
  const heroes: HeroSim[] = [];

  for (let heroIndex = 0; heroIndex < party.classes.length; heroIndex++) {
    const className = party.classes[heroIndex];
    const player = players[heroIndex];
    const seed = 90_000 + index * 100 + heroIndex;
    const name = `${party.name.split(":")[0]} ${className}`;
    const levelOneBuild = buildSimulatedCharacter({ seed, className, level: 1 });
    levelOneBuild.draft.name = name;
    const createdCharacter = await api("/api/characters", {
      method: "POST",
      cookie: player.cookie,
      body: { name },
    });
    const characterId = createdCharacter.payload.character.id as string;
    await api(`/api/characters/${characterId}`, {
      method: "PUT",
      cookie: player.cookie,
      body: { data: levelOneBuild.draft, force: true },
    });
    await api("/api/campaigns/join", {
      method: "POST",
      cookie: player.cookie,
      body: { code: inviteCode, characterId },
    });
    heroes.push({
      characterId,
      className,
      seed,
      name,
      player,
      ancestryName: levelOneBuild.context.ancestry?.name ?? "Human",
      backgroundName: levelOneBuild.context.background?.name ?? "Warrior",
      heritageName: levelOneBuild.context.heritage?.name ?? null,
      deityName: levelOneBuild.context.deity?.name ?? null,
      build: levelOneBuild,
    });
  }

  await check(party.name, "all characters join at level 1", async () => {
    const table = await getTable(campaignId, gm.cookie);
    assertEqual(table.characters.length, heroes.length, "Party size");
    for (const hero of heroes) {
      const summary = summaryFor(table, hero.characterId);
      assertEqual(summary.level, 1, `${hero.name} level`);
      assert(summary.hp > 0, `${hero.name} has no HP`);
      assert(summary.ac >= 10, `${hero.name} has no AC`);
    }
  });

  let advancedLevels = 0;
  let rebuiltLevels = 0;
  await check(party.name, "levels 1-20 advance continuously and stay in sync", async () => {
    for (let level = 1; level <= 20; level++) {
      if (level > 1) {
        const leveled = await api(`/api/campaigns/${campaignId}/level-up`, {
          method: "POST",
          cookie: gm.cookie,
          body: {},
        });
        assertEqual(leveled.payload.leveled, heroes.length, `Party level-up to ${level}`);
        assertEqual(leveled.payload.atMaxLevel, 0, `Unexpected max-level count at ${level}`);
      }

      const table = await getTable(campaignId, gm.cookie);
      const builds = new Map<string, SimulatedCharacterBuild>();
      const previousBuilds = new Map<string, CharacterDraft>();
      for (const hero of heroes) {
        let build: SimulatedCharacterBuild;
        if (level === 1) {
          build = hero.build;
        } else {
          previousBuilds.set(hero.characterId, structuredClone(hero.build.draft));
          build = advanceForHero(hero, level, party.variants);
          hero.build = build;
          if (build.source === "advanced") advancedLevels++;
          else rebuiltLevels++;
          assert(
            build.source === "advanced",
            `${hero.name} L${level} needed a fallback rebuild: ${build.fallbackReason ?? build.source}`
          );
        }
        builds.set(hero.characterId, build);
        if (level > 1) {
          const current = characterFor(table, hero.characterId);
          await api(`/api/characters/${hero.characterId}`, {
            method: "PUT",
            cookie: hero.player.cookie,
            body: { data: build.draft, expectedRevision: current.revision },
          });
        }
      }

      const after = await getTable(campaignId, gm.cookie);
      for (const hero of heroes) {
        const build = builds.get(hero.characterId)!;
        const saved = characterFor(after, hero.characterId);
        const savedDraft = saved.data as CharacterDraft;
        assertEqual(savedDraft.level, level, `${hero.name} saved level`);
        assertEqual(savedDraft.classId, build.draft.classId, `${hero.name} saved class`);
        const previousDraft = previousBuilds.get(hero.characterId);
        if (previousDraft) {
          assertPreservedChoices(
            previousDraft,
            savedDraft,
            `${hero.name} L${level}`,
            party.variants
          );
        }
        const derived = computeCharacter(
          savedDraft,
          contextForDraft(
            savedDraft,
            Boolean(party.variants?.freeArchetype),
            Boolean(party.variants?.automaticBonusProgression)
          )
        );
        const summary = summaryFor(after, hero.characterId);
        const label = `${hero.name} L${level}`;
        assertEqual(summary.level, level, `${label} level`);
        assertEqual(summary.hp, derived.maxHp, `${label} HP`);
        assertEqual(summary.ac, derived.ac, `${label} AC`);
        assertEqual(summary.speed, derived.speed, `${label} Speed`);
        assertEqual(summary.perception, derived.perception, `${label} Perception`);
        assertEqual(summary.fortitude, derived.saves.fortitude, `${label} Fortitude`);
        assertEqual(summary.reflex, derived.saves.reflex, `${label} Reflex`);
        assertEqual(summary.will, derived.saves.will, `${label} Will`);
        assertEqual(summary.classDc, derived.classDc, `${label} Class DC`);
        assertEqual(summary.spellDc, derived.spellDc, `${label} Spell DC`);
        assertFiniteSheet(derived, label);
      }
    }

    const capped = await api(`/api/campaigns/${campaignId}/level-up`, {
      method: "POST",
      cookie: gm.cookie,
      body: {},
    });
    assertEqual(capped.payload.leveled, 0, "Level 20 cap: no characters advanced");
    assertEqual(capped.payload.atMaxLevel, heroes.length, "Level 20 cap: party counted");
  });
  metric(`${party.name}.advancedLevels`, advancedLevels);
  metric(`${party.name}.rebuiltLevels`, rebuiltLevels);

  if (party.variants) {
    await check(party.name, "variant rules stay enabled and fill their slots", async () => {
      const details = await api(`/api/campaigns/${campaignId}`, { cookie: gm.cookie });
      assertEqual(
        details.payload.campaign.freeArchetype,
        Boolean(party.variants?.freeArchetype),
        "Free Archetype setting"
      );
      assertEqual(
        details.payload.campaign.automaticBonusProgression,
        Boolean(party.variants?.automaticBonusProgression),
        "Automatic Bonus Progression setting"
      );
      const table = await getTable(campaignId, gm.cookie);
      for (const hero of heroes) {
        const draft = characterFor(table, hero.characterId).data as CharacterDraft;
        if (party.variants?.freeArchetype) {
          assert(
            Object.keys(draft.feats.freeArchetype).length >= 9,
            `${hero.name} did not receive free archetype slots`
          );
          assert(
            Boolean(draft.feats.freeArchetype["2"]),
            `${hero.name} free archetype level-2 slot is empty`
          );
        }
        if (party.variants?.automaticBonusProgression) {
          assert(draft.abpSkill, `${hero.name} has no ABP skill potency`);
          assert(draft.abpApex, `${hero.name} has no ABP apex`);
        }
      }
    });
  }

  await check(party.name, "level 20 sheets and tokens have matching HP and AC", async () => {
    const gmSocket = await connectSocket(gm.cookie);
    await emitAck(gmSocket, "campaign:join", { campaignId });
    const table = await getTable(campaignId, gm.cookie);
    const sceneId = table.scenes[0]?.id as string;
    assert(sceneId, "No scene available for token sync");
    for (const hero of heroes) {
      const summary = summaryFor(table, hero.characterId);
      const token = await emitAck<Json>(gmSocket, "token:create", {
        campaignId,
        sceneId,
        token: {
          name: hero.name,
          characterId: hero.characterId,
          x: 100,
          y: 100,
          size: 1,
        },
      });
      assertEqual(token.hpMax, summary.hp, `${hero.name} token max HP`);
      assertEqual(token.hpCurrent, summary.currentHp, `${hero.name} token current HP`);
      assertEqual(token.ac, summary.ac, `${hero.name} token AC`);
    }
    gmSocket.close();
    metric(`${party.name}.level20Characters`, heroes.length);
  });

  metric(`${party.name}.id`, campaignId);
  return { campaignId, heroes };
}

async function main(): Promise<void> {
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
      BOOTSTRAP_TOKEN: "party-sim-bootstrap-token",
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
    console.log("Starting isolated Runehall server for party simulation.");
    await waitForServer(base);
    log("isolated server is healthy");

    const gm = await register("party_sim_gm", "Party Sim GM");
    const players: Account[] = [];
    for (let index = 1; index <= 5; index++) {
      players.push(await register(`party_sim_p${index}`, `Party Sim Player ${index}`));
    }
    log("registered one GM and five players");

    const campaigns: { campaignId: string; heroes: HeroSim[] }[] = [];
    for (let index = 0; index < PARTIES.length; index++) {
      campaigns.push(await runParty(gm, players, PARTIES[index], index));
    }

    await check("cleanup", "all party campaigns delete cleanly", async () => {
      for (const campaign of campaigns) {
        const details = await api(`/api/campaigns/${campaign.campaignId}`, { cookie: gm.cookie });
        await api(`/api/campaigns/${campaign.campaignId}`, {
          method: "DELETE",
          cookie: gm.cookie,
          body: { confirmName: details.payload.campaign.name },
        });
      }
    });
    metric("campaigns", PARTIES.length);
    metric(
      "characters",
      campaigns.reduce((sum, campaign) => sum + campaign.heroes.length, 0)
    );
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    report.checks.push({
      campaign: currentCampaign,
      name: "simulation aborted",
      status: "fail",
      error: message,
    });
    console.error(`Party simulation aborted: ${message}`);
    if (serverOutput) console.error(serverOutput.slice(-4000));
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
    console.log("");
    console.log(`Party simulation: ${passes.length} passed, ${failures.length} failed.`);
    if (failures.length) {
      for (const failure of failures) {
        console.log(`  FAIL ${failure.campaign} :: ${failure.name}: ${failure.error}`);
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
