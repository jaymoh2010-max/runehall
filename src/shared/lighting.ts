import type { AmbientLight, PartyVisionScope, TokenVisionMode } from "./types";

export const AMBIENT_LIGHT_OPTIONS: { value: AmbientLight; label: string }[] = [
  { value: "bright", label: "Bright light" },
  { value: "dim", label: "Dim light" },
  { value: "darkness", label: "Darkness" },
];

export const TOKEN_VISION_OPTIONS: { value: TokenVisionMode; label: string }[] = [
  { value: "normal", label: "Normal vision" },
  { value: "low-light", label: "Low-light vision" },
  { value: "darkvision", label: "Darkvision" },
];

export const PARTY_VISION_OPTIONS: { value: PartyVisionScope; label: string }[] = [
  { value: "shared", label: "Shared party vision" },
  { value: "per-player", label: "Per-player vision" },
];

export function normalizeAmbientLight(value: unknown): AmbientLight {
  return value === "dim" || value === "darkness" ? value : "bright";
}

export function normalizeTokenVisionMode(value: unknown): TokenVisionMode {
  return value === "low-light" || value === "darkvision" ? value : "normal";
}

export function normalizePartyVisionScope(value: unknown): PartyVisionScope {
  return value === "per-player" ? "per-player" : "shared";
}

export const DEFAULT_LIGHT_COLOR = "#ffd27d";

/** Accepts six-digit hex colors; anything else falls back to warm gold. */
export function normalizeLightColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_LIGHT_COLOR;
}

/** Converts a hex light color to an rgba() string for canvas gradients. */
export function lightColorRgba(color: string, alpha: number): string {
  const hex = normalizeLightColor(color).slice(1);
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0));
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

export type LightLevel = "bright" | "dim" | "darkness";

export interface LightSource {
  x: number;
  y: number;
  /** Radius of bright light in scene pixels. Dim light extends to twice this. */
  radius: number;
}

/**
 * Simplified PF2e lighting:
 * - Ambient bright light is bright everywhere.
 * - Ambient dim light is dim, except a light source can still create bright light.
 * - In darkness, token light sources create bright light and a dim ring outside it.
 */
export function lightLevelAt(
  x: number,
  y: number,
  ambient: AmbientLight,
  lights: LightSource[]
): LightLevel {
  if (ambient === "bright") return "bright";
  if (ambient === "dim") {
    for (const light of lights) {
      if (Math.hypot(x - light.x, y - light.y) <= light.radius) return "bright";
    }
    return "dim";
  }
  let level: LightLevel = "darkness";
  for (const light of lights) {
    const distance = Math.hypot(x - light.x, y - light.y);
    if (distance <= light.radius) return "bright";
    if (distance <= light.radius * 2) level = "dim";
  }
  return level;
}

/**
 * How a token's senses render a light level:
 * - Normal: bright clearly, dim dimly, darkness not at all.
 * - Low-light: dim counts as bright, darkness not at all.
 * - Darkvision: darkness is seen dimly, bright and dim are clear.
 */
export function visionLevelFor(mode: TokenVisionMode, level: LightLevel): "bright" | "dim" | null {
  if (level === "bright") return "bright";
  if (level === "dim") return mode === "normal" ? "dim" : "bright";
  return mode === "darkvision" ? "dim" : null;
}
