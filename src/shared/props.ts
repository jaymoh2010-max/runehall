import type { SceneProp } from "./types";

export const PROP_LIMIT = 300;

export interface PropPreset {
  name: string;
  imageUrl: string;
  /** Default footprint in 5-foot squares. */
  squaresW: number;
  squaresH: number;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSceneProp(value: unknown): SceneProp | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 80) : "";
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim().slice(0, 500) : "";
  if (!id || !imageUrl) return null;
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim().slice(0, 80)
      : "Prop";
  const rotation = ((Math.round(finite(record.rotation)) % 360) + 360) % 360;
  return {
    id,
    name,
    imageUrl,
    x: finite(record.x),
    y: finite(record.y),
    width: Math.max(8, Math.min(10_000, Math.round(finite(record.width, 64)))),
    height: Math.max(8, Math.min(10_000, Math.round(finite(record.height, 64)))),
    rotation,
    layer: record.layer === "overhead" ? "overhead" : "ground",
    visible: record.visible !== false,
    locked: record.locked === true,
    z: Math.max(0, Math.min(100_000, Math.round(finite(record.z)))),
  };
}

export function normalizeSceneProps(value: unknown): SceneProp[] {
  if (!Array.isArray(value)) return [];
  const props: SceneProp[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, PROP_LIMIT)) {
    const prop = normalizeSceneProp(entry);
    if (!prop || seen.has(prop.id)) continue;
    seen.add(prop.id);
    props.push(prop);
  }
  return props;
}
