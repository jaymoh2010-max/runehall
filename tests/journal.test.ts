import { describe, expect, it } from "vitest";
import {
  isJournalKind,
  normalizeJournalAttachments,
  normalizeJournalKind,
  normalizeQuestStatus,
  normalizeQuestXp,
} from "../src/shared/journal";

describe("journal kinds", () => {
  it("accepts notes and handouts only", () => {
    expect(isJournalKind("note")).toBe(true);
    expect(isJournalKind("handout")).toBe(true);
    expect(isJournalKind("attachment")).toBe(false);
    expect(normalizeJournalKind("handout")).toBe("handout");
    expect(normalizeJournalKind("nonsense")).toBe("note");
  });
});

describe("journal quest rewards", () => {
  it("accepts known quest states and defaults the rest to none", () => {
    expect(normalizeQuestStatus("active")).toBe("active");
    expect(normalizeQuestStatus("completed")).toBe("completed");
    expect(normalizeQuestStatus("failed")).toBe("failed");
    expect(normalizeQuestStatus("none")).toBe("none");
    expect(normalizeQuestStatus("nonsense")).toBe("none");
  });

  it("clamps XP rewards to a sane range", () => {
    expect(normalizeQuestXp(30)).toBe(30);
    expect(normalizeQuestXp(-10)).toBe(0);
    expect(normalizeQuestXp(5000)).toBe(1000);
    expect(normalizeQuestXp("40")).toBe(0);
    expect(normalizeQuestXp(12.6)).toBe(13);
  });
});

describe("journal attachments", () => {
  it("keeps local image uploads and fills safe defaults", () => {
    expect(
      normalizeJournalAttachments([
        { id: "att_1", name: "Map", url: "/uploads/map.png", mimeType: "image/png" },
        { url: "/uploads/letter.jpg" },
      ])
    ).toEqual([
      { id: "att_1", name: "Map", url: "/uploads/map.png", mimeType: "image/png" },
      { id: "att_2", name: "Handout image", url: "/uploads/letter.jpg", mimeType: "image/*" },
    ]);
  });

  it("rejects external URLs and duplicate uploads", () => {
    expect(
      normalizeJournalAttachments([
        { url: "https://example.com/tracker.png" },
        { url: "javascript:alert(1)" },
        { url: "/uploads/map.png" },
        { url: "/uploads/map.png" },
        { url: "/uploads/../../secret.png" },
      ])
    ).toEqual([
      { id: "att_3", name: "Handout image", url: "/uploads/map.png", mimeType: "image/*" },
    ]);
  });

  it("caps attachments at twelve", () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      url: `/uploads/image-${index}.png`,
    }));
    expect(normalizeJournalAttachments(items)).toHaveLength(12);
  });
});
