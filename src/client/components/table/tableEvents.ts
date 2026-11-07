import type {
  CharacterRecord,
  CharacterSummary,
  ChatMessage,
  Scene,
  Token,
} from "../../../shared/types";

export function applyTokenMoved(
  tokens: Token[],
  payload: { tokenId: string; x: number; y: number }
): Token[] {
  return tokens.map((token) =>
    token.id === payload.tokenId ? { ...token, x: payload.x, y: payload.y } : token
  );
}

export function applyTokenCreated(tokens: Token[], token: Token): Token[] {
  return tokens.some((item) => item.id === token.id) ? tokens : [...tokens, token];
}

export function applyTokenUpdated(tokens: Token[], updated: Token): Token[] {
  return tokens.map((token) => (token.id === updated.id ? updated : token));
}

export function applyTokenDeleted(tokens: Token[], tokenId: string): Token[] {
  return tokens.filter((token) => token.id !== tokenId);
}

export function toggleTokenSelection(current: string[], tokenId: string): string[] {
  return current.includes(tokenId) ? current.filter((id) => id !== tokenId) : [...current, tokenId];
}

export function applyFogUpdated(
  scenes: Scene[],
  payload: { sceneId: string; cells: string[]; mode: "reveal" | "hide" | "replace" }
): Scene[] {
  return scenes.map((scene) => {
    if (scene.id !== payload.sceneId) return scene;
    const next = new Set(scene.revealed);
    if (payload.mode === "replace") next.clear();
    for (const cell of payload.cells) {
      if (payload.mode === "hide") next.delete(cell);
      else next.add(cell);
    }
    return { ...scene, revealed: [...next] };
  });
}

export function applySceneUpdated(scenes: Scene[], updated: Scene): Scene[] {
  return scenes.map((scene) => (scene.id === updated.id ? updated : scene));
}

export function applySceneCreated(scenes: Scene[], created: Scene): Scene[] {
  return scenes.some((scene) => scene.id === created.id) ? scenes : [...scenes, created];
}

export function applySceneDeleted(
  state: { scenes: Scene[]; tokens: Token[]; activeSceneId: string | null },
  sceneId: string
): { scenes: Scene[]; tokens: Token[]; activeSceneId: string | null } {
  const scenes = state.scenes.filter((scene) => scene.id !== sceneId);
  return {
    scenes,
    tokens: state.tokens.filter((token) => token.sceneId !== sceneId),
    activeSceneId: state.activeSceneId === sceneId ? (scenes[0]?.id ?? null) : state.activeSceneId,
  };
}

export function applyChatMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

export function mergeSnapshotMessages(
  current: ChatMessage[],
  snapshot: ChatMessage[]
): ChatMessage[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of snapshot) merged.set(message.id, message);
  return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-200);
}

export function applyCharacterUpdated(
  characters: CharacterRecord[],
  payload: { characterId: string; summary: CharacterSummary | null; name: string }
): CharacterRecord[] {
  return characters.map((character) =>
    character.id === payload.characterId
      ? { ...character, name: payload.name, summary: payload.summary }
      : character
  );
}

export function applyCharacterCreated(
  characters: CharacterRecord[],
  created: CharacterRecord
): CharacterRecord[] {
  return characters.some((character) => character.id === created.id)
    ? characters.map((character) => (character.id === created.id ? created : character))
    : [...characters, created];
}
