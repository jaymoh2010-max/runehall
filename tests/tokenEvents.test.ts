import { describe, expect, it } from "vitest";
import { tokenBroadcaster } from "../src/server/tokenEvents";
import type { Token } from "../src/shared/types";

const token = (overrides: Partial<Token> = {}): Token => ({
  id: "tok_hidden",
  sceneId: "scene_1",
  name: "Lurker",
  imageUrl: null,
  characterId: null,
  ownerId: null,
  x: 100,
  y: 100,
  size: 1,
  visionRadius: 60,
  lightRadius: 0,
  lightColor: "#ffffff",
  visionMode: "normal",
  color: "#a34a4a",
  hpCurrent: 10,
  hpMax: 10,
  ac: 15,
  initiativeBonus: null,
  groupId: null,
  groupName: null,
  conditions: [],
  hidden: true,
  locked: false,
  sortOrder: 0,
  ...overrides,
});

function collect() {
  const events: { event: string; target: string | undefined; payload: unknown }[] = [];
  const eventsFor = tokenBroadcaster((event, payload, target) => {
    events.push({ event, target, payload });
  });
  return { events, eventsFor };
}

describe("hidden token broadcasts", () => {
  it("sends hidden token creation only to the GM", () => {
    const { events, eventsFor } = collect();
    eventsFor.created(token());
    expect(events).toEqual([
      {
        event: "token:created",
        target: "gm",
        payload: expect.objectContaining({ id: "tok_hidden" }),
      },
    ]);
  });

  it("sends visible token creation to everyone", () => {
    const { events, eventsFor } = collect();
    eventsFor.created(token({ hidden: false }));
    expect(events[0].target).toBe("all");
  });

  it("treats hiding and showing as delete/create for players", () => {
    const { events, eventsFor } = collect();
    eventsFor.updated(token({ hidden: true }), false);
    expect(events).toEqual([
      { event: "token:updated", target: "gm", payload: expect.objectContaining({ hidden: true }) },
      {
        event: "token:deleted",
        target: "players",
        payload: { tokenId: "tok_hidden", sceneId: "scene_1" },
      },
    ]);

    events.length = 0;
    eventsFor.updated(token({ hidden: false }), true);
    expect(events).toEqual([
      { event: "token:updated", target: "gm", payload: expect.objectContaining({ hidden: false }) },
      {
        event: "token:created",
        target: "players",
        payload: expect.objectContaining({ hidden: false }),
      },
    ]);
  });

  it("does not send updates or moves for an unchanged hidden token to players", () => {
    const { events, eventsFor } = collect();
    eventsFor.updated(token(), true);
    eventsFor.moved({ tokenId: "tok_hidden", sceneId: "scene_1", x: 200, y: 100 }, true);
    expect(events.map((entry) => entry.target)).toEqual(["gm", "gm"]);
  });

  it("broadcasts visible updates, moves, and deletions to everyone", () => {
    const { events, eventsFor } = collect();
    eventsFor.updated(token({ hidden: false }), false);
    eventsFor.moved({ tokenId: "tok_hidden", sceneId: "scene_1", x: 200, y: 100 }, false);
    eventsFor.deleted({ tokenId: "tok_hidden", sceneId: "scene_1" }, false);
    expect(events.map((entry) => entry.target)).toEqual(["all", "all", "all"]);
  });
});
