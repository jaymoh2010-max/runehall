import { describe, expect, it } from "vitest";
import {
  isJournalKind,
  normalizeJournalAttachments,
  normalizeJournalKind,
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

describe("journal attachments", () => {
  it("keeps local image uploads and fills safe defaults", () => {
    expect(
      normalizeJournalAttachments([
        { id: "att_1", name: "Map", url: "/uploads/map.png", mimeType: "image/png" },
        { url: "/uploads/letter.jpg" },
      ]),
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
      ]),
    ).toEqual([{ id: "att_3", name: "Handout image", url: "/uploads/map.png", mimeType: "image/*" }]);
  });

  it("caps attachments at twelve", () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      url: `/uploads/image-${index}.png`,
    }));
    expect(normalizeJournalAttachments(items)).toHaveLength(12);
  });
});
