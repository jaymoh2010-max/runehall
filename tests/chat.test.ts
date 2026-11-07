import { describe, expect, it } from "vitest";
import type { ChatMessage, RollResult } from "../src/shared/types";
import { filterChatMessages, rollResponsesForRequest } from "../src/shared/chat";

function message(id: string, overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    campaignId: "camp",
    sceneId: null,
    userId: "user",
    authorName: "Tester",
    type: "chat",
    content: id,
    data: null,
    visibility: "all",
    createdAt: 1,
    ...overrides,
  };
}

const messages = [
  message("talk", { type: "chat" }),
  message("roll", { type: "roll" }),
  message("request", { type: "request" }),
  message("secret", { type: "chat", visibility: "gm" }),
];

describe("chat filters", () => {
  it("returns all messages for the all filter", () => {
    expect(filterChatMessages(messages, "all")).toHaveLength(4);
  });

  it("filters talk, rolls, and requests", () => {
    expect(filterChatMessages(messages, "talk").map((entry) => entry.id)).toEqual([
      "talk",
      "secret",
    ]);
    expect(filterChatMessages(messages, "rolls").map((entry) => entry.id)).toEqual(["roll"]);
    expect(filterChatMessages(messages, "requests").map((entry) => entry.id)).toEqual(["request"]);
  });

  it("filters GM-only messages", () => {
    expect(filterChatMessages(messages, "private").map((entry) => entry.id)).toEqual(["secret"]);
  });
});

describe("roll responses", () => {
  it("links rolls to the request they answer", () => {
    const roll: RollResult = {
      formula: "1d20",
      total: 17,
      terms: [],
      constants: [],
      breakdown: "17",
      d20: 17,
      dc: 15,
      degree: "success",
      label: "Group Stealth",
      requestId: "request-one",
    };
    const responses = [
      message("one", { type: "roll", data: roll }),
      message("two", { type: "roll", data: { ...roll, requestId: "other" } }),
      message("three", { type: "roll", data: { ...roll, requestId: null } }),
    ];
    expect(rollResponsesForRequest(responses, "request-one").map((entry) => entry.id)).toEqual([
      "one",
    ]);
  });
});
