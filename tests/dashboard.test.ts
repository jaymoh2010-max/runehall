import { describe, expect, it } from "vitest";
import { normalizeCampaignThreads, openThreadCount } from "../src/shared/dashboard";

describe("campaign dashboard threads", () => {
  it("trims text, drops empty rows, and defaults visibility", () => {
    expect(
      normalizeCampaignThreads([
        { id: "t1", text: "  Find the silver key  ", done: true },
        { text: "   " },
        { text: "Speak to the ferryman", visible: false },
        null,
      ])
    ).toEqual([
      { id: "t1", text: "Find the silver key", done: true, visible: true },
      { id: "thread_3", text: "Speak to the ferryman", done: false, visible: false },
    ]);
  });

  it("caps the list at fifty threads", () => {
    const threads = Array.from({ length: 80 }, (_, index) => ({ text: `Thread ${index}` }));
    expect(normalizeCampaignThreads(threads)).toHaveLength(50);
  });

  it("counts open threads", () => {
    expect(
      openThreadCount([
        { id: "1", text: "Open", done: false, visible: true },
        { id: "2", text: "Done", done: true, visible: true },
        { id: "3", text: "Also open", done: false, visible: false },
      ])
    ).toBe(2);
  });
});
