import { describe, expect, it } from "vitest";
import {
  HAZARD_COMPLEXITIES,
  NPC_ATTITUDES,
  NPC_KINDS,
  normalizeHazardComplexity,
  normalizeNpcAttitude,
  normalizeNpcKind,
  normalizeReputation,
  npcAttitudeLabel,
  reputationLabel,
} from "../src/shared/people";

describe("NPC attitudes and faction standing", () => {
  it("normalizes the five PF2e attitudes", () => {
    expect(NPC_ATTITUDES.map((entry) => entry.id)).toEqual([
      "hostile",
      "unfriendly",
      "indifferent",
      "friendly",
      "helpful",
    ]);
    expect(normalizeNpcAttitude("friendly")).toBe("friendly");
    expect(normalizeNpcAttitude("helpful")).toBe("helpful");
    expect(normalizeNpcAttitude("unknown")).toBe("indifferent");
    expect(normalizeNpcAttitude(undefined)).toBe("indifferent");
    expect(npcAttitudeLabel("hostile")).toBe("Hostile");
  });

  it("normalizes NPC kinds and hazard complexity", () => {
    expect(NPC_KINDS.map((entry) => entry.id)).toEqual(["npc", "hazard"]);
    expect(HAZARD_COMPLEXITIES.map((entry) => entry.id)).toEqual(["complex", "simple"]);
    expect(normalizeNpcKind("hazard")).toBe("hazard");
    expect(normalizeNpcKind("monster")).toBe("npc");
    expect(normalizeHazardComplexity("simple")).toBe("simple");
    expect(normalizeHazardComplexity("deadly")).toBe("complex");
  });

  it("clamps reputation and labels the standing", () => {
    expect(normalizeReputation(150)).toBe(100);
    expect(normalizeReputation(-150)).toBe(-100);
    expect(normalizeReputation("25")).toBe(25);
    expect(normalizeReputation("nope")).toBe(0);
    expect(reputationLabel(-80)).toBe("Sworn enemy");
    expect(reputationLabel(-30)).toBe("Hostile");
    expect(reputationLabel(0)).toBe("Neutral");
    expect(reputationLabel(30)).toBe("Friendly");
    expect(reputationLabel(80)).toBe("Devoted ally");
  });
});
