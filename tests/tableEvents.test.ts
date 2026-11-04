import { describe, expect, it } from "vitest";
import type { CharacterRecord, ChatMessage, Scene, Token } from "../src/shared/types";
import {
  applyCharacterCreated,
  applyCharacterUpdated,
  applyChatMessage,
  applyFogUpdated,
  applySceneCreated,
  applySceneDeleted,
  applySceneUpdated,
  applyTokenCreated,
  applyTokenDeleted,
  applyTokenMoved,
  applyTokenUpdated,
  mergeSnapshotMessages,
  toggleTokenSelection,
} from "../src/client/components/table/tableEvents";

function token(id: string, overrides: Partial<Token> = {}): Token {
  return { id, sceneId: "scene_a", x: 0, y: 0, revealed: [], ...overrides } as unknown as Token;
}

function scene(id: string, revealed: string[] = []): Scene {
  return { id, revealed } as unknown as Scene;
}

function message(id: string, createdAt: number): ChatMessage {
  return { id, createdAt, content: id } as unknown as ChatMessage;
}

describe("table event application", () => {
  it("moves only the matching token", () => {
    const tokens = [token("a"), token("b")];
    const next = applyTokenMoved(tokens, { tokenId: "b", x: 120, y: 80 });
    expect(next[0]).toMatchObject({ id: "a", x: 0, y: 0 });
    expect(next[1]).toMatchObject({ id: "b", x: 120, y: 80 });
  });

  it("creates, updates, and deletes tokens without duplicates", () => {
    const created = applyTokenCreated([token("a")], token("b"));
    expect(created.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(applyTokenCreated(created, token("b"))).toBe(created);

    const updated = applyTokenUpdated(created, token("b", { name: "Updated" } as Partial<Token>));
    expect(updated.find((entry) => entry.id === "b")).toMatchObject({ name: "Updated" });

    expect(applyTokenDeleted(updated, "a").map((entry) => entry.id)).toEqual(["b"]);
  });

  it("toggles multi-token selection", () => {
    expect(toggleTokenSelection([], "a")).toEqual(["a"]);
    expect(toggleTokenSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTokenSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("reveals, hides, and replaces fog cells", () => {
    const scenes = [scene("scene_a", ["1,1", "2,2"])];
    expect(applyFogUpdated(scenes, { sceneId: "scene_a", cells: ["3,3"], mode: "reveal" })[0].revealed)
      .toEqual(["1,1", "2,2", "3,3"]);
    expect(applyFogUpdated(scenes, { sceneId: "scene_a", cells: ["1,1"], mode: "hide" })[0].revealed)
      .toEqual(["2,2"]);
    expect(applyFogUpdated(scenes, { sceneId: "scene_a", cells: ["9,9"], mode: "replace" })[0].revealed)
      .toEqual(["9,9"]);
  });

  it("creates and updates scenes", () => {
    const scenes = [scene("a")];
    expect(applySceneCreated(scenes, scene("b")).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(applySceneCreated(scenes, scene("a"))).toBe(scenes);
    expect(applySceneUpdated(scenes, scene("a", ["4,4"]))[0].revealed).toEqual(["4,4"]);
  });

  it("deletes a scene, its tokens, and activates the next scene", () => {
    const state = {
      scenes: [scene("scene_a"), scene("scene_b")],
      tokens: [token("one"), token("two", { sceneId: "scene_b" })],
      activeSceneId: "scene_a",
    };
    const next = applySceneDeleted(state, "scene_a");
    expect(next.scenes.map((entry) => entry.id)).toEqual(["scene_b"]);
    expect(next.tokens.map((entry) => entry.id)).toEqual(["two"]);
    expect(next.activeSceneId).toBe("scene_b");

    const untouched = applySceneDeleted({ ...state, activeSceneId: "scene_b" }, "scene_a");
    expect(untouched.activeSceneId).toBe("scene_b");
  });

  it("deduplicates chat and merges snapshots in time order", () => {
    const one = message("one", 1);
    const two = message("two", 2);
    expect(applyChatMessage([one], one)).toEqual([one]);
    expect(applyChatMessage([one], two)).toEqual([one, two]);
    expect(mergeSnapshotMessages([two], [one, two]).map((entry) => entry.id)).toEqual(["one", "two"]);
  });

  it("caps merged chat history at 200 messages", () => {
    const current = Array.from({ length: 250 }, (_, index) => message(`m${index}`, index));
    const merged = mergeSnapshotMessages(current, []);
    expect(merged).toHaveLength(200);
    expect(merged[0].id).toBe("m50");
    expect(merged[199].id).toBe("m249");
  });

  it("updates and creates characters", () => {
    const characters = [
      { id: "one", name: "Old", summary: null },
    ] as unknown as CharacterRecord[];
    const updated = applyCharacterUpdated(characters, {
      characterId: "one",
      name: "New",
      summary: { hp: 10 } as CharacterRecord["summary"],
    });
    expect(updated[0]).toMatchObject({ id: "one", name: "New" });

    const created = applyCharacterCreated(characters, { id: "two" } as CharacterRecord);
    expect(created.map((entry) => entry.id)).toEqual(["one", "two"]);
    const replaced = applyCharacterCreated(created, { id: "two", name: "Replaced" } as CharacterRecord);
    expect(replaced.find((entry) => entry.id === "two")).toMatchObject({ name: "Replaced" });
  });
});
