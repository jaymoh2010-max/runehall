import { campaignMembers } from "./access";
import { db, type CampaignSessionRow, type SessionAttendanceRow } from "./db";
import { serializeCampaignSession } from "./serialize";

export function campaignSessionsFor(
  campaignId: string,
  role: "gm" | "player",
  userId: string,
) {
  const sessions = db
    .prepare(
      "SELECT * FROM campaign_sessions WHERE campaign_id = ? ORDER BY scheduled_at ASC, created_at ASC",
    )
    .all(campaignId) as CampaignSessionRow[];
  if (!sessions.length) return [];
  const attendance = db
    .prepare(
      `SELECT a.* FROM session_attendance a
       JOIN campaign_sessions s ON s.id = a.session_id
       WHERE s.campaign_id = ?`,
    )
    .all(campaignId) as SessionAttendanceRow[];
  const bySession = new Map<string, SessionAttendanceRow[]>();
  for (const row of attendance) {
    const rows = bySession.get(row.session_id) ?? [];
    rows.push(row);
    bySession.set(row.session_id, rows);
  }
  const members = campaignMembers(campaignId);
  return sessions.map((session) =>
    serializeCampaignSession(
      session,
      members,
      bySession.get(session.id) ?? [],
      role,
      userId,
    ),
  );
}
