import type { Scene } from "../../../shared/types";

const MAX_EXPLORED_CELLS = 20_000;

export function exploredStorageKey(
  scene: Pick<Scene, "campaignId" | "id">,
  userId: string
): string {
  return `runehall:explored:v1:${scene.campaignId}:${scene.id}:${userId}`;
}

export function exploredSignature(
  scene: Pick<Scene, "width" | "height" | "gridSize" | "gridOffsetX" | "gridOffsetY" | "imageUrl">
): string {
  return `${scene.width}x${scene.height}:${scene.gridSize}:${scene.gridOffsetX}:${scene.gridOffsetY}:${scene.imageUrl ?? ""}`;
}

export function loadExplored(
  scene: Pick<
    Scene,
    | "campaignId"
    | "id"
    | "width"
    | "height"
    | "gridSize"
    | "gridOffsetX"
    | "gridOffsetY"
    | "imageUrl"
  >,
  userId: string
): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(exploredStorageKey(scene, userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { signature?: unknown; cells?: unknown };
    if (parsed.signature !== exploredSignature(scene) || !Array.isArray(parsed.cells)) {
      return new Set();
    }
    return new Set(
      parsed.cells
        .filter((cell): cell is string => typeof cell === "string")
        .slice(0, MAX_EXPLORED_CELLS)
    );
  } catch {
    return new Set();
  }
}

export function saveExplored(
  scene: Pick<
    Scene,
    | "campaignId"
    | "id"
    | "width"
    | "height"
    | "gridSize"
    | "gridOffsetX"
    | "gridOffsetY"
    | "imageUrl"
  >,
  userId: string,
  cells: Set<string>
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      exploredStorageKey(scene, userId),
      JSON.stringify({
        signature: exploredSignature(scene),
        cells: [...cells].slice(-MAX_EXPLORED_CELLS),
      })
    );
  } catch {
    // A full or unavailable localStorage should not break the table.
  }
}
