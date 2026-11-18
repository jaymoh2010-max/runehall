import type { AmbientLight, Scene, TokenVisionMode, Wall } from "./types";
import { lightLevelAt, visionLevelFor, type LightLevel, type LightSource } from "./lighting";
import { segmentsIntersect, wallBlocksSight } from "./walls";

export { segmentsIntersect } from "./walls";

export interface VisionPoint {
  x: number;
  y: number;
  /** Per-origin sight radius in scene pixels. Falls back to the global option. */
  radius?: number;
  /** Senses used to interpret light levels. Defaults to normal vision. */
  mode?: TokenVisionMode;
}

export interface VisionResult {
  /** Cells seen clearly. */
  bright: Set<string>;
  /** Cells seen but dimmed. */
  dim: Set<string>;
  /** Union of bright and dim cells. */
  visible: Set<string>;
}

export interface VisionOptions {
  ambientLight?: AmbientLight;
  lights?: LightSource[];
  /** Fallback sight radius in scene pixels when an origin has no radius. */
  maxDistance?: number;
}

export function hasLineOfSight(from: VisionPoint, to: VisionPoint, walls: Wall[]): boolean {
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;
    if (segmentsIntersect(from.x, from.y, to.x, to.y, wall.x1, wall.y1, wall.x2, wall.y2)) {
      return false;
    }
  }
  return true;
}

export interface VisibleCellsOptions {
  /** Maximum sight distance in scene pixels. Defaults to 24 grid squares. */
  maxDistance?: number;
}

/**
 * Compute bright and dim visibility for the supplied origins, accounting for
 * walls, each origin's sight radius, ambient light, token light sources, and
 * normal/low-light/darkvision senses.
 */
export function computeVision(
  scene: Pick<Scene, "width" | "height" | "gridSize" | "gridOffsetX" | "gridOffsetY">,
  walls: Wall[],
  origins: VisionPoint[],
  options: VisionOptions = {}
): VisionResult {
  const grid = Math.max(1, scene.gridSize);
  const cols = Math.max(1, Math.ceil(scene.width / grid));
  const rows = Math.max(1, Math.ceil(scene.height / grid));
  const blocking = walls.filter(wallBlocksSight);
  const ambient = options.ambientLight ?? "bright";
  const lights = options.lights ?? [];
  const bright = new Set<string>();
  const dim = new Set<string>();

  for (const origin of origins) {
    const maxDistance = Math.max(grid, origin.radius ?? options.maxDistance ?? grid * 24);
    const mode = origin.mode ?? "normal";
    const minCx = Math.max(0, Math.floor((origin.x - maxDistance - scene.gridOffsetX) / grid));
    const maxCx = Math.min(
      cols - 1,
      Math.ceil((origin.x + maxDistance - scene.gridOffsetX) / grid)
    );
    const minCy = Math.max(0, Math.floor((origin.y - maxDistance - scene.gridOffsetY) / grid));
    const maxCy = Math.min(
      rows - 1,
      Math.ceil((origin.y + maxDistance - scene.gridOffsetY) / grid)
    );
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        if (bright.has(key)) continue;
        const point = {
          x: scene.gridOffsetX + (cx + 0.5) * grid,
          y: scene.gridOffsetY + (cy + 0.5) * grid,
        };
        if (Math.hypot(point.x - origin.x, point.y - origin.y) > maxDistance) continue;
        if (!hasLineOfSight(origin, point, blocking)) continue;
        const reachableLights =
          ambient === "bright"
            ? []
            : lights.filter((light) => hasLineOfSight(light, point, blocking));
        const level: LightLevel =
          ambient === "bright"
            ? "bright"
            : lightLevelAt(point.x, point.y, ambient, reachableLights);
        const seen = visionLevelFor(mode, level);
        if (seen === "bright") {
          bright.add(key);
          dim.delete(key);
        } else if (seen === "dim" && !bright.has(key)) {
          dim.add(key);
        }
      }
    }
  }

  const visible = new Set(bright);
  for (const cell of dim) if (!bright.has(cell)) visible.add(cell);
  return { bright, dim, visible };
}

/**
 * Backwards-compatible visibility helper: bright ambient light, normal vision,
 * and no token light sources.
 */
export function visibleCells(
  scene: Pick<Scene, "width" | "height" | "gridSize" | "gridOffsetX" | "gridOffsetY">,
  walls: Wall[],
  origins: VisionPoint[],
  options: VisibleCellsOptions = {}
): Set<string> {
  return computeVision(scene, walls, origins, {
    ambientLight: "bright",
    maxDistance: options.maxDistance,
    lights: [],
  }).visible;
}
