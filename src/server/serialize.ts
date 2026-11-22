import type {
  AudioLibraryTrack,
  CampaignAudioState,
  CampaignAudioTrack,
  CampaignDashboard,
  CampaignJoinRequest,
  CampaignMember,
  CampaignNpc,
  CampaignFaction,
  CampaignKnowledgeEntry,
  CampaignPlayerNote,
  CampaignSession,
  CampaignSummary,
  CampaignTravel,
  CampaignSessionZero,
  SafetyPreference,
  SafetyResponse,
  CharacterRecord,
  ChatMessage,
  Encounter,
  EncounterCombatant,
  InitiativeEntry,
  JournalEntry,
  LootParcel,
  PathbuilderImportReport,
  RollRequest,
  RollResult,
  Scene,
  Token,
  ValidationIssue,
  XpAward,
} from "../shared/types";
import { normalizeCampaignRuleset, normalizeXpMode } from "../shared/content";
import { normalizeAdvancementSpeed, normalizeXpAwardKind } from "../shared/xp";
import { normalizeSettlementLevel, normalizeShopStockMode } from "../shared/shop";
import { normalizeTokenTurnEffects } from "../shared/tokenTurnEffects";
import { isAudioMood } from "../shared/audio";
import {
  normalizeAmbientLight,
  normalizeLightColor,
  normalizePartyVisionScope,
  normalizeTokenVisionMode,
} from "../shared/lighting";
import { normalizeLootItems } from "../shared/loot";
import {
  normalizeJournalAttachments,
  normalizeJournalKind,
  normalizeQuestStatus,
  normalizeQuestXp,
} from "../shared/journal";
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
  type AudioLibraryTrackRow,
  type CampaignDashboardRow,
  type AudioTrackRow,
  type CampaignNpcRow,
  type CampaignFactionRow,
  type CampaignKnowledgeRow,
  type CampaignPlayerNoteRow,
  type CampaignRow,
  type CampaignSessionRow,
  type CampaignSessionZeroRow,
  type CampaignSafetyPreferenceRow,
  type CampaignTravelRow,
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
  type XpAwardRow,
} from "./db";
import { parseJson } from "./util";
import { pendingJoinRequestCount, type JoinRequestViewRow } from "./access";
import { bumpCampaign } from "./revisions";
import { normalizeTokenConditions } from "../shared/tokens";
import { normalizeAoeTemplates } from "../shared/templates";
import { normalizeGolarionDate } from "../shared/calendar";
import {
  normalizeTravelActivities,
  normalizeTravelMiles,
  normalizeTravelTerrain,
  normalizeTravelWatches,
  normalizeTravelWeather,
  normalizeTravelSpeed,
  travelMilesPerDay,
  travelStatus,
} from "../shared/travel";
import { normalizeSessionZeroChecklist } from "../shared/sessionZero";
import { normalizeNpcAttitude, normalizeReputation } from "../shared/people";

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
    advancementSpeed: normalizeAdvancementSpeed(campaign.advancement_speed),
    settlementLevel: normalizeSettlementLevel(campaign.settlement_level),
    shopMode: normalizeShopStockMode(campaign.shop_mode),
    worldDate: normalizeGolarionDate({
      year: campaign.world_year,
      month: campaign.world_month,
      day: campaign.world_day,
    }),
    memberCount: counts.memberCount,
    characterCount: counts.characterCount,
    pendingJoinRequests: role === "gm" ? pendingJoinRequestCount(campaign.id) : undefined,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    lastPlayedAt: campaign.last_played_at,
  };
}

export function serializeCampaignTravel(
  row: CampaignTravelRow,
  characterIds: Set<string>
): CampaignTravel {
  const distanceMiles = normalizeTravelMiles(row.distance_miles);
  const progressMiles = Math.min(distanceMiles, normalizeTravelMiles(row.progress_miles));
  const partySpeed = normalizeTravelSpeed(row.party_speed);
  const terrain = normalizeTravelTerrain(row.terrain);
  return {
    campaignId: row.campaign_id,
    origin: row.origin,
    destination: row.destination,
    terrain,
    distanceMiles,
    progressMiles,
    partySpeed,
    weather: normalizeTravelWeather(row.weather),
    notes: row.notes,
    watches: normalizeTravelWatches(parseJson(row.watches, {}), characterIds),
    activities: normalizeTravelActivities(parseJson(row.activities, {}), characterIds),
    daysTravelled: Math.max(0, Math.round(row.days_travelled)),
    dailyMiles: travelMilesPerDay(partySpeed, terrain),
    status: travelStatus(distanceMiles, progressMiles),
    updatedAt: row.updated_at,
  };
}

export function serializeCampaignSessionZero(
  row: CampaignSessionZeroRow | null,
  campaignId: string,
  isGm: boolean
): CampaignSessionZero {
  const profile: CampaignSessionZero = {
    campaignId,
    pitch: row?.pitch ?? "",
    genre: row?.genre ?? "",
    tone: row?.tone ?? "",
    themes: row?.themes ?? "",
    expectations: row?.expectations ?? "",
    houseRules: row?.house_rules ?? "",
    contentLimits: row?.content_limits ?? "",
    safetyTools: row?.safety_tools ?? "",
    checklist: normalizeSessionZeroChecklist(parseJson(row?.checklist, {})),
    updatedAt: row?.updated_at ?? 0,
  };
  if (isGm) profile.gmNotes = row?.gm_notes ?? "";
  return profile;
}

export function serializeSafetyPreference(
  row: CampaignSafetyPreferenceRow | null
): SafetyPreference | null {
  if (!row) return null;
  return {
    lines: row.lines,
    veils: row.veils,
    notes: row.notes,
    anonymous: Boolean(row.anonymous),
    updatedAt: row.updated_at,
  };
}

export function serializeSafetyResponse(
  row: CampaignSafetyPreferenceRow,
  authorName: string | null,
  index: number
): SafetyResponse {
  return {
    id: `safety_${index}_${row.updated_at}`,
    authorName: row.anonymous ? null : authorName,
    anonymous: Boolean(row.anonymous),
    lines: row.lines,
    veils: row.veils,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export function serializeAudioTrack(row: AudioTrackRow): CampaignAudioTrack {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    url: row.url,
    mimeType: row.mime_type,
    size: row.size,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function serializeAudioLibraryTrack(
  row: AudioLibraryTrackRow,
  added = false
): AudioLibraryTrack {
  return {
    id: row.id,
    title: row.title,
    mood: isAudioMood(row.mood) ? row.mood : "exploration",
    url: row.url,
    mimeType: row.mime_type,
    size: row.size,
    author: row.author,
    license: row.license,
    sourceUrl: row.source_url,
    sortOrder: row.sort_order,
    ...(added ? { added: true } : {}),
  };
}

export function serializeAudioState(campaign: CampaignRow): CampaignAudioState {
  return {
    trackId: campaign.audio_track_id ?? null,
    playing: Boolean(campaign.audio_playing),
    position: Number(campaign.audio_position ?? 0),
    updatedAt: Number(campaign.audio_updated_at ?? 0),
    serverTime: Date.now(),
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

export function serializeJoinRequest(
  row: JoinRequestViewRow,
  validation: ValidationIssue[] = []
): CampaignJoinRequest {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    characterId: row.character_id,
    status: row.status,
    source: row.source,
    playerName: row.player_name,
    playerUsername: row.player_username,
    characterName: row.character_name ?? "Character",
    summary: parseJson(row.character_summary, null) as CampaignJoinRequest["summary"],
    report: parseJson(row.report, null) as PathbuilderImportReport | null,
    validation,
    createdAt: row.created_at,
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
    ? (db
        .prepare("SELECT ruleset, advancement_speed, settlement_level FROM campaigns WHERE id = ?")
        .get(row.campaign_id) as
        { ruleset: string; advancement_speed: string; settlement_level: number } | undefined)
    : undefined;
  const campaignRuleset = campaignRow ? normalizeCampaignRuleset(campaignRow.ruleset) : null;
  const campaignAdvancementSpeed = campaignRow
    ? normalizeAdvancementSpeed(campaignRow.advancement_speed)
    : null;
  const campaignSettlementLevel = campaignRow
    ? normalizeSettlementLevel(campaignRow.settlement_level)
    : null;
  return {
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    name: row.name,
    data: data as CharacterRecord["data"],
    summary: summary as CharacterRecord["summary"],
    campaignRuleset,
    campaignAdvancementSpeed,
    campaignSettlementLevel,
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
    wallCollision: Boolean(row.wall_collision),
    ambientLight: normalizeAmbientLight(row.ambient_light),
    visionScope: normalizePartyVisionScope(row.vision_scope),
    props: normalizeSceneProps(parseJson(row.props, [])),
    propCollision: Boolean(row.prop_collision),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Scene payload for players. GM-only props, walls, and templates are removed.
 * Visible walls remain for player line of sight; hidden walls are GM-only.
 */
export function serializeSceneForPlayers(row: SceneRow): Scene {
  const scene = serializeScene(row);
  return {
    ...scene,
    props: scene.props.filter((prop) => prop.visible),
    walls: scene.walls.filter((wall) => !wall.hidden),
    templates: scene.templates.filter((template) => !template.hidden),
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
    lightColor: normalizeLightColor(row.light_color),
    visionMode: normalizeTokenVisionMode(row.vision_mode),
    color: row.color,
    hpCurrent: row.hp_current,
    hpMax: row.hp_max,
    ac: row.ac,
    initiativeBonus: row.initiative_bonus ?? null,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    conditions: normalizeTokenConditions(parseJson(row.conditions, [])),
    turnEffects: normalizeTokenTurnEffects(parseJson(row.turn_effects, {})),
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
    questStatus: normalizeQuestStatus(row.quest_status),
    questXp: normalizeQuestXp(row.quest_xp),
    questRewardedAt: row.quest_rewarded_at ?? null,
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

export function serializeCampaignNpc(row: CampaignNpcRow, privateView = true): CampaignNpc {
  const npc: CampaignNpc = {
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
    description: privateView ? row.description : "",
    factionId: row.faction_id,
    role: row.role,
    location: row.location,
    attitude: normalizeNpcAttitude(row.attitude),
    publicDescription: row.public_description,
    visible: Boolean(row.visible),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (privateView) npc.secrets = row.secrets;
  return npc;
}

export function serializeCampaignFaction(
  row: CampaignFactionRow,
  privateView = true
): CampaignFaction {
  const faction: CampaignFaction = {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    goals: row.goals,
    assets: row.assets,
    attitude: normalizeNpcAttitude(row.attitude),
    reputation: normalizeReputation(row.reputation),
    visible: Boolean(row.visible),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (privateView) faction.gmNotes = row.gm_notes;
  return faction;
}

export function serializeCampaignPlayerNote(row: CampaignPlayerNoteRow): CampaignPlayerNote {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCampaignKnowledge(row: CampaignKnowledgeRow): CampaignKnowledgeEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    content: row.content,
    visible: Boolean(row.visible),
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

export function serializeXpAward(row: XpAwardRow): XpAward {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: normalizeXpAwardKind(row.kind),
    amount: Math.max(0, Math.round(row.amount)),
    reason: row.reason,
    recipientCount: Math.max(0, Math.round(row.recipient_count)),
    createdAt: row.created_at,
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
