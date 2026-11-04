import { describe, expect, it } from "vitest";
import { revisionAction } from "../src/shared/revisions";

describe("campaign revision actions", () => {
  it("ignores stale and duplicate revisions", () => {
    expect(revisionAction(5, 5)).toBe("ignore");
    expect(revisionAction(5, 4)).toBe("ignore");
    expect(revisionAction(5, Number.NaN)).toBe("ignore");
  });

  it("applies the next revision", () => {
    expect(revisionAction(5, 6)).toBe("apply");
    expect(revisionAction(0, 1)).toBe("apply");
  });

  it("refetches when a revision was missed", () => {
    expect(revisionAction(5, 8)).toBe("refetch");
    expect(revisionAction(0, 2)).toBe("refetch");
  });
});
