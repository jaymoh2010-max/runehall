import type { AmbientLight, SceneProp, TokenVisionMode, Wall } from "./types";
import { propBounds } from "./collision";
import { segmentsIntersect, wallBlocksSight } from "./walls";
import { lightLevelAt, type LightLevel, type LightSource } from "./lighting";

export type CoverLevel = "none" | "cover" | "greater-cover" | "blocked";
export type ConcealmentLevel = "none" | "concealed" | "hidden";

export interface CoverResult {
  cover: CoverLevel;
  /** AC bonus from cover; total cover cannot be targeted normally. */
  acBonus: number;
  concealment: ConcealmentLevel;
  /** Flat check DC to target a concealed or hidden creature. */
  flatCheck: number | null;
  totalCover: boolean;
  blockers: string[];
  lightLevel: LightLevel;
  summary: string;
}

function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  bounds: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  if (Math.max(ax, bx) < bounds.x1 || Math.min(ax, bx) > bounds.x2) return false;
  if (Math.max(ay, by) < bounds.y1 || Math.min(ay, by) > bounds.y2) return false;
  if (ax >= bounds.x1 && ax <= bounds.x2 && ay >= bounds.y1 && ay <= bounds.y2) return true;
  if (bx >= bounds.x1 && bx <= bounds.x2 && by >= bounds.y1 && by <= bounds.y2) return true;
  return (
    segmentsIntersect(ax, ay, bx, by, bounds.x1, bounds.y1, bounds.x2, bounds.y1) ||
    segmentsIntersect(ax, ay, bx, by, bounds.x2, bounds.y1, bounds.x2, bounds.y2) ||
    segmentsIntersect(ax, ay, bx, by, bounds.x2, bounds.y2, bounds.x1, bounds.y2) ||
    segmentsIntersect(ax, ay, bx, by, bounds.x1, bounds.y2, bounds.x1, bounds.y1)
  );
}

/** Walls give total cover; one prop gives cover, two or more give greater cover. */
export function coverBetween(input: {
  attacker: { x: number; y: number };
  target: { x: number; y: number };
  walls: Wall[];
  props: SceneProp[];
}): {
  cover: CoverLevel;
  acBonus: number;
  totalCover: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  for (const wall of input.walls) {
    if (!wallBlocksSight(wall)) continue;
    if (
      segmentsIntersect(
        input.attacker.x,
        input.attacker.y,
        input.target.x,
        input.target.y,
        wall.x1,
        wall.y1,
        wall.x2,
        wall.y2
      )
    ) {
      return {
        cover: "blocked",
        acBonus: 0,
        totalCover: true,
        blockers: [wall.kind === "door" ? "closed door" : "wall"],
      };
    }
  }
  for (const prop of input.props) {
    if (prop.layer === "overhead") continue;
    if (
      segmentIntersectsRect(
        input.attacker.x,
        input.attacker.y,
        input.target.x,
        input.target.y,
        propBounds(prop)
      )
    ) {
      blockers.push(prop.name);
    }
  }
  if (blockers.length >= 2) {
    return { cover: "greater-cover", acBonus: 4, totalCover: false, blockers };
  }
  if (blockers.length === 1) {
    return { cover: "cover", acBonus: 2, totalCover: false, blockers };
  }
  return { cover: "none", acBonus: 0, totalCover: false, blockers: [] };
}

export function concealmentFor(mode: TokenVisionMode, level: LightLevel): ConcealmentLevel {
  if (mode === "darkvision") return "none";
  if (mode === "low-light") return level === "darkness" ? "hidden" : "none";
  if (level === "darkness") return "hidden";
  return level === "dim" ? "concealed" : "none";
}

export function evaluateCover(input: {
  attacker: { x: number; y: number; visionMode?: TokenVisionMode };
  target: { x: number; y: number };
  walls: Wall[];
  props: SceneProp[];
  ambientLight: AmbientLight;
  lights: LightSource[];
}): CoverResult {
  const cover = coverBetween(input);
  const lightLevel = lightLevelAt(input.target.x, input.target.y, input.ambientLight, input.lights);
  const concealment = concealmentFor(input.attacker.visionMode ?? "normal", lightLevel);
  const flatCheck = concealment === "hidden" ? 11 : concealment === "concealed" ? 5 : null;
  const parts: string[] = [];
  if (cover.totalCover) parts.push("Total cover");
  else if (cover.cover === "greater-cover") parts.push("Greater cover +4 AC");
  else if (cover.cover === "cover") parts.push("Cover +2 AC");
  if (concealment === "hidden") parts.push("Hidden · DC 11 flat check");
  else if (concealment === "concealed") parts.push("Concealed · DC 5 flat check");
  return {
    cover: cover.cover,
    acBonus: cover.acBonus,
    concealment,
    flatCheck,
    totalCover: cover.totalCover,
    blockers: cover.blockers,
    lightLevel,
    summary: parts.length ? parts.join(" · ") : "No cover or concealment",
  };
}
