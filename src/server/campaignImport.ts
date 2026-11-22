import { getUserByUsername } from "./access";
import fs from "node:fs";
import path from "node:path";
import { contextForDraft, equipment } from "./compendium";
import { db, transaction } from "./db";
import { characterSummary, normalizeCharacterDraft } from "../shared/rules";
import {
  normalizeCampaignRuleset,
  normalizeXpMode,
  rulesetContentMode,
  rulesetIncludesLegacy,
} from "../shared/content";
import { normalizeCampaignThreads } from "../shared/dashboard";
import { normalizeGolarionDate } from "../shared/calendar";
import { normalizeAdvancementSpeed, normalizeXpAwardKind } from "../shared/xp";
import {
  normalizeTravelActivities,
  normalizeTravelEncounterChecks,
  normalizeTravelMiles,
  normalizeTravelSpeed,
  normalizeTravelTerrain,
  normalizeTravelWatches,
  normalizeTravelWaypoints,
  normalizeTravelWeather,
} from "../shared/travel";
import { normalizeSessionZeroChecklist } from "../shared/sessionZero";
import {
  normalizeHazardComplexity,
  normalizeNpcAttitude,
  normalizeNpcKind,
  normalizeReputation,
} from "../shared/people";
import { normalizeChapterLevel, normalizeChapterStatus } from "../shared/chapters";
import {
  MAX_SHOP_STOCK_ROWS,
  normalizeSettlementLevel,
  normalizeShopStockMode,
  shopStockCount,
} from "../shared/shop";
import { normalizeTokenTurnEffects } from "../shared/tokenTurnEffects";
import {
  normalizeAmbientLight,
  normalizeLightColor,
  normalizePartyVisionScope,
  normalizeTokenVisionMode,
} from "../shared/lighting";
import {
  normalizeJournalAttachments,
  normalizeJournalKind,
  normalizeQuestStatus,
  normalizeQuestXp,
} from "../shared/journal";
import { normalizeLootItems } from "../shared/loot";
import { normalizeTokenConditions } from "../shared/tokens";
import { normalizeAoeTemplates } from "../shared/templates";
import { normalizeWalls } from "../shared/walls";
import { normalizeSceneProps } from "../shared/props";
import {
  isSessionCheckinStatus,
  normalizeAttendanceStatus,
  normalizeSessionAgenda,
  normalizeSessionRecurrence,
  normalizeSessionStatus,
} from "../shared/sessions";
import {
  clamp,
  inviteCode,
  newId,
  now,
  safeInt,
  safeString,
  sanitizeUserText,
  uploadsDir,
} from "./util";

type RecordValue = Record<string, unknown>;

/** Resolve a bundled library track in either the source tree or a built client. */
function bundledAudioFile(filename: string): string | null {
  for (const directory of [
    path.resolve("dist", "client", "audio-library"),
    path.resolve("public", "audio-library"),
  ]) {
    const filePath = path.join(directory, filename);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size > 0) return filePath;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

export interface CampaignImportStats {
  characters: number;
  reassignedCharacters: number;
  members: number;
  scenes: number;
  tokens: number;
  messages: number;
  journal: number;
  encounters: number;
  loot: number;
  shopStock: number;
  merchants: number;
  travel: number;
  npcs: number;
  knowledge: number;
  chapters: number;
  sessions: number;
  audioTracks: number;
  xpAwards: number;
  embeddedAssets: number;
}

export interface CampaignImportResult {
  campaignId: string;
  stats: CampaignImportStats;
}

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function uniqueAssetFilename(uploadsPath: string, filename: string): string {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}${extension}`;
    if (!fs.existsSync(path.join(uploadsPath, candidate))) return candidate;
  }
  throw new Error("Could not find a free filename for an embedded asset.");
}

/** Rewrite embedded-asset URLs after collision-safe renaming. */
function remapUploadUrls(value: unknown, remap: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return remap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => remapUploadUrls(entry, remap));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as RecordValue).map(([key, entry]) => [
        key,
        remapUploadUrls(entry, remap),
      ])
    );
  }
  return value;
}

function records(value: unknown, max: number, label: string): RecordValue[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`The ${label} section is invalid.`);
  if (value.length > max) throw new Error(`Too many ${label} to import (maximum ${max}).`);
  return value.filter((entry): entry is RecordValue => Boolean(entry) && typeof entry === "object");
}

function text(value: unknown, fallback = "", max = 500): string {
  return safeString(value, fallback, max);
}

function longText(value: unknown, fallback = "", max = 20_000): string {
  return value === undefined ? fallback : sanitizeUserText(value, max);
}

function numberValue(value: unknown, fallback = 0, min = -1_000_000, max = 1_000_000): number {
  return safeInt(value, fallback, min, max);
}

function timestamp(value: unknown, fallback = now()): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function optionalTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function uniqueInviteCode(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = inviteCode();
    if (!db.prepare("SELECT id FROM campaigns WHERE invite_code = ?").get(code)) return code;
  }
  return inviteCode();
}

export function importCampaign(userId: string, raw: unknown): CampaignImportResult {
  let payload = record(raw);
  if (payload.format !== "runehall-campaign") {
    throw new Error("That file is not a Runehall campaign export.");
  }
  const version = Number(payload.version);
  if (Number.isFinite(version) && version > 1) {
    throw new Error("This export was created by a newer Runehall version.");
  }
  const campaignData = record(payload.campaign);
  const name = text(campaignData.name, "Imported campaign", 80);
  if (!name) throw new Error("The export does not contain a campaign name.");
  const description = longText(campaignData.description, "", 2000);
  const ruleset = normalizeCampaignRuleset(campaignData.ruleset);
  const xpMode = normalizeXpMode(campaignData.xpMode);
  const advancementSpeed = normalizeAdvancementSpeed(campaignData.advancementSpeed);
  const settlementLevel = normalizeSettlementLevel(campaignData.settlementLevel);
  const freeArchetype = campaignData.freeArchetype === true;
  const automaticBonusProgression = campaignData.automaticBonusProgression === true;
  const shopMode = normalizeShopStockMode(campaignData.shopMode);
  const worldDate = normalizeGolarionDate(campaignData.worldDate);

  const stats: CampaignImportStats = {
    characters: 0,
    reassignedCharacters: 0,
    members: 0,
    scenes: 0,
    tokens: 0,
    messages: 0,
    journal: 0,
    encounters: 0,
    loot: 0,
    shopStock: 0,
    merchants: 0,
    travel: 0,
    npcs: 0,
    knowledge: 0,
    chapters: 0,
    sessions: 0,
    audioTracks: 0,
    xpAwards: 0,
    embeddedAssets: 0,
  };

  return transaction(() => {
    const campaignId = newId("camp");
    const ts = now();
    db.prepare(
      "INSERT INTO campaigns (id, name, description, gm_id, invite_code, ruleset, xp_mode, advancement_speed, settlement_level, shop_mode, world_year, world_month, world_day, created_at, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      campaignId,
      name,
      description,
      userId,
      uniqueInviteCode(),
      ruleset,
      xpMode,
      advancementSpeed,
      settlementLevel,
      shopMode,
      worldDate.year,
      worldDate.month,
      worldDate.day,
      ts,
      ts,
      ts
    );
    db.prepare(
      "UPDATE campaigns SET free_archetype = ?, automatic_bonus_progression = ? WHERE id = ?"
    ).run(freeArchetype ? 1 : 0, automaticBonusProgression ? 1 : 0, campaignId);
    db.prepare(
      "INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'gm', ?)"
    ).run(campaignId, userId, ts);

    const embeddedAssets = record(payload.embeddedAssets);
    const allowedAssetExtensions = new Map<string, string>([
      [".png", "image/png"],
      [".jpg", "image/jpeg"],
      [".jpeg", "image/jpeg"],
      [".webp", "image/webp"],
      [".gif", "image/gif"],
      [".avif", "image/avif"],
      [".mp3", "audio/mpeg"],
      [".ogg", "audio/ogg"],
      [".wav", "audio/wav"],
      [".m4a", "audio/mp4"],
      [".webm", "audio/webm"],
    ]);
    let embeddedBytes = 0;
    const assetUrlRemap = new Map<string, string>();
    for (const [assetUrl, encoded] of Object.entries(embeddedAssets)) {
      if (typeof encoded !== "string" || !assetUrl.startsWith("/uploads/")) continue;
      const filename = assetUrl.slice("/uploads/".length);
      if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename === "." || filename === "..") {
        continue;
      }
      const mimeType = allowedAssetExtensions.get(path.extname(filename).toLowerCase());
      if (!mimeType) continue;
      const data = Buffer.from(encoded, "base64");
      if (!data.length) continue;
      if (data.length > 25 * 1024 * 1024) {
        throw new Error("An embedded asset in this archive is larger than 25 MB.");
      }
      embeddedBytes += data.length;
      if (embeddedBytes > 50 * 1024 * 1024) {
        throw new Error("Embedded campaign assets exceed the 50 MB import limit.");
      }
      // Never overwrite a file that may belong to another campaign. A
      // collision gets a suffix and every URL in the archive is remapped.
      const existingAsset = db
        .prepare("SELECT id FROM uploaded_assets WHERE filename = ?")
        .get(filename) as { id: string } | undefined;
      let storedFilename = filename;
      if (existingAsset || fs.existsSync(path.join(uploadsDir(), filename))) {
        storedFilename = uniqueAssetFilename(uploadsDir(), filename);
        assetUrlRemap.set(assetUrl, `/uploads/${storedFilename}`);
      }
      fs.writeFileSync(path.join(uploadsDir(), storedFilename), data);
      db.prepare(
        `INSERT OR IGNORE INTO uploaded_assets
           (id, filename, original_name, mime_type, size, campaign_id, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("asset"),
        storedFilename,
        storedFilename,
        mimeType,
        data.length,
        campaignId,
        userId,
        ts
      );
      stats.embeddedAssets += 1;
    }
    if (assetUrlRemap.size) {
      payload = remapUploadUrls(payload, assetUrlRemap) as RecordValue;
    }

    const memberUserByExportId = new Map<string, string>();
    const memberIds = new Set<string>([userId]);
    for (const member of records(payload.members, 500, "members")) {
      if (member.role !== "player") continue;
      const username = text(member.username, "", 80);
      const local = username ? getUserByUsername(username) : null;
      const exportId = text(member.id, "", 120);
      if (!local) continue;
      if (!memberIds.has(local.id)) {
        db.prepare(
          "INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)"
        ).run(campaignId, local.id, ts);
        memberIds.add(local.id);
        stats.members += 1;
      }
      if (exportId) memberUserByExportId.set(exportId, local.id);
    }

    // Soundtrack files are not embedded in the JSON export. Restore metadata
    // only when the referenced upload or bundled library file exists here.
    for (const track of records(payload.audioTracks, 2_000, "audioTracks")) {
      const rawUrl = text(track.url, "", 500);
      const mimeType = text(track.mimeType, "audio/mpeg", 80);
      if (!["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"].includes(mimeType)) continue;
      let size = 0;
      const uploadMatch = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(rawUrl);
      if (uploadMatch) {
        const filename = uploadMatch[1];
        if (filename === "." || filename === "..") continue;
        try {
          const stat = fs.statSync(path.join(uploadsDir(), filename));
          if (!stat.isFile() || stat.size === 0) continue;
          size = stat.size;
        } catch {
          continue;
        }
      } else {
        const libraryMatch = /^\/audio-library\/([A-Za-z0-9._-]+)$/.exec(rawUrl);
        if (!libraryMatch) continue;
        const filePath = bundledAudioFile(libraryMatch[1]);
        if (!filePath) continue;
        try {
          size = fs.statSync(filePath).size;
        } catch {
          continue;
        }
        if (size === 0) continue;
      }
      try {
        db.prepare(
          `INSERT INTO campaign_audio_tracks
            (id, campaign_id, name, url, mime_type, size, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId("audio"),
          campaignId,
          text(track.name, "Imported track", 140),
          rawUrl,
          mimeType,
          size,
          stats.audioTracks,
          timestamp(track.createdAt, ts)
        );
        stats.audioTracks += 1;
      } catch {
        // Skip a track whose file is missing or unreadable.
      }
    }

    const characterMap = new Map<string, string>();
    for (const character of records(payload.characters, 2_000, "characters")) {
      const oldId = text(character.id, "", 120);
      if (!oldId) continue;
      try {
        const draft = normalizeCharacterDraft(
          character.data,
          text(character.name, "Imported character", 120)
        );
        draft.contentMode = rulesetContentMode(ruleset);
        draft.includeLegacy = rulesetIncludesLegacy(ruleset);
        const summary = characterSummary(
          draft,
          contextForDraft(draft, freeArchetype, automaticBonusProgression)
        );
        const exportOwner = text(character.userId, "", 120);
        const mappedOwner = memberUserByExportId.get(exportOwner);
        const ownerId = mappedOwner ?? userId;
        if (!mappedOwner) stats.reassignedCharacters += 1;
        const characterId = newId("char");
        db.prepare(
          "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          characterId,
          ownerId,
          campaignId,
          draft.name,
          JSON.stringify(draft),
          JSON.stringify(summary),
          ts,
          ts
        );
        characterMap.set(oldId, characterId);
        stats.characters += 1;
      } catch {
        // Skip a malformed character rather than aborting the whole import.
      }
    }

    const sceneMap = new Map<string, string>();
    for (const scene of records(payload.scenes, 5_000, "scenes")) {
      const oldId = text(scene.id, "", 120);
      if (!oldId) continue;
      const sceneId = newId("scene");
      db.prepare(
        `INSERT INTO scenes
          (id, campaign_id, name, image_url, thumbnail_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, templates, walls, los_enabled, wall_collision, ambient_light, vision_scope, props, prop_collision, visible, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        sceneId,
        campaignId,
        text(scene.name, "Imported scene", 80),
        scene.imageUrl ? text(scene.imageUrl, "", 500) : null,
        scene.thumbnailUrl ? text(scene.thumbnailUrl, "", 500) : null,
        clamp(numberValue(scene.width, 1600, 100, 10_000), 100, 10_000),
        clamp(numberValue(scene.height, 1000, 100, 10_000), 100, 10_000),
        clamp(numberValue(scene.gridSize, 70, 20, 300), 20, 300),
        clamp(Number(scene.gridOffsetX) || 0, -300, 300),
        clamp(Number(scene.gridOffsetY) || 0, -300, 300),
        scene.fogEnabled === false ? 0 : 1,
        JSON.stringify(
          Array.isArray(scene.revealed)
            ? scene.revealed
                .filter((cell): cell is string => typeof cell === "string")
                .slice(0, 20_000)
            : []
        ),
        JSON.stringify(normalizeAoeTemplates(scene.templates)),
        JSON.stringify(normalizeWalls(scene.walls)),
        scene.losEnabled === true ? 1 : 0,
        scene.wallCollision === true ? 1 : 0,
        normalizeAmbientLight(scene.ambientLight),
        normalizePartyVisionScope(scene.visionScope),
        JSON.stringify(normalizeSceneProps(scene.props)),
        scene.propCollision === true ? 1 : 0,
        scene.visible === false ? 0 : 1,
        numberValue(scene.sortOrder, sceneMap.size),
        ts,
        ts
      );
      sceneMap.set(oldId, sceneId);
      stats.scenes += 1;
    }
    if (!sceneMap.size) {
      const sceneId = `scene_${newId("")}`;
      db.prepare(
        `INSERT INTO scenes
          (id, campaign_id, name, image_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, sort_order, created_at, updated_at)
         VALUES (?, ?, 'The First Step', NULL, 1600, 1000, 70, 0, 0, 1, '[]', 0, ?, ?)`
      ).run(sceneId, campaignId, ts, ts);
      sceneMap.set("__default__", sceneId);
      stats.scenes += 1;
    }

    const groupMap = new Map<string, string>();
    const tokenMap = new Map<string, string>();
    for (const token of records(payload.tokens, 200_000, "tokens")) {
      const oldId = text(token.id, "", 120);
      const oldSceneId = text(token.sceneId, "", 120);
      const sceneId = sceneMap.get(oldSceneId);
      if (!oldId || !sceneId) continue;
      const oldGroup = text(token.groupId, "", 80);
      let groupId: string | null = null;
      if (oldGroup) {
        groupId = groupMap.get(oldGroup) ?? newId("grp");
        groupMap.set(oldGroup, groupId);
      }
      const oldCharacter = text(token.characterId, "", 120);
      const characterId = oldCharacter ? (characterMap.get(oldCharacter) ?? null) : null;
      const oldOwner = text(token.ownerId, "", 120);
      const ownerId = oldOwner
        ? (memberUserByExportId.get(oldOwner) ?? (memberIds.has(oldOwner) ? oldOwner : null))
        : null;
      const tokenId = newId("tok");
      db.prepare(
        `INSERT INTO tokens
          (id, scene_id, name, image_url, character_id, monster_id, owner_id, x, y, size, vision_radius, light_radius, light_color, vision_mode, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, turn_effects, hidden, locked, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tokenId,
        sceneId,
        text(token.name, "Token", 80),
        token.imageUrl ? text(token.imageUrl, "", 500) : null,
        characterId,
        token.monsterId ? text(token.monsterId, "", 120) || null : null,
        ownerId,
        numberValue(token.x, 0),
        numberValue(token.y, 0),
        clamp(numberValue(token.size, 1, 1, 6), 1, 6),
        clamp(numberValue(token.visionRadius, 60, 0, 240), 0, 240),
        clamp(numberValue(token.lightRadius, 0, 0, 240), 0, 240),
        normalizeLightColor(token.lightColor),
        normalizeTokenVisionMode(token.visionMode),
        text(token.color, "#c8a96b", 30),
        token.hpCurrent === null || token.hpCurrent === undefined
          ? null
          : numberValue(token.hpCurrent, 0),
        token.hpMax === null || token.hpMax === undefined ? null : numberValue(token.hpMax, 0),
        token.ac === null || token.ac === undefined ? null : numberValue(token.ac, 0, -100, 1000),
        token.initiativeBonus === null || token.initiativeBonus === undefined
          ? null
          : numberValue(token.initiativeBonus, 0, -100, 1000),
        groupId,
        groupId ? text(token.groupName, "Group", 80) : null,
        JSON.stringify(normalizeTokenConditions(token.conditions)),
        JSON.stringify(normalizeTokenTurnEffects(token.turnEffects)),
        token.hidden ? 1 : 0,
        token.locked ? 1 : 0,
        numberValue(token.sortOrder, 0),
        ts,
        ts
      );
      tokenMap.set(oldId, tokenId);
      stats.tokens += 1;
    }

    const stateData = record(payload.state);
    const oldActiveScene = text(stateData.activeSceneId, "", 120);
    const activeSceneId = sceneMap.get(oldActiveScene) ?? [...sceneMap.values()][0] ?? null;
    const initiative = Array.isArray(stateData.initiative)
      ? stateData.initiative
          .filter((entry): entry is RecordValue => Boolean(entry) && typeof entry === "object")
          .slice(0, 200)
          .map((entry) => {
            const oldToken = text(entry.tokenId, "", 120);
            const oldScene = text(entry.sceneId, "", 120);
            const oldOwner = text(entry.ownerId, "", 120);
            const oldGroup = text(entry.groupId, "", 80);
            return {
              id: text(entry.id, newId("init"), 80),
              tokenId: oldToken ? (tokenMap.get(oldToken) ?? null) : null,
              name: text(entry.name, "Combatant", 80),
              initiative: numberValue(entry.initiative, 0, -100, 1000),
              color: text(entry.color, "#c8a96b", 30),
              ownerId: oldOwner
                ? (memberUserByExportId.get(oldOwner) ??
                  (memberIds.has(oldOwner) ? oldOwner : null))
                : null,
              sceneId: oldScene ? (sceneMap.get(oldScene) ?? null) : null,
              groupId: oldGroup ? (groupMap.get(oldGroup) ?? null) : null,
            };
          })
      : [];
    db.prepare(
      "INSERT OR REPLACE INTO campaign_state (campaign_id, active_scene_id, initiative, round, turn_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      campaignId,
      activeSceneId,
      JSON.stringify(initiative),
      numberValue(stateData.round, 1, 1, 999),
      numberValue(stateData.turnIndex, 0, 0, 200),
      ts
    );

    for (const message of records(payload.messages, 200_000, "messages")) {
      const oldScene = text(message.sceneId, "", 120);
      const oldUser = text(message.userId, "", 120);
      const visibility = message.visibility === "gm" ? "gm" : "all";
      db.prepare(
        "INSERT INTO messages (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        newId("msg"),
        campaignId,
        oldScene ? (sceneMap.get(oldScene) ?? null) : null,
        oldUser
          ? (memberUserByExportId.get(oldUser) ?? (memberIds.has(oldUser) ? oldUser : null))
          : null,
        text(message.authorName, "Imported user", 80),
        text(message.type, "chat", 20),
        longText(message.content, "", 5000),
        message.data && typeof message.data === "object" ? JSON.stringify(message.data) : null,
        visibility,
        timestamp(message.createdAt, ts)
      );
      stats.messages += 1;
    }

    for (const entry of records(payload.journal, 50_000, "journal")) {
      db.prepare(
        `INSERT INTO journal_entries
          (id, campaign_id, title, content, visible, kind, attachments, quest_status, quest_xp, quest_rewarded_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("journal"),
        campaignId,
        text(entry.title, "Imported entry", 140),
        longText(entry.content, "", 100_000),
        entry.visible === false ? 0 : 1,
        normalizeJournalKind(entry.kind),
        JSON.stringify(normalizeJournalAttachments(entry.attachments)),
        normalizeQuestStatus(entry.questStatus),
        normalizeQuestXp(entry.questXp),
        entry.questRewardedAt ? timestamp(entry.questRewardedAt, ts) : null,
        (() => {
          const oldAuthor = text(entry.createdBy, "", 120);
          return oldAuthor
            ? (memberUserByExportId.get(oldAuthor) ?? (memberIds.has(oldAuthor) ? oldAuthor : null))
            : userId;
        })(),
        timestamp(entry.createdAt, ts),
        timestamp(entry.updatedAt, ts)
      );
      stats.journal += 1;
    }

    for (const encounter of records(payload.encounters, 20_000, "encounters")) {
      const encounterId = newId("enc");
      const oldScene = text(encounter.sceneId, "", 120);
      db.prepare(
        "INSERT INTO encounters (id, campaign_id, name, description, scene_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        encounterId,
        campaignId,
        text(encounter.name, "Imported encounter", 100),
        longText(encounter.description, "", 4000),
        oldScene ? (sceneMap.get(oldScene) ?? null) : null,
        numberValue(encounter.sortOrder, 0),
        ts,
        ts
      );
      for (const combatant of records(encounter.combatants, 500, "combatants")) {
        db.prepare(
          `INSERT INTO encounter_combatants
            (id, encounter_id, monster_id, name, level, count, hp, ac, perception, notes, wave, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId("encm"),
          encounterId,
          combatant.monsterId ? text(combatant.monsterId, "", 120) : null,
          text(combatant.name, "Combatant", 100),
          numberValue(combatant.level, 1, -1, 30),
          clamp(numberValue(combatant.count, 1, 1, 50), 1, 50),
          combatant.hp === null || combatant.hp === undefined ? null : numberValue(combatant.hp, 0),
          combatant.ac === null || combatant.ac === undefined
            ? null
            : numberValue(combatant.ac, 0, -100, 1000),
          combatant.perception === null || combatant.perception === undefined
            ? null
            : numberValue(combatant.perception, 0, -100, 1000),
          longText(combatant.notes, "", 2000),
          clamp(numberValue(combatant.wave, 1, 1, 20), 1, 20),
          numberValue(combatant.sortOrder, 0),
          ts,
          ts
        );
      }
      stats.encounters += 1;
    }

    for (const parcel of records(payload.loot, 20_000, "loot parcels")) {
      const oldRecipient = text(parcel.distributedTo, "", 120);
      db.prepare(
        `INSERT INTO loot_parcels
          (id, campaign_id, name, description, items, level, gp, sp, cp, status,
           distributed_to, distributed_to_name, distributed_at, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("loot"),
        campaignId,
        text(parcel.name, "Imported loot", 120),
        longText(parcel.description, "", 4000),
        JSON.stringify(normalizeLootItems(parcel.items)),
        numberValue(parcel.level, 1, 1, 20),
        numberValue(parcel.gp, 0, 0, 1_000_000_000),
        numberValue(parcel.sp, 0, 0, 1_000_000_000),
        numberValue(parcel.cp, 0, 0, 1_000_000_000),
        parcel.status === "distributed" ? "distributed" : "open",
        oldRecipient ? (characterMap.get(oldRecipient) ?? null) : null,
        parcel.distributedToName ? text(parcel.distributedToName, "", 120) : null,
        optionalTimestamp(parcel.distributedAt),
        numberValue(parcel.sortOrder, 0),
        ts,
        ts
      );
      stats.loot += 1;
    }

    const importedStock = new Map<string, number>();
    for (const entry of records(payload.shopStock, MAX_SHOP_STOCK_ROWS, "shop stock")) {
      const itemId = text(entry.itemId, "", 200);
      if (!itemId || !equipment.some((item) => item.id === itemId)) continue;
      importedStock.set(itemId, shopStockCount(entry.quantity));
    }
    for (const [itemId, quantity] of importedStock) {
      db.prepare(
        `INSERT INTO campaign_shop_stock
           (campaign_id, item_id, quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, item_id) DO UPDATE SET
           quantity = excluded.quantity,
           updated_at = excluded.updated_at`
      ).run(campaignId, itemId, quantity, ts, ts);
      stats.shopStock += 1;
    }

    const importedMerchants = records(payload.merchants, 500, "merchants");
    let hasActiveMerchant = false;
    for (const [index, merchant] of importedMerchants.entries()) {
      const rawStock = Array.isArray(merchant.stock) ? merchant.stock : [];
      const stock = new Map<string, number>();
      for (const raw of rawStock.slice(0, MAX_SHOP_STOCK_ROWS)) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const itemId = text(entry.itemId, "", 200);
        if (!itemId || !equipment.some((item) => item.id === itemId)) continue;
        stock.set(itemId, shopStockCount(entry.quantity));
      }
      const active = merchant.active === true && !hasActiveMerchant ? 1 : 0;
      if (active) hasActiveMerchant = true;
      db.prepare(
        `INSERT INTO campaign_merchants
           (id, campaign_id, name, description, mode, stock, active, sort_order,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("merchant"),
        campaignId,
        text(merchant.name, `Merchant ${index + 1}`, 120),
        longText(merchant.description, "", 2_000),
        normalizeShopStockMode(merchant.mode),
        JSON.stringify([...stock.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))),
        active,
        numberValue(merchant.sortOrder, index),
        ts,
        ts
      );
      stats.merchants += 1;
    }

    const importedTravel = record(payload.travel);
    if (Object.keys(importedTravel).length) {
      const newCharacterIds = new Set(characterMap.values());
      const oldWatches = record(importedTravel.watches);
      const remappedWatches: Record<string, string[]> = {};
      for (const key of ["first", "second", "third", "fourth"]) {
        const raw = Array.isArray(oldWatches[key]) ? oldWatches[key] : [];
        remappedWatches[key] = raw
          .map((value) => (typeof value === "string" ? characterMap.get(value) : undefined))
          .filter((value): value is string => Boolean(value));
      }
      const oldActivities = record(importedTravel.activities);
      const remappedActivities: Record<string, string> = {};
      for (const [oldId, activity] of Object.entries(oldActivities)) {
        const newId = characterMap.get(oldId);
        if (newId && typeof activity === "string") remappedActivities[newId] = activity;
      }
      const distanceMiles = normalizeTravelMiles(importedTravel.distanceMiles);
      const importedWaypoints = normalizeTravelWaypoints(importedTravel.waypoints);
      const importedChecks = normalizeTravelEncounterChecks(importedTravel.encounterChecks);
      db.prepare(
        `INSERT INTO campaign_travel
           (campaign_id, origin, destination, terrain, distance_miles, progress_miles, party_speed,
            weather, notes, watches, activities, waypoints, encounter_checks, days_travelled,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        campaignId,
        text(importedTravel.origin, "", 120),
        text(importedTravel.destination, "", 120),
        normalizeTravelTerrain(importedTravel.terrain),
        distanceMiles,
        Math.min(distanceMiles, normalizeTravelMiles(importedTravel.progressMiles)),
        normalizeTravelSpeed(importedTravel.partySpeed),
        normalizeTravelWeather(importedTravel.weather),
        longText(importedTravel.notes, "", 4000),
        JSON.stringify(normalizeTravelWatches(remappedWatches, newCharacterIds)),
        JSON.stringify(normalizeTravelActivities(remappedActivities, newCharacterIds)),
        JSON.stringify(
          importedWaypoints.map(({ reached: _reached, ...entry }) => ({
            ...entry,
            id: newId("waypoint"),
          }))
        ),
        JSON.stringify(importedChecks.map((check) => ({ ...check, id: newId("travel-check") }))),
        numberValue(importedTravel.daysTravelled, 0, 0, 100_000),
        ts,
        ts
      );
      stats.travel += 1;
    }

    const importedSessionZero = record(payload.sessionZero);
    if (Object.keys(importedSessionZero).length) {
      db.prepare(
        `INSERT INTO campaign_session_zero
           (campaign_id, pitch, genre, tone, themes, expectations, house_rules,
            content_limits, safety_tools, allowed_sources, party_goal, party_hooks,
            gm_notes, checklist, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        campaignId,
        longText(importedSessionZero.pitch, "", 20_000),
        text(importedSessionZero.genre, "", 120),
        text(importedSessionZero.tone, "", 200),
        longText(importedSessionZero.themes, "", 4_000),
        longText(importedSessionZero.expectations, "", 8_000),
        longText(importedSessionZero.houseRules, "", 8_000),
        longText(importedSessionZero.contentLimits, "", 8_000),
        longText(importedSessionZero.safetyTools, "", 8_000),
        longText(importedSessionZero.allowedSources, "", 4_000),
        longText(importedSessionZero.partyGoal, "", 4_000),
        longText(importedSessionZero.partyHooks, "", 8_000),
        longText(importedSessionZero.gmNotes, "", 20_000),
        JSON.stringify(normalizeSessionZeroChecklist(importedSessionZero.checklist)),
        ts,
        ts
      );
    }

    const dashboard = record(payload.dashboard);
    if (Object.keys(dashboard).length) {
      db.prepare(
        "INSERT INTO campaign_dashboard (campaign_id, last_session_summary, next_session_at, next_session_teaser, next_session_notes, threads, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        campaignId,
        longText(dashboard.lastSessionSummary, "", 20_000),
        optionalTimestamp(dashboard.nextSessionAt),
        longText(dashboard.nextSessionTeaser, "", 500),
        longText(dashboard.nextSessionNotes, "", 20_000),
        JSON.stringify(normalizeCampaignThreads(dashboard.threads)),
        ts
      );
    }

    const factionMap = new Map<string, string>();
    for (const faction of records(payload.factions, 5_000, "factions")) {
      const oldId = text(faction.id, "", 120);
      const factionId = newId("faction");
      if (oldId) factionMap.set(oldId, factionId);
      db.prepare(
        `INSERT INTO campaign_factions
           (id, campaign_id, name, description, goals, assets, attitude, reputation, visible,
            gm_notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        factionId,
        campaignId,
        text(faction.name, "Imported faction", 120),
        longText(faction.description, "", 4_000),
        longText(faction.goals, "", 4_000),
        longText(faction.assets, "", 4_000),
        normalizeNpcAttitude(faction.attitude),
        normalizeReputation(faction.reputation),
        faction.visible === true ? 1 : 0,
        longText(faction.gmNotes, "", 8_000),
        numberValue(faction.sortOrder, 0),
        ts,
        ts
      );
    }

    for (const entry of records(payload.knowledge, 20_000, "knowledge entries")) {
      db.prepare(
        `INSERT INTO campaign_knowledge
           (id, campaign_id, title, content, visible, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("knowledge"),
        campaignId,
        text(entry.title, "Imported knowledge", 160),
        longText(entry.content, "", 50_000),
        entry.visible === true ? 1 : 0,
        numberValue(entry.sortOrder, 0),
        ts,
        ts
      );
      stats.knowledge += 1;
    }

    for (const chapter of records(payload.chapters, 1_000, "chapters")) {
      const levelStart = normalizeChapterLevel(chapter.levelStart, 1);
      db.prepare(
        `INSERT INTO campaign_chapters
           (id, campaign_id, title, summary, level_start, level_end, status, visible, gm_notes,
            sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("chapter"),
        campaignId,
        text(chapter.title, "Imported chapter", 160),
        longText(chapter.summary, "", 8_000),
        levelStart,
        Math.max(levelStart, normalizeChapterLevel(chapter.levelEnd, levelStart)),
        normalizeChapterStatus(chapter.status),
        chapter.visible === false ? 0 : 1,
        longText(chapter.gmNotes, "", 8_000),
        numberValue(chapter.sortOrder, 0),
        ts,
        ts
      );
      stats.chapters += 1;
    }

    for (const npc of records(payload.npcs, 20_000, "NPCs")) {
      const kind = normalizeNpcKind(npc.kind);
      db.prepare(
        `INSERT INTO campaign_npcs
          (id, campaign_id, kind, complexity, name, level, hp, ac, perception, size, color,
           image_url, description, faction_id, role, location, attitude, public_description,
           trigger, disable_text, routine, secrets, visible, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("npc"),
        campaignId,
        kind,
        normalizeHazardComplexity(npc.complexity),
        text(npc.name, "Imported NPC", 120),
        numberValue(npc.level, 1, -1, 30),
        npc.hp === null || npc.hp === undefined ? null : numberValue(npc.hp, 0),
        npc.ac === null || npc.ac === undefined ? null : numberValue(npc.ac, 0, -100, 1000),
        npc.perception === null || npc.perception === undefined
          ? null
          : numberValue(npc.perception, 0, -100, 1000),
        clamp(numberValue(npc.size, 1, 1, 6), 1, 6),
        text(npc.color, "#b06767", 30),
        npc.imageUrl ? text(npc.imageUrl, "", 500) : null,
        longText(npc.description, "", 20_000),
        text(npc.factionId, "", 120)
          ? (factionMap.get(text(npc.factionId, "", 120)) ?? null)
          : null,
        text(npc.role, "", 120),
        text(npc.location, "", 120),
        normalizeNpcAttitude(npc.attitude),
        longText(npc.publicDescription, "", 4_000),
        longText(npc.trigger, "", 4_000),
        longText(npc.disable, "", 4_000),
        longText(npc.routine, "", 8_000),
        longText(npc.secrets, "", 8_000),
        kind === "npc" && npc.visible === true ? 1 : 0,
        numberValue(npc.sortOrder, 0),
        ts,
        ts
      );
      stats.npcs += 1;
    }

    for (const session of records(payload.sessions, 10_000, "sessions")) {
      const sessionId = newId("sess");
      db.prepare(
        "INSERT INTO campaign_sessions (id, campaign_id, title, scheduled_at, duration_minutes, notes, agenda, status, recurrence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        sessionId,
        campaignId,
        text(session.title, "Imported session", 140),
        timestamp(session.scheduledAt, ts),
        clamp(numberValue(session.durationMinutes, 180, 30, 1440), 30, 1440),
        longText(session.notes, "", 20_000),
        JSON.stringify(normalizeSessionAgenda(session.agenda)),
        normalizeSessionStatus(session.status),
        normalizeSessionRecurrence(session.recurrence),
        ts,
        ts
      );
      for (const attendance of records(session.attendance, 50, "attendance")) {
        const exportUserId = text(attendance.userId, "", 120);
        const localUserId = memberUserByExportId.get(exportUserId);
        if (!localUserId) continue;
        db.prepare(
          `INSERT INTO session_attendance (session_id, user_id, status, note, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(session_id, user_id)
           DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`
        ).run(
          sessionId,
          localUserId,
          normalizeAttendanceStatus(attendance.status),
          longText(attendance.note, "", 500),
          ts
        );
      }
      for (const checkin of records(session.checkins, 100, "checkins")) {
        if (!isSessionCheckinStatus(checkin.status) || checkin.status === "unanswered") continue;
        const exportUserId = text(checkin.userId, "", 120);
        const localUserId = memberUserByExportId.get(exportUserId);
        if (!localUserId) continue;
        db.prepare(
          `INSERT INTO session_checkins (session_id, user_id, status, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(session_id, user_id)
           DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
        ).run(sessionId, localUserId, checkin.status, ts);
      }
      stats.sessions += 1;
    }

    for (const award of records(payload.xpAwards, 50_000, "XP awards")) {
      db.prepare(
        `INSERT INTO xp_awards
           (id, campaign_id, actor_id, kind, amount, reason, recipient_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("xpa"),
        campaignId,
        userId,
        normalizeXpAwardKind(award.kind),
        numberValue(award.amount, 0, 0, 1_000_000),
        longText(award.reason, "", 2_000),
        numberValue(award.recipientCount, 0, 0, 1_000),
        timestamp(award.createdAt, ts)
      );
      stats.xpAwards += 1;
    }

    return { campaignId, stats };
  });
}
