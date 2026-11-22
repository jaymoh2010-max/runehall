import { describe, expect, it } from "vitest";
import {
  CHAPTER_STATUSES,
  chapterStatusLabel,
  normalizeChapterLevel,
  normalizeChapterStatus,
} from "../src/shared/chapters";

describe("adventure arc chapters", () => {
  it("normalizes statuses", () => {
    expect(CHAPTER_STATUSES.map((entry) => entry.id)).toEqual(["planned", "active", "complete"]);
    expect(normalizeChapterStatus("active")).toBe("active");
    expect(normalizeChapterStatus("complete")).toBe("complete");
    expect(normalizeChapterStatus("nonsense")).toBe("planned");
    expect(chapterStatusLabel("active")).toBe("Active");
  });

  it("clamps chapter levels to the PF2e range", () => {
    expect(normalizeChapterLevel(0)).toBe(1);
    expect(normalizeChapterLevel(21)).toBe(20);
    expect(normalizeChapterLevel("7")).toBe(7);
    expect(normalizeChapterLevel("nope", 4)).toBe(4);
  });
});
