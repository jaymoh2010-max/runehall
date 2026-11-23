import type { FastifyInstance } from "fastify";
import {
  campaignCharacters,
  campaignMembers,
  canEditCharacter,
  getCampaign,
  getCampaignRole,
  getMembership,
  getUser,
} from "../access";
import { campaignMemberCount, campaignCharacterCount } from "../access";
import {
  db,
  type AudioTrackRow,
  type CampaignRow,
  type MessageRow,
  type SceneRow,
  type TokenRow,
} from "../db";
import {
  serializeAudioState,
  serializeAudioTrack,
  serializeCampaignSummary,
  serializeCharacter,
  serializeInitiative,
  serializeJournal,
  serializeMember,
  serializeMessage,
  serializeScene,
  serializeSceneForPlayers,
  serializeToken,
  touchCampaign,
} from "../serialize";
import { redactTokenForPlayers } from "../../shared/tokenVisibility";
import { clamp, now, safeInt, safeString } from "../util";
import { normalizeAmbientLight, normalizePartyVisionScope } from "../../shared/lighting";
import { filterInitiativeForPlayers } from "../../shared/initiative";

function ensureState(campaignId: string) {
  const state = db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(campaignId) as
    | {
        campaign_id: string;
        active_scene_id: string | null;
        initiative: string;
        round: number;
        turn_index: number;
      }
    | undefined;
  if (state) return state;
  const firstScene = db
    .prepare(
      "SELECT id FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1"
    )
    .get(campaignId) as { id: string } | undefined;
  db.prepare(
    "INSERT INTO campaign_state (campaign_id, active_scene_id, initiative, round, turn_index, updated_at) VALUES (?, ?, '[]', 1, 0, ?)"
  ).run(campaignId, firstScene?.id ?? null, now());
  return db.prepare("SELECT * FROM campaign_state WHERE campaign_id = ?").get(campaignId) as {
    campaign_id: string;
    active_scene_id: string | null;
    initiative: string;
    round: number;
    turn_index: number;
  };
}

function campaignSummaryFor(row: CampaignRow, userId: string) {
  const role = getCampaignRole(row.id, userId);
  if (!role) return null;
  const gm = getUser(row.gm_id);
  return serializeCampaignSummary(
    row,
    role,
    {
      memberCount: campaignMemberCount(row.id),
      characterCount: campaignCharacterCount(row.id),
    },
    gm?.display_name ?? ""
  );
}

function broadcastScene(
  app: FastifyInstance,
  campaignId: string,
  event: string,
  row: SceneRow
): void {
  if (row.visible !== 0) {
    app.broadcastCampaign(campaignId, event, serializeSceneForPlayers(row), "players");
  }
  app.broadcastCampaign(campaignId, event, serializeScene(row), "gm");
}

export async function registerTableRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/table", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    const role = getCampaignRole(id, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });

    const state = ensureState(id);
    const allScenes = db
      .prepare("SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC")
      .all(id) as SceneRow[];
    // Hidden scenes are GM prep. Players must not receive the scene row or any
    // of its tokens, even if they never open the table tab.
    const scenes = role === "player" ? allScenes.filter((scene) => scene.visible !== 0) : allScenes;
    const sceneIds = new Set(scenes.map((scene) => scene.id));
    const tokenRows = scenes.length
      ? (db
          .prepare(
            `SELECT t.*, u.display_name AS owner_name FROM tokens t
             LEFT JOIN users u ON u.id = t.owner_id
             WHERE t.scene_id IN (${scenes.map(() => "?").join(",")})
             ${role === "player" ? "AND t.hidden = 0" : ""}
             ORDER BY t.sort_order ASC, t.created_at ASC`
          )
          .all(...scenes.map((scene) => scene.id)) as (TokenRow & { owner_name: string | null })[])
      : [];
    const messageRows = db
      .prepare(
        `SELECT * FROM messages WHERE campaign_id = ?
         ${role === "player" ? "AND (visibility = 'all' OR user_id = ?)" : ""}
         ORDER BY created_at DESC LIMIT 120`
      )
      .all(...(role === "player" ? [id, request.user.id] : [id])) as MessageRow[];
    const journalRows = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by
         WHERE j.campaign_id = ? ${role === "player" ? "AND j.visible = 1" : ""}
         ORDER BY j.updated_at DESC`
      )
      .all(id) as (import("../db").JournalRow & { author_name: string | null })[];
    const audioRows = db
      .prepare(
        "SELECT * FROM campaign_audio_tracks WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
      )
      .all(id) as AudioTrackRow[];

    const memberCharacters = campaignCharacters(id).map((character) =>
      serializeCharacter(character, character.owner_name, {
        canEdit: canEditCharacter(character, request.user!.id),
        canView: true,
      })
    );

    // A token can be rolled into initiative and then hidden. Players must not
    // receive its entry (or its name) in the table snapshot.
    const hiddenTokenIds =
      role === "player" && scenes.length
        ? new Set(
            (
              db
                .prepare(
                  `SELECT id FROM tokens WHERE hidden = 1 AND scene_id IN (${scenes
                    .map(() => "?")
                    .join(",")})`
                )
                .all(...scenes.map((scene) => scene.id)) as { id: string }[]
            ).map((row) => row.id)
          )
        : new Set<string>();
    const fullInitiative = serializeInitiative(JSON.parse(state.initiative || "[]"));
    const hiddenSceneIds =
      role === "player"
        ? new Set(allScenes.filter((scene) => scene.visible === 0).map((scene) => scene.id))
        : new Set<string>();
    const playerInitiative = filterInitiativeForPlayers(
      fullInitiative,
      hiddenTokenIds,
      state.turn_index,
      hiddenSceneIds
    );
    const visibleInitiative = role === "player" ? playerInitiative.entries : fullInitiative;
    const visibleTurnIndex = role === "player" ? playerInitiative.turnIndex : state.turn_index;

    return reply.send({
      campaign: {
        ...campaignSummaryFor(campaign, request.user.id)!,
        inviteCode: role === "gm" ? campaign.invite_code : "",
      },
      members: campaignMembers(id).map((member) =>
        serializeMember(member, member.role, member.joined_at)
      ),
      characters: memberCharacters,
      scenes: scenes.map(role === "player" ? serializeSceneForPlayers : serializeScene),
      tokens: tokenRows.map((token) => {
        const serialized = serializeToken(token, token.owner_name ?? undefined);
        return role === "player" ? redactTokenForPlayers(serialized) : serialized;
      }),
      activeSceneId:
        state.active_scene_id && sceneIds.has(state.active_scene_id)
          ? state.active_scene_id
          : (scenes[0]?.id ?? null),
      initiative: visibleInitiative,
      round: state.round,
      turnIndex: visibleTurnIndex,
      messages: messageRows.reverse().map(serializeMessage),
      journal: journalRows.map(serializeJournal),
      audioTracks: audioRows.map(serializeAudioTrack),
      audioState: serializeAudioState(campaign),
      revision: Number(campaign.revision ?? 0),
    });
  });

  app.post("/api/campaigns/:id/scenes", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can create scenes." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "New Scene", 80);
    const imageUrl = body.imageUrl ? safeString(body.imageUrl, "", 500) : null;
    const thumbnailUrl = body.thumbnailUrl ? safeString(body.thumbnailUrl, "", 500) : null;
    const width = clamp(safeInt(body.width, 1600, 100, 10_000), 100, 10_000);
    const height = clamp(safeInt(body.height, 1000, 100, 10_000), 100, 10_000);
    const gridSize = clamp(safeInt(body.gridSize, 70, 20, 300), 20, 300);
    const gridOffsetX = clamp(Number(body.gridOffsetX) || 0, -gridSize, gridSize);
    const gridOffsetY = clamp(Number(body.gridOffsetY) || 0, -gridSize, gridSize);
    const visible = body.visible === undefined ? true : body.visible !== false;
    const order = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM scenes WHERE campaign_id = ?")
      .get(id) as { next: number };
    const sceneId = `scene_${Math.random().toString(16).slice(2, 14)}${Date.now().toString(16)}`;
    const ts = now();
    db.prepare(
      `INSERT INTO scenes (id, campaign_id, name, image_url, thumbnail_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, visible, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?, ?, ?)`
    ).run(
      sceneId,
      id,
      name,
      imageUrl,
      thumbnailUrl,
      width,
      height,
      gridSize,
      gridOffsetX,
      gridOffsetY,
      visible ? 1 : 0,
      order.next,
      ts,
      ts
    );
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as SceneRow;
    const scene = serializeScene(row);
    broadcastScene(app, id, "scene:created", row);
    if (body.activate === true && visible) {
      ensureState(id);
      db.prepare(
        "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(sceneId, now(), id);
      app.broadcastCampaign(id, "scene:activated", { sceneId });
    }
    touchCampaign(id);
    return reply.code(201).send({ scene });
  });

  app.post("/api/scenes/:id/duplicate", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const source = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
    if (!source) return reply.code(404).send({ error: "Scene not found." });
    if (getCampaignRole(source.campaign_id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can duplicate scenes." });
    }
    const order = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM scenes WHERE campaign_id = ?")
      .get(source.campaign_id) as { next: number };
    const sceneId = `scene_${Math.random().toString(16).slice(2, 14)}${Date.now().toString(16)}`;
    const ts = now();
    const name = `${source.name} (copy)`.slice(0, 80);
    db.prepare(
      `INSERT INTO scenes (id, campaign_id, name, image_url, thumbnail_url, width, height, grid_size, grid_offset_x, grid_offset_y, fog_enabled, fog_revealed, templates, walls, los_enabled, wall_collision, ambient_light, vision_scope, props, prop_collision, visible, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sceneId,
      source.campaign_id,
      name,
      source.image_url,
      source.thumbnail_url,
      source.width,
      source.height,
      source.grid_size,
      source.grid_offset_x,
      source.grid_offset_y,
      source.fog_enabled,
      source.fog_revealed,
      source.templates,
      source.walls,
      source.los_enabled,
      source.wall_collision,
      source.ambient_light,
      source.vision_scope,
      source.props,
      source.prop_collision,
      source.visible,
      order.next,
      ts,
      ts
    );
    const sourceTokens = db
      .prepare("SELECT * FROM tokens WHERE scene_id = ?")
      .all(id) as TokenRow[];
    for (const token of sourceTokens) {
      db.prepare(
        `INSERT INTO tokens (id, scene_id, name, image_url, character_id, monster_id, owner_id, x, y, size, vision_radius, light_radius, light_color, vision_mode, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, turn_effects, hidden, locked, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `tok_${Math.random().toString(16).slice(2, 14)}${Date.now().toString(16)}`,
        sceneId,
        token.name,
        token.image_url,
        token.character_id,
        token.monster_id,
        token.owner_id,
        token.x,
        token.y,
        token.size,
        token.vision_radius,
        token.light_radius,
        token.light_color,
        token.vision_mode,
        token.color,
        token.hp_current,
        token.hp_max,
        token.ac,
        token.initiative_bonus,
        token.group_id,
        token.group_name,
        token.conditions,
        token.turn_effects,
        token.hidden,
        token.locked,
        token.sort_order,
        ts,
        ts
      );
    }
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as SceneRow;
    const scene = serializeScene(row);
    broadcastScene(app, source.campaign_id, "scene:created", row);
    touchCampaign(source.campaign_id);
    return reply.code(201).send({ scene });
  });

  app.patch("/api/scenes/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
    if (!row) return reply.code(404).send({ error: "Scene not found." });
    if (getCampaignRole(row.campaign_id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit scenes." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = body.name === undefined ? row.name : safeString(body.name, row.name, 80);
    const imageUrl =
      body.imageUrl === undefined
        ? row.image_url
        : body.imageUrl
          ? safeString(body.imageUrl, "", 500)
          : null;
    const thumbnailUrl =
      body.thumbnailUrl === undefined
        ? row.thumbnail_url
        : body.thumbnailUrl
          ? safeString(body.thumbnailUrl, "", 500)
          : null;
    const width =
      body.width === undefined
        ? row.width
        : clamp(safeInt(body.width, row.width, 100, 10_000), 100, 10_000);
    const height =
      body.height === undefined
        ? row.height
        : clamp(safeInt(body.height, row.height, 100, 10_000), 100, 10_000);
    const gridSize =
      body.gridSize === undefined
        ? row.grid_size
        : clamp(safeInt(body.gridSize, row.grid_size, 20, 300), 20, 300);
    const gridOffsetX =
      body.gridOffsetX === undefined
        ? row.grid_offset_x
        : clamp(Number(body.gridOffsetX) || 0, -gridSize, gridSize);
    const gridOffsetY =
      body.gridOffsetY === undefined
        ? row.grid_offset_y
        : clamp(Number(body.gridOffsetY) || 0, -gridSize, gridSize);
    const fogEnabled = body.fogEnabled === undefined ? row.fog_enabled : body.fogEnabled ? 1 : 0;
    const losEnabled = body.losEnabled === undefined ? row.los_enabled : body.losEnabled ? 1 : 0;
    const wallCollision =
      body.wallCollision === undefined ? row.wall_collision : body.wallCollision ? 1 : 0;
    const ambientLight =
      body.ambientLight === undefined
        ? normalizeAmbientLight(row.ambient_light)
        : normalizeAmbientLight(body.ambientLight);
    const visionScope =
      body.visionScope === undefined
        ? normalizePartyVisionScope(row.vision_scope)
        : normalizePartyVisionScope(body.visionScope);
    const propCollision =
      body.propCollision === undefined ? row.prop_collision : body.propCollision ? 1 : 0;
    const visible = body.visible === undefined ? row.visible : body.visible ? 1 : 0;
    db.prepare(
      `UPDATE scenes SET name = ?, image_url = ?, thumbnail_url = ?, width = ?, height = ?, grid_size = ?, grid_offset_x = ?, grid_offset_y = ?, fog_enabled = ?, los_enabled = ?, wall_collision = ?, ambient_light = ?, vision_scope = ?, prop_collision = ?, visible = ?, updated_at = ? WHERE id = ?`
    ).run(
      name,
      imageUrl,
      thumbnailUrl,
      width,
      height,
      gridSize,
      gridOffsetX,
      gridOffsetY,
      fogEnabled,
      losEnabled,
      wallCollision,
      ambientLight,
      visionScope,
      propCollision,
      visible,
      now(),
      id
    );
    const updated = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow;
    const scene = serializeScene(updated);
    const wasVisible = row.visible !== 0;
    const isVisible = updated.visible !== 0;
    if (wasVisible && !isVisible) {
      const state = ensureState(row.campaign_id);
      if (state.active_scene_id === id) {
        const next = db
          .prepare(
            "SELECT id FROM scenes WHERE campaign_id = ? AND visible = 1 AND id <> ? ORDER BY sort_order ASC, created_at ASC LIMIT 1"
          )
          .get(row.campaign_id, id) as { id: string } | undefined;
        db.prepare(
          "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
        ).run(next?.id ?? null, now(), row.campaign_id);
        if (next) {
          app.broadcastCampaign(row.campaign_id, "scene:activated", { sceneId: next.id });
        }
      }
      app.broadcastCampaign(row.campaign_id, "scene:deleted", { sceneId: id }, "players");
      app.broadcastCampaign(row.campaign_id, "scene:updated", serializeScene(updated), "gm");
    } else if (!wasVisible && isVisible) {
      app.broadcastCampaign(
        row.campaign_id,
        "scene:created",
        serializeSceneForPlayers(updated),
        "players"
      );
      app.broadcastCampaign(row.campaign_id, "scene:updated", serializeScene(updated), "gm");
    } else {
      broadcastScene(app, row.campaign_id, "scene:updated", updated);
    }
    touchCampaign(row.campaign_id);
    return reply.send({ scene });
  });

  app.post("/api/scenes/:id/activate", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
    if (!row) return reply.code(404).send({ error: "Scene not found." });
    if (getCampaignRole(row.campaign_id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can change scenes." });
    }
    if (row.visible === 0) {
      return reply
        .code(400)
        .send({ error: "Make the scene visible to players before activating it." });
    }
    ensureState(row.campaign_id);
    db.prepare(
      "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
    ).run(id, now(), row.campaign_id);
    app.broadcastCampaign(row.campaign_id, "scene:activated", { sceneId: id });
    touchCampaign(row.campaign_id);
    return reply.send({ ok: true });
  });

  app.delete("/api/scenes/:id", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const row = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
    if (!row) return reply.code(404).send({ error: "Scene not found." });
    if (getCampaignRole(row.campaign_id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can delete scenes." });
    }
    db.prepare("DELETE FROM scenes WHERE id = ?").run(id);
    const remaining = db
      .prepare(
        "SELECT id FROM scenes WHERE campaign_id = ? AND visible = 1 ORDER BY sort_order ASC LIMIT 1"
      )
      .get(row.campaign_id) as { id: string } | undefined;
    const state = ensureState(row.campaign_id);
    if (state.active_scene_id === id) {
      db.prepare(
        "UPDATE campaign_state SET active_scene_id = ?, updated_at = ? WHERE campaign_id = ?"
      ).run(remaining?.id ?? null, now(), row.campaign_id);
      if (remaining)
        app.broadcastCampaign(row.campaign_id, "scene:activated", { sceneId: remaining.id });
    }
    // Remove initiative entries for the deleted scene and its cascaded tokens.
    const remainingTokenIds = new Set(
      (
        db
          .prepare(
            "SELECT id FROM tokens WHERE scene_id IN (SELECT id FROM scenes WHERE campaign_id = ?)"
          )
          .all(row.campaign_id) as { id: string }[]
      ).map((token) => token.id)
    );
    const entries = serializeInitiative(JSON.parse(state.initiative || "[]")).filter(
      (entry) => entry.sceneId !== id && (!entry.tokenId || remainingTokenIds.has(entry.tokenId))
    );
    const turnIndex = Math.max(0, Math.min(state.turn_index, Math.max(0, entries.length - 1)));
    db.prepare(
      "UPDATE campaign_state SET initiative = ?, turn_index = ?, updated_at = ? WHERE campaign_id = ?"
    ).run(JSON.stringify(entries), turnIndex, now(), row.campaign_id);
    const hiddenTokenIds = new Set(
      (
        db
          .prepare(
            `SELECT t.id FROM tokens t JOIN scenes s ON s.id = t.scene_id
             WHERE s.campaign_id = ? AND (t.hidden = 1 OR s.visible = 0)`
          )
          .all(row.campaign_id) as { id: string }[]
      ).map((token) => token.id)
    );
    const hiddenSceneIds = new Set(
      (
        db
          .prepare("SELECT id FROM scenes WHERE campaign_id = ? AND visible = 0")
          .all(row.campaign_id) as { id: string }[]
      ).map((scene) => scene.id)
    );
    const playerOrder = filterInitiativeForPlayers(
      entries,
      hiddenTokenIds,
      turnIndex,
      hiddenSceneIds
    );
    app.broadcastCampaign(
      row.campaign_id,
      "initiative:updated",
      { entries: playerOrder.entries, round: state.round, turnIndex: playerOrder.turnIndex },
      "players"
    );
    app.broadcastCampaign(
      row.campaign_id,
      "initiative:updated",
      { entries, round: state.round, turnIndex },
      "gm"
    );
    app.broadcastCampaign(row.campaign_id, "scene:deleted", { sceneId: id });
    touchCampaign(row.campaign_id);
    return reply.send({ ok: true });
  });
}
