export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Append-only schema migrations. Never edit a migration that has shipped;
 * add a new one instead. Each migration runs exactly once and is recorded in
 * schema_migrations.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        gm_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_played_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS campaign_members (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('gm', 'player')),
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (campaign_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        image_url TEXT,
        width INTEGER NOT NULL DEFAULT 1600,
        height INTEGER NOT NULL DEFAULT 1000,
        grid_size INTEGER NOT NULL DEFAULT 70,
        grid_offset_x REAL NOT NULL DEFAULT 0,
        grid_offset_y REAL NOT NULL DEFAULT 0,
        fog_enabled INTEGER NOT NULL DEFAULT 1,
        fog_revealed TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        image_url TEXT,
        character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        size INTEGER NOT NULL DEFAULT 1,
        color TEXT NOT NULL DEFAULT '#c8a96b',
        hp_current INTEGER,
        hp_max INTEGER,
        ac INTEGER,
        conditions TEXT NOT NULL DEFAULT '[]',
        hidden INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        author_name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        data TEXT,
        visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'gm')),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campaign_state (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        active_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
        initiative TEXT NOT NULL DEFAULT '[]',
        round INTEGER NOT NULL DEFAULT 1,
        turn_index INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_members_user ON campaign_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
      CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_scenes_campaign ON scenes(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_scene ON tokens(scene_id);
      CREATE INDEX IF NOT EXISTS idx_messages_campaign_created ON messages(campaign_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_journal_campaign ON journal_entries(campaign_id);
    `,
  },
  {
    version: 2,
    name: "campaign_ruleset",
    sql: `
      ALTER TABLE campaigns ADD COLUMN ruleset TEXT NOT NULL DEFAULT 'core';
    `,
  },
  {
    version: 3,
    name: "backfill_preexisting_campaign_rulesets",
    sql: `
      -- Campaigns created before the ruleset feature had access to all
      -- content. Preserve that permissive behavior for existing tables; new
      -- campaigns always write an explicit ruleset during creation.
      UPDATE campaigns
      SET ruleset = 'legacy'
      WHERE ruleset = 'core'
        AND created_at < (SELECT applied_at FROM schema_migrations WHERE version = 2);
    `,
  },
  {
    version: 4,
    name: "campaign_xp_mode_and_encounters",
    sql: `
      ALTER TABLE campaigns ADD COLUMN xp_mode TEXT NOT NULL DEFAULT 'milestone';
      ALTER TABLE tokens ADD COLUMN initiative_bonus INTEGER;

      CREATE TABLE IF NOT EXISTS encounters (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS encounter_combatants (
        id TEXT PRIMARY KEY,
        encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        monster_id TEXT,
        name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        count INTEGER NOT NULL DEFAULT 1,
        hp INTEGER,
        ac INTEGER,
        perception INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_encounter_combatants_encounter ON encounter_combatants(encounter_id);
    `,
  },
  {
    version: 5,
    name: "loot_parcels",
    sql: `
      CREATE TABLE IF NOT EXISTS loot_parcels (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        items TEXT NOT NULL DEFAULT '[]',
        gp INTEGER NOT NULL DEFAULT 0,
        sp INTEGER NOT NULL DEFAULT 0,
        cp INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'distributed')),
        distributed_to TEXT REFERENCES characters(id) ON DELETE SET NULL,
        distributed_to_name TEXT,
        distributed_at INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_loot_parcels_campaign ON loot_parcels(campaign_id);
    `,
  },
  {
    version: 6,
    name: "journal_handouts_and_attachments",
    sql: `
      ALTER TABLE journal_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
      ALTER TABLE journal_entries ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 7,
    name: "campaign_dashboard",
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_dashboard (
        campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        last_session_summary TEXT NOT NULL DEFAULT '',
        next_session_at INTEGER,
        next_session_teaser TEXT NOT NULL DEFAULT '',
        next_session_notes TEXT NOT NULL DEFAULT '',
        threads TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 8,
    name: "token_groups",
    sql: `
      ALTER TABLE tokens ADD COLUMN group_id TEXT;
      ALTER TABLE tokens ADD COLUMN group_name TEXT;
      CREATE INDEX IF NOT EXISTS idx_tokens_group ON tokens(group_id);
    `,
  },
  {
    version: 9,
    name: "campaign_npcs",
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_npcs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        hp INTEGER,
        ac INTEGER,
        perception INTEGER,
        size INTEGER NOT NULL DEFAULT 1,
        color TEXT NOT NULL DEFAULT '#b06767',
        image_url TEXT,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_npcs_campaign ON campaign_npcs(campaign_id);
    `,
  },
  {
    version: 10,
    name: "campaign_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_sessions (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        scheduled_at INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 180,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'played', 'canceled')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_attendance (
        session_id TEXT NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'unmarked' CHECK (status IN ('attended', 'late', 'absent', 'excused', 'unmarked')),
        note TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_sessions_campaign ON campaign_sessions(campaign_id, scheduled_at);
    `,
  },
  {
    version: 11,
    name: "registration_controls_and_audit_log",
    sql: `
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

      -- The oldest account on an existing install becomes the administrator.
      UPDATE users SET is_admin = 1
      WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS registration_invites (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_registration_invites_code ON registration_invites(code);

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT,
        detail TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);
    `,
  },
  {
    version: 12,
    name: "campaign_and_character_revisions",
    sql: `
      ALTER TABLE campaigns ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE characters ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

      CREATE INDEX IF NOT EXISTS idx_campaigns_revision ON campaigns(id, revision);
      CREATE INDEX IF NOT EXISTS idx_characters_revision ON characters(id, revision);
    `,
  },
  {
    version: 13,
    name: "shared_scene_templates",
    sql: `
      ALTER TABLE scenes ADD COLUMN templates TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 14,
    name: "encounter_waves",
    sql: `
      ALTER TABLE encounter_combatants ADD COLUMN wave INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 15,
    name: "uploaded_assets",
    sql: `
      CREATE TABLE IF NOT EXISTS uploaded_assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_uploaded_assets_campaign ON uploaded_assets(campaign_id);
    `,
  },
  {
    version: 16,
    name: "session_agenda_and_checkins",
    sql: `
      ALTER TABLE campaign_sessions ADD COLUMN agenda TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE IF NOT EXISTS session_checkins (
        session_id TEXT NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_checkins_session ON session_checkins(session_id);
    `,
  },
  {
    version: 17,
    name: "scene_thumbnails",
    sql: `
      ALTER TABLE scenes ADD COLUMN thumbnail_url TEXT;
    `,
  },
];
