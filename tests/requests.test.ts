import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_REQUEST_KINDS,
  campaignRequestDetail,
  campaignRequestStatusLabel,
  campaignRequestTitle,
  isCampaignRequestKind,
  isCampaignRequestStatus,
} from "../src/shared/requests";

describe("campaign request kinds", () => {
  it("accepts the three player-initiated actions", () => {
    expect(CAMPAIGN_REQUEST_KINDS).toEqual(["level-up", "downtime", "journal"]);
    for (const kind of CAMPAIGN_REQUEST_KINDS) {
      expect(isCampaignRequestKind(kind)).toBe(true);
    }
    expect(isCampaignRequestKind("delete-character")).toBe(false);
    expect(isCampaignRequestKind(null)).toBe(false);
  });

  it("accepts every resolution state", () => {
    for (const status of ["pending", "approved", "denied", "withdrawn"]) {
      expect(isCampaignRequestStatus(status)).toBe(true);
    }
    expect(isCampaignRequestStatus("cancelled")).toBe(false);
  });

  it("labels statuses for the request list", () => {
    expect(campaignRequestStatusLabel("pending")).toBe("Pending");
    expect(campaignRequestStatusLabel("approved")).toBe("Approved");
    expect(campaignRequestStatusLabel("denied")).toBe("Denied");
    expect(campaignRequestStatusLabel("withdrawn")).toBe("Withdrawn");
  });
});

describe("campaign request summaries", () => {
  it("names the exact level-up target", () => {
    expect(campaignRequestTitle({ kind: "level-up", characterName: "E2E Hero", toLevel: 3 })).toBe(
      "Level up E2E Hero to level 3"
    );
    expect(
      campaignRequestDetail({
        kind: "level-up",
        characterName: "E2E Hero",
        fromLevel: 2,
        toLevel: 3,
      })
    ).toBe("E2E Hero advances from level 2 to level 3.");
  });

  it("pluralizes downtime days", () => {
    expect(campaignRequestTitle({ kind: "downtime", days: 1 })).toBe("Grant 1 downtime day");
    expect(campaignRequestTitle({ kind: "downtime", days: 4 })).toBe("Grant 4 downtime days");
    expect(campaignRequestDetail({ kind: "downtime", characterName: "E2E Hero", days: 4 })).toBe(
      "4 downtime days for E2E Hero."
    );
  });

  it("uses the proposed journal title and a safe fallback", () => {
    expect(campaignRequestTitle({ kind: "journal", journalTitle: "Session 12 Recap" })).toBe(
      "Session 12 Recap"
    );
    expect(campaignRequestTitle({ kind: "journal", journalTitle: "  " })).toBe(
      "Journal entry proposal"
    );
  });
});
