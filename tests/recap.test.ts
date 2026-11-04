import { describe, expect, it } from "vitest";
import { buildSessionRecap } from "../src/shared/recap";
import type {
  CampaignSession,
  CampaignThread,
  ChatMessage,
  JournalEntry,
  LootParcel,
} from "../src/shared/types";

const FROM = 1_700_000_000_000;
const TO = FROM + 4 * 60 * 60 * 1000;

function message(
  id: string,
  type: ChatMessage["type"],
  visibility: ChatMessage["visibility"],
  data: ChatMessage["data"],
  createdAt = FROM + 60_000,
): ChatMessage {
  return {
    id,
    campaignId: "camp_1",
    sceneId: null,
    userId: null,
    authorName: "Mira",
    type,
    content: `Message ${id}`,
    data,
    visibility,
    createdAt,
  };
}

function roll(
  id: string,
  label: string,
  total: number,
  degree: "critical-success" | "success" | "failure" | "critical-failure",
  dc: number | null = 15,
  authorName = "Mira",
): ChatMessage {
  return {
    ...message(id, "roll", "all", {
      formula: "1d20+7",
      total,
      terms: [],
      constants: [],
      breakdown: `1d20 + 7`,
      d20: 10,
      dc,
      degree,
      label,
    }),
    authorName,
  };
}

function journalEntry(
  id: string,
  title: string,
  kind: JournalEntry["kind"],
  visible: boolean,
  updatedAt = FROM + 120_000,
): JournalEntry {
  return {
    id,
    campaignId: "camp_1",
    title,
    content: "",
    visible,
    kind,
    attachments: [],
    createdBy: null,
    authorName: "The GM",
    createdAt: updatedAt,
    updatedAt,
  };
}

function parcel(
  id: string,
  name: string,
  status: LootParcel["status"],
  updatedAt = FROM + 180_000,
): LootParcel {
  return {
    id,
    campaignId: "camp_1",
    name,
    description: "",
    items: [{ itemId: "silver-key", name: "Silver key", quantity: 2 }],
    gp: 12,
    sp: 0,
    cp: 0,
    status,
    distributedTo: status === "distributed" ? "user_1" : null,
    distributedToName: status === "distributed" ? "Mira" : null,
    distributedAt: status === "distributed" ? updatedAt : null,
    sortOrder: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

const session: Pick<CampaignSession, "title" | "scheduledAt" | "attendance"> = {
  title: "The Drowned Vault",
  scheduledAt: FROM,
  attendance: [
    {
      userId: "user_1",
      displayName: "Mira",
      avatarUrl: null,
      status: "attended",
      note: "",
    },
    {
      userId: "user_2",
      displayName: "Cora",
      avatarUrl: null,
      status: "absent",
      note: "",
    },
  ],
};

const threads: CampaignThread[] = [
  { id: "t1", text: "Find the key's second half", done: false, visible: true },
  { id: "t2", text: "Secret GM thread", done: false, visible: false },
  { id: "t3", text: "Finished thread", done: true, visible: true },
];

describe("session recap", () => {
  it("builds a player-safe draft from the selected window", () => {
    const recap = buildSessionRecap({
      campaignId: "camp_1",
      campaignName: "Rising Tides",
      from: FROM,
      to: TO,
      session,
      messages: [
        roll("m1", "Climb the wall", 24, "success", 15, "Mira"),
        roll("m2", "Disable Device", 4, "critical-failure", 20, "Bram"),
        message("m3", "chat", "all", null),
        message("m4", "roll", "gm", {
          formula: "1d20",
          total: 30,
          terms: [],
          constants: [],
          breakdown: "1d20",
          d20: 20,
          dc: 10,
          degree: "critical-success",
          label: "Secret roll",
        }),
      ],
      journal: [
        journalEntry("j1", "The ferryman's ledger", "handout", true),
        journalEntry("j2", "Hidden handout", "handout", false),
        journalEntry("j3", "Old note", "note", true, FROM - 60_000),
      ],
      loot: [parcel("l1", "Vault parcel", "distributed")],
      threads,
    });

    expect(recap.stats).toEqual({
      messages: 3,
      rolls: 2,
      successes: 1,
      failures: 0,
      criticalSuccesses: 0,
      criticalFailures: 1,
      journalEntries: 1,
      handouts: 1,
      lootParcels: 1,
      openThreads: 1,
    });
    expect(recap.sessionTitle).toBe("The Drowned Vault");
    expect(recap.draft).toContain("# Session recap — Rising Tides");
    expect(recap.draft).toContain("The Drowned Vault");
    expect(recap.draft).toContain("Present:** Mira");
    expect(recap.draft).not.toContain("Cora");
    expect(recap.draft).toContain("Climb the wall");
    expect(recap.draft).toContain("critical failure");
    expect(recap.draft).toContain("The ferryman's ledger");
    expect(recap.draft).toContain("Vault parcel");
    expect(recap.draft).toContain("2× Silver key");
    expect(recap.draft).toContain("12 gp");
    expect(recap.draft).toContain("distributed to Mira");
    expect(recap.draft).toContain("Find the key's second half");
    expect(recap.draft).not.toContain("Secret roll");
    expect(recap.draft).not.toContain("Hidden handout");
    expect(recap.draft).not.toContain("Secret GM thread");
    expect(recap.draft).not.toContain("Old note");
  });

  it("keeps a usable outline when the window has no activity", () => {
    const recap = buildSessionRecap({
      campaignId: "camp_1",
      campaignName: "Rising Tides",
      from: FROM,
      to: TO,
      session: null,
      messages: [],
      journal: [],
      loot: [],
      threads: [],
    });

    expect(recap.stats.rolls).toBe(0);
    expect(recap.draft).toContain("## What happened");
    expect(recap.draft).toContain("_Add the story beats here._");
    expect(recap.draft).not.toContain("## Moments at the table");
    expect(recap.draft).not.toContain("## Loose ends");
  });
});
