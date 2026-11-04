import type { ChatMessage } from "./types";

export type ChatFilter = "all" | "talk" | "rolls" | "requests" | "private";

export function filterChatMessages(messages: ChatMessage[], filter: ChatFilter): ChatMessage[] {
  if (filter === "all") return messages;
  if (filter === "talk") return messages.filter((message) => message.type === "chat");
  if (filter === "rolls") return messages.filter((message) => message.type === "roll");
  if (filter === "requests") return messages.filter((message) => message.type === "request");
  return messages.filter((message) => message.visibility === "gm");
}

export function rollResponsesForRequest(
  messages: ChatMessage[],
  requestId: string,
): ChatMessage[] {
  return messages.filter(
    (message) =>
      message.type === "roll" &&
      message.data !== null &&
      "total" in message.data &&
      message.data.requestId === requestId,
  );
}
