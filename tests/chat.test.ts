import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../src/shared/types";
import { filterChatMessages } from "../src/shared/chat";

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
    expect(filterChatMessages(messages, "talk").map((entry) => entry.id)).toEqual(["talk", "secret"]);
    expect(filterChatMessages(messages, "rolls").map((entry) => entry.id)).toEqual(["roll"]);
    expect(filterChatMessages(messages, "requests").map((entry) => entry.id)).toEqual(["request"]);
  });

  it("filters GM-only messages", () => {
    expect(filterChatMessages(messages, "private").map((entry) => entry.id)).toEqual(["secret"]);
  });
});
