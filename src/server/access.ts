import {
  db,
  type CampaignJoinRequestRow,
  type CampaignRow,
  type CharacterRow,
  type UserRow,
} from "./db";

export interface MembershipRow {
  campaign_id: string;
  user_id: string;
  role: "gm" | "player";
  joined_at: number;
}

export interface JoinRequestViewRow extends CampaignJoinRequestRow {
  player_name: string;
  player_username: string;
  character_name: string | null;
  character_summary: string | null;
}

export function getCampaign(campaignId: string): CampaignRow | null {
  return (
    (db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as
      CampaignRow | undefined) ?? null
  );
}

export function getMembership(campaignId: string, userId: string): MembershipRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_members WHERE campaign_id = ? AND user_id = ?")
      .get(campaignId, userId) as MembershipRow | undefined) ?? null
  );
}

export function getCampaignRole(campaignId: string, userId: string): "gm" | "player" | null {
  return getMembership(campaignId, userId)?.role ?? null;
}

export function isCampaignGm(campaignId: string, userId: string): boolean {
  return getCampaignRole(campaignId, userId) === "gm";
}

export function getUser(userId: string): UserRow | null {
  return (
    (db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined) ?? null
  );
}

export function getUserByUsername(username: string): UserRow | null {
  return (
    (db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined) ??
    null
  );
}

export function getCharacter(characterId: string): CharacterRow | null {
  return (
    (db.prepare("SELECT * FROM characters WHERE id = ?").get(characterId) as
      CharacterRow | undefined) ?? null
  );
}

export function canViewCharacter(character: CharacterRow, userId: string): boolean {
  if (character.user_id === userId) return true;
  if (!character.campaign_id) return canGmReviewJoinCharacter(character.id, userId);
  return Boolean(getMembership(character.campaign_id, userId));
}

export function canEditCharacter(character: CharacterRow, userId: string): boolean {
  if (character.user_id === userId) return true;
  if (!character.campaign_id) return false;
  return isCampaignGm(character.campaign_id, userId);
}

/**
 * Campaign advancement belongs to the GM. Characters outside a campaign are
 * advanced by their owner; campaign characters are advanced only by the GM.
 */
export function canAdvanceCharacter(character: CharacterRow, userId: string): boolean {
  if (!character.campaign_id) return character.user_id === userId;
  return isCampaignGm(character.campaign_id, userId);
}

/** A GM may inspect an unassigned character while reviewing its pending request. */
export function canGmReviewJoinCharacter(characterId: string, userId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 AS allowed
         FROM campaign_join_requests r
         JOIN campaigns c ON c.id = r.campaign_id
         WHERE r.character_id = ? AND r.status = 'pending' AND c.gm_id = ?
         LIMIT 1`
      )
      .get(characterId, userId)
  );
}

export function getJoinRequest(requestId: string): CampaignJoinRequestRow | null {
  return (
    (db.prepare("SELECT * FROM campaign_join_requests WHERE id = ?").get(requestId) as
      CampaignJoinRequestRow | undefined) ?? null
  );
}

export function pendingJoinRequest(campaignId: string, userId: string): JoinRequestViewRow | null {
  return (
    (db
      .prepare(
        `SELECT r.*, u.display_name AS player_name, u.username AS player_username,
                c.name AS character_name, c.summary AS character_summary
         FROM campaign_join_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN characters c ON c.id = r.character_id
         WHERE r.campaign_id = ? AND r.user_id = ? AND r.status = 'pending'
         LIMIT 1`
      )
      .get(campaignId, userId) as JoinRequestViewRow | undefined) ?? null
  );
}

export function campaignJoinRequests(campaignId: string): JoinRequestViewRow[] {
  return db
    .prepare(
      `SELECT r.*, u.display_name AS player_name, u.username AS player_username,
              c.name AS character_name, c.summary AS character_summary
       FROM campaign_join_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN characters c ON c.id = r.character_id
       WHERE r.campaign_id = ? AND r.status = 'pending'
       ORDER BY r.created_at ASC`
    )
    .all(campaignId) as JoinRequestViewRow[];
}

export function pendingJoinRequestCount(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM campaign_join_requests WHERE campaign_id = ? AND status = 'pending'"
    )
    .get(campaignId) as { count: number };
  return Number(row?.count ?? 0);
}

export function campaignMemberCount(campaignId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM campaign_members WHERE campaign_id = ?")
    .get(campaignId) as { count: number };
  return Number(row?.count ?? 0);
}

export function campaignCharacterCount(campaignId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM characters WHERE campaign_id = ?")
    .get(campaignId) as { count: number };
  return Number(row?.count ?? 0);
}

export function campaignMembers(campaignId: string) {
  return db
    .prepare(
      `SELECT u.*, m.role, m.joined_at
       FROM campaign_members m JOIN users u ON u.id = m.user_id
       WHERE m.campaign_id = ?
       ORDER BY m.role DESC, u.display_name ASC`
    )
    .all(campaignId) as (UserRow & { role: "gm" | "player"; joined_at: number })[];
}

export function campaignCharacters(campaignId: string) {
  return db
    .prepare(
      `SELECT c.*, u.display_name AS owner_name
       FROM characters c JOIN users u ON u.id = c.user_id
       WHERE c.campaign_id = ?
       ORDER BY c.name ASC`
    )
    .all(campaignId) as (CharacterRow & { owner_name: string })[];
}
