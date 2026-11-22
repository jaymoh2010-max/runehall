import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { dataDir, now } from "./util";
import { migrations } from "./migrations";

const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir(), "runehall.db");

const sqlite = new DatabaseSync(databasePath);

// node:sqlite's generated types are intentionally conservative about row
// shapes. The repository uses explicit row interfaces below, so keep a thin
// wrapper that preserves those casts at the call sites.
export const db = {
  exec(sql: string): void {
    sqlite.exec(sql);
  },
  prepare(query: string) {
    const statement = sqlite.prepare(query);
    return {
      get: (...params: unknown[]): any => statement.get(...(params as never[])) as any,
      all: (...params: unknown[]): any[] => statement.all(...(params as never[])) as any[],
      run: (...params: unknown[]): any => statement.run(...(params as never[])) as any,
    };
  },
};

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

/**
 * Apply pending migrations in order. The schema_migrations table is created
 * before the first migration so existing databases that predate the migration
 * runner are upgraded safely.
 */
export function applyMigrations(): { applied: number[]; current: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const appliedVersions = new Set(
    (
      db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
        version: number;
      }[]
    ).map((row) => Number(row.version))
  );
  const applied: number[] = [];
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        now()
      );
      db.exec("COMMIT");
      applied.push(migration.version);
      console.log(`[db] applied migration ${migration.version}: ${migration.name}`);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore rollback failures; the original error is more useful
      }
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  const current = migrations.length ? migrations[migrations.length - 1].version : 0;
  db.exec(`PRAGMA user_version = ${current};`);
  return { applied, current };
}

export const migrationStatus = applyMigrations();

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  is_admin: number;
  created_at: number;
}

export interface AuditLogRow {
  id: string;
  created_at: number;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string;
  ip: string;
}

export interface RegistrationInviteRow {
  id: string;
  code: string;
  note: string;
  created_by: string | null;
  created_at: number;
  expires_at: number | null;
  used_by: string | null;
  used_at: number | null;
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string;
  gm_id: string;
  invite_code: string;
  ruleset: string;
  xp_mode: string;
  advancement_speed: string;
  settlement_level: number;
  shop_mode: string;
  world_year: number;
  world_month: number;
  world_day: number;
  audio_track_id: string | null;
  audio_playing: number;
  audio_position: number;
  audio_updated_at: number | null;
  revision: number;
  created_at: number;
  updated_at: number;
  last_played_at: number | null;
}

export interface CampaignShopStockRow {
  campaign_id: string;
  item_id: string;
  quantity: number;
  created_at: number;
  updated_at: number;
}

export interface CampaignTravelRow {
  campaign_id: string;
  origin: string;
  destination: string;
  terrain: string;
  distance_miles: number;
  progress_miles: number;
  party_speed: number;
  weather: string;
  notes: string;
  watches: string;
  activities: string;
  days_travelled: number;
  created_at: number;
  updated_at: number;
}

export interface CharacterRow {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  data: string;
  summary: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
}

export interface CampaignJoinRequestRow {
  id: string;
  campaign_id: string;
  user_id: string;
  character_id: string | null;
  status: "pending" | "approved" | "declined";
  source: "pathbuilder" | "existing";
  report: string | null;
  created_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
}

export interface SceneRow {
  id: string;
  campaign_id: string;
  name: string;
  image_url: string | null;
  thumbnail_url: string | null;
  width: number;
  height: number;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  fog_enabled: number;
  fog_revealed: string;
  templates: string;
  walls: string;
  los_enabled: number;
  wall_collision: number;
  ambient_light: string;
  vision_scope: string;
  props: string;
  prop_collision: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface TokenRow {
  id: string;
  scene_id: string;
  name: string;
  image_url: string | null;
  character_id: string | null;
  encounter_id: string | null;
  owner_id: string | null;
  x: number;
  y: number;
  size: number;
  vision_radius: number;
  light_radius: number;
  light_color: string;
  vision_mode: string;
  color: string;
  hp_current: number | null;
  hp_max: number | null;
  ac: number | null;
  initiative_bonus: number | null;
  group_id: string | null;
  group_name: string | null;
  conditions: string;
  turn_effects: string;
  hidden: number;
  locked: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  campaign_id: string;
  scene_id: string | null;
  user_id: string | null;
  author_name: string;
  type: string;
  content: string;
  data: string | null;
  visibility: string;
  created_at: number;
}

export interface AudioTrackRow {
  id: string;
  campaign_id: string;
  name: string;
  url: string;
  mime_type: string;
  size: number;
  sort_order: number;
  created_at: number;
}

export interface AudioLibraryTrackRow {
  id: string;
  title: string;
  mood: string;
  url: string;
  mime_type: string;
  size: number;
  author: string;
  license: string;
  source_url: string;
  sort_order: number;
}

export interface JournalRow {
  id: string;
  campaign_id: string;
  title: string;
  content: string;
  visible: number;
  kind: string;
  attachments: string;
  quest_status: string;
  quest_xp: number;
  quest_rewarded_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface XpAwardRow {
  id: string;
  campaign_id: string;
  actor_id: string | null;
  kind: string;
  amount: number;
  reason: string;
  recipient_count: number;
  created_at: number;
}

export interface EncounterRow {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  scene_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface EncounterCombatantRow {
  id: string;
  encounter_id: string;
  monster_id: string | null;
  name: string;
  level: number;
  count: number;
  hp: number | null;
  ac: number | null;
  perception: number | null;
  notes: string;
  wave: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CampaignSessionRow {
  id: string;
  campaign_id: string;
  title: string;
  scheduled_at: number;
  duration_minutes: number;
  notes: string;
  agenda: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface SessionCheckinRow {
  session_id: string;
  user_id: string;
  status: string;
  updated_at: number;
}

export interface SessionAttendanceRow {
  session_id: string;
  user_id: string;
  status: string;
  note: string;
  updated_at: number;
}

export interface CampaignNpcRow {
  id: string;
  campaign_id: string;
  name: string;
  level: number;
  hp: number | null;
  ac: number | null;
  perception: number | null;
  size: number;
  color: string;
  image_url: string | null;
  description: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface CampaignDashboardRow {
  campaign_id: string;
  last_session_summary: string;
  next_session_at: number | null;
  next_session_teaser: string;
  next_session_notes: string;
  threads: string;
  updated_at: number;
}

export interface UploadedAssetRow {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  campaign_id: string | null;
  uploaded_by: string | null;
  created_at: number;
}

export interface LootParcelRow {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  items: string;
  gp: number;
  sp: number;
  cp: number;
  status: string;
  distributed_to: string | null;
  distributed_to_name: string | null;
  distributed_at: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createDefaultScene(campaignId: string, gmId: string): string {
  const id = `scene_${cryptoRandom()}`;
  const ts = now();
  db.prepare(
    `INSERT INTO scenes (id, campaign_id, name, image_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, sort_order, created_at, updated_at)
     VALUES (?, ?, 'The First Step', NULL, 1600, 1000, 70, 0, 0, 1, '[]', 0, ?, ?)`
  ).run(id, campaignId, ts, ts);
  db.prepare(
    `INSERT OR REPLACE INTO campaign_state (campaign_id, active_scene_id, initiative, round, turn_index, updated_at)
     VALUES (?, ?, '[]', 1, 0, ?)`
  ).run(campaignId, id, ts);
  db.prepare(`UPDATE campaigns SET last_played_at = ? WHERE id = ?`).run(ts, campaignId);
  return id;
}

function cryptoRandom(): string {
  // small helper to avoid importing crypto in every callsite
  const array = new Uint8Array(12);
  globalThis.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
