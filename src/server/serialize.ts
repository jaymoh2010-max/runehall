import type {
  CampaignDashboard,
  CampaignMember,
  CampaignNpc,
  CampaignSession,
  CampaignSummary,
  CharacterRecord,
  ChatMessage,
  Encounter,
  EncounterCombatant,
  InitiativeEntry,
  JournalEntry,
  LootParcel,
  RollRequest,
  RollResult,
  Scene,
  Token,
} from "../shared/types";
import { normalizeCampaignRuleset, normalizeXpMode } from "../shared/content";
import {
  normalizeAmbientLight,
  normalizePartyVisionScope,
  normalizeTokenVisionMode,
} from "../shared/lighting";
import { normalizeLootItems } from "../shared/loot";
import { normalizeJournalAttachments, normalizeJournalKind } from "../shared/journal";
import { normalizeCampaignThreads } from "../shared/dashboard";
import { normalizeWalls } from "../shared/walls";
import { normalizeSceneProps } from "../shared/props";
import {
  isSessionCheckinStatus,
  normalizeAttendanceStatus,
  normalizeSessionAgenda,
  normalizeSessionStatus,
} from "../shared/sessions";
import {
  db,
  type CampaignDashboardRow,
  type CampaignNpcRow,
  type CampaignRow,
  type CampaignSessionRow,
  type CharacterRow,
  type EncounterCombatantRow,
  type EncounterRow,
  type JournalRow,
  type LootParcelRow,
  type MessageRow,
  type SessionAttendanceRow,
  type SessionCheckinRow,
  type SceneRow,
  type TokenRow,
  type UserRow,
} from "./db";
import { parseJson } from "./util";
import { bumpCampaign } from "./revisions";
import { normalizeTokenConditions } from "../shared/tokens";
import { normalizeAoeTemplates } from "../shared/templates";

export function serializeCampaignSummary(
  campaign: CampaignRow,
  role: "gm" | "player",
  counts: { memberCount: number; characterCount: number },
  gmName = ""
): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    gmId: campaign.gm_id,
    gmName,
    inviteCode: role === "gm" ? campaign.invite_code : "",
    role,
    ruleset: normalizeCampaignRuleset(campaign.ruleset),
    xpMode: normalizeXpMode(campaign.xp_mode),
    memberCount: counts.memberCount,
    characterCount: counts.characterCount,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    lastPlayedAt: campaign.last_played_at,
  };
}

export function serializeMember(
  user: UserRow,
  role: "gm" | "player",
  joinedAt: number
): CampaignMember {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    isAdmin: Boolean(user.is_admin),
    role,
    joinedAt,
  };
}

export function serializeCharacter(
  row: CharacterRow,
  ownerName = "",
  permissions?: CharacterRecord["permissions"]
): CharacterRecord {
  const data = parseJson(row.data, {});
  const summary = parseJson(row.summary, null);
  const campaignRow = row.campaign_id
    ? (db.prepare("SELECT ruleset FROM campaigns WHERE id = ?").get(row.campaign_id) as
        { ruleset: string } | undefined)
    : undefined;
  const campaignRuleset = campaignRow ? normalizeCampaignRuleset(campaignRow.ruleset) : null;
  return {
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    name: row.name,
    data: data as CharacterRecord["data"],
    summary: summary as CharacterRecord["summary"],
    campaignRuleset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision ?? 1),
    ownerName,
    permissions,
  };
}

export function serializeScene(row: SceneRow): Scene {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url ?? null,
    width: row.width,
    height: row.height,
    gridSize: row.grid_size,
    gridOffsetX: row.grid_offset_x,
    gridOffsetY: row.grid_offset_y,
    fogEnabled: Boolean(row.fog_enabled),
    revealed: parseJson<string[]>(row.fog_revealed, []),
    templates: normalizeAoeTemplates(parseJson(row.templates, [])),
    walls: normalizeWalls(parseJson(row.walls, [])),
    losEnabled: Boolean(row.los_enabled),
    ambientLight: normalizeAmbientLight(row.ambient_light),
    visionScope: normalizePartyVisionScope(row.vision_scope),
    props: normalizeSceneProps(parseJson(row.props, [])),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeToken(row: TokenRow, ownerName?: string): Token {
  return {
    id: row.id,
    sceneId: row.scene_id,
    name: row.name,
    imageUrl: row.image_url,
    characterId: row.character_id,
    ownerId: row.owner_id,
    ownerName,
    x: row.x,
    y: row.y,
    size: row.size,
    visionRadius: Number(row.vision_radius ?? 60),
    lightRadius: Number(row.light_radius ?? 0),
    visionMode: normalizeTokenVisionMode(row.vision_mode),
    color: row.color,
    hpCurrent: row.hp_current,
    hpMax: row.hp_max,
    ac: row.ac,
    initiativeBonus: row.initiative_bonus ?? null,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    conditions: normalizeTokenConditions(parseJson(row.conditions, [])),
    hidden: Boolean(row.hidden),
    locked: Boolean(row.locked),
    sortOrder: row.sort_order,
  };
}

export function serializeMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sceneId: row.scene_id,
    userId: row.user_id,
    authorName: row.author_name,
    type: row.type as ChatMessage["type"],
    content: row.content,
    data: parseJson<RollResult | RollRequest | null>(row.data, null),
    visibility: row.visibility as ChatMessage["visibility"],
    createdAt: row.created_at,
  };
}

export function serializeJournal(row: JournalRow & { author_name?: string | null }): JournalEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    content: row.content,
    visible: Boolean(row.visible),
    kind: normalizeJournalKind(row.kind),
    attachments: normalizeJournalAttachments(parseJson(row.attachments, [])),
    createdBy: row.created_by,
    authorName: row.author_name || "The GM",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeEncounterCombatant(row: EncounterCombatantRow): EncounterCombatant {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    monsterId: row.monster_id,
    name: row.name,
    level: row.level,
    count: row.count,
    hp: row.hp,
    ac: row.ac,
    perception: row.perception,
    notes: row.notes,
    wave: Math.max(1, Math.round(row.wave ?? 1)),
    sortOrder: row.sort_order,
  };
}

export function encounterCombatants(encounterId: string): EncounterCombatant[] {
  return (
    db
      .prepare(
        "SELECT * FROM encounter_combatants WHERE encounter_id = ? ORDER BY sort_order ASC, created_at ASC"
      )
      .all(encounterId) as EncounterCombatantRow[]
  ).map(serializeEncounterCombatant);
}

export function serializeEncounter(row: EncounterRow): Encounter {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    sceneId: row.scene_id,
    combatants: encounterCombatants(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCampaignSession(
  row: CampaignSessionRow,
  members: { id: string; display_name: string; avatar_url: string | null }[],
  attendanceRows: SessionAttendanceRow[],
  checkinRows: SessionCheckinRow[],
  role: "gm" | "player",
  userId: string
): CampaignSession {
  const attendanceByUser = new Map(attendanceRows.map((entry) => [entry.user_id, entry]));
  const checkinByUser = new Map(checkinRows.map((entry) => [entry.user_id, entry]));
  const visibleMembers = role === "gm" ? members : members.filter((member) => member.id === userId);
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    notes: role === "gm" ? row.notes : "",
    agenda: role === "gm" ? normalizeSessionAgenda(parseJson(row.agenda, [])) : [],
    status: normalizeSessionStatus(row.status),
    attendance: visibleMembers.map((member) => {
      const attendance = attendanceByUser.get(member.id);
      return {
        userId: member.id,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        status: normalizeAttendanceStatus(attendance?.status),
        note: attendance?.note ?? "",
      };
    }),
    checkins: members.map((member) => {
      const checkin = checkinByUser.get(member.id);
      return {
        userId: member.id,
        displayName: member.display_name,
        avatarUrl: member.avatar_url,
        status: isSessionCheckinStatus(checkin?.status) ? checkin.status : "unanswered",
      };
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCampaignNpc(row: CampaignNpcRow): CampaignNpc {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    level: row.level,
    hp: row.hp,
    ac: row.ac,
    perception: row.perception,
    size: row.size,
    color: row.color,
    imageUrl: row.image_url,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCampaignDashboard(
  row: CampaignDashboardRow,
  role: "gm" | "player"
): CampaignDashboard {
  const threads = normalizeCampaignThreads(parseJson(row.threads, []));
  return {
    campaignId: row.campaign_id,
    lastSessionSummary: row.last_session_summary,
    nextSessionAt: row.next_session_at,
    nextSessionTeaser: row.next_session_teaser,
    nextSessionNotes: role === "gm" ? row.next_session_notes : "",
    threads: role === "gm" ? threads : threads.filter((thread) => thread.visible),
    updatedAt: row.updated_at,
  };
}

export function serializeLootParcel(row: LootParcelRow): LootParcel {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    items: normalizeLootItems(parseJson(row.items, [])),
    gp: Math.max(0, row.gp),
    sp: Math.max(0, row.sp),
    cp: Math.max(0, row.cp),
    status: row.status === "distributed" ? "distributed" : "open",
    distributedTo: row.distributed_to,
    distributedToName: row.distributed_to_name,
    distributedAt: row.distributed_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeInitiative(value: unknown): InitiativeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is InitiativeEntry => {
    return (
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as InitiativeEntry).id === "string"
    );
  });
}

export function touchCampaign(campaignId: string): number {
  return bumpCampaign(campaignId);
}
