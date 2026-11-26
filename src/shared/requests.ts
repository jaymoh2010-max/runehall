import type { CampaignRequestKind, CampaignRequestStatus } from "./types";

export const CAMPAIGN_REQUEST_KINDS: CampaignRequestKind[] = ["level-up", "journal"];

export const CAMPAIGN_REQUEST_STATUSES: CampaignRequestStatus[] = [
  "pending",
  "approved",
  "denied",
  "withdrawn",
];

export const CAMPAIGN_REQUEST_KIND_LABELS: Record<CampaignRequestKind, string> = {
  "level-up": "Level up",
  journal: "Journal entry",
};

export function isCampaignRequestKind(value: unknown): value is CampaignRequestKind {
  return typeof value === "string" && (CAMPAIGN_REQUEST_KINDS as string[]).includes(value);
}

export function isCampaignRequestStatus(value: unknown): value is CampaignRequestStatus {
  return typeof value === "string" && (CAMPAIGN_REQUEST_STATUSES as string[]).includes(value);
}

export function campaignRequestStatusLabel(status: CampaignRequestStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Pending";
  }
}

/** Human-readable one-line summary stored with the request. */
export function campaignRequestTitle(input: {
  kind: CampaignRequestKind;
  characterName?: string;
  toLevel?: number;
  journalTitle?: string;
}): string {
  switch (input.kind) {
    case "level-up": {
      const name = input.characterName?.trim() || "Character";
      return input.toLevel ? `Level up ${name} to level ${input.toLevel}` : `Level up ${name}`;
    }
    default:
      return input.journalTitle?.trim() || "Journal entry proposal";
  }
}

/** A compact description of what approval will do. */
export function campaignRequestDetail(input: {
  kind: CampaignRequestKind;
  characterName?: string;
  fromLevel?: number;
  toLevel?: number;
}): string {
  switch (input.kind) {
    case "level-up":
      return input.fromLevel
        ? `${input.characterName ?? "Character"} advances from level ${input.fromLevel} to level ${input.toLevel ?? input.fromLevel + 1}.`
        : `${input.characterName ?? "Character"} advances one level.`;
    default:
      return "A player-written journal entry will be published to the campaign chronicle.";
  }
}
