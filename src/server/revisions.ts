import { db } from "./db";
import { now } from "./util";

type RevisionBroadcaster = (campaignId: string, revision: number) => void;

let broadcaster: RevisionBroadcaster | null = null;

/**
 * The server registers a socket broadcaster at boot. Keeping it behind a
 * callback avoids importing Socket.IO types into the persistence layer.
 */
export function setRevisionBroadcaster(next: RevisionBroadcaster | null): void {
  broadcaster = next;
}

export function campaignRevision(campaignId: string): number {
  const row = db
    .prepare("SELECT revision FROM campaigns WHERE id = ?")
    .get(campaignId) as { revision: number } | undefined;
  return Number(row?.revision ?? 0);
}

/**
 * Persist a campaign change and increment its revision. Every table mutation
 * should flow through here or through touchCampaign so clients can detect a
 * missed socket event and refetch the authoritative snapshot.
 */
export function bumpCampaign(campaignId: string): number {
  const ts = now();
  db.prepare(
    "UPDATE campaigns SET updated_at = ?, last_played_at = ?, revision = revision + 1 WHERE id = ?",
  ).run(ts, ts, campaignId);
  const revision = campaignRevision(campaignId);
  broadcaster?.(campaignId, revision);
  return revision;
}
