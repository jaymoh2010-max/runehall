export type TemplateKind = "burst" | "emanation" | "cone" | "line" | "square";

export interface AoeTemplate {
  /** Stable id for per-template removal and duration updates. */
  id?: string;
  kind: TemplateKind;
  /** Size in feet, matching PF2e area entries. */
  size: number;
  /** Scene-space origin. */
  x: number;
  y: number;
  /** Direction in radians for cones and lines. */
  direction: number;
  /** GM-only template: excluded from player snapshots and live template events. */
  hidden: boolean;
  /** Display name, usually the spell that created the area. */
  label?: string;
  /** Hex colour used for the outline and fill tint. */
  color?: string;
  spellId?: string | null;
  casterTokenId?: string | null;
  /** Owner allowed to remove the template; set by the server. */
  casterUserId?: string | null;
  /** Duration in initiative rounds; null means it stays until cleared. */
  durationRounds?: number | null;
  /** First round in which the template is no longer active. */
  expiresRound?: number | null;
  /** Short save/damage summary shown in the placement prompt and area list. */
  effect?: string;
}

export interface CastAreaRequest {
  characterId: string;
  characterName: string;
  label: string;
  kind: TemplateKind;
  size: number;
  color: string;
  spellId: string;
  durationRounds: number | null;
  effect: string;
  casterTokenId?: string | null;
}

export interface TemplateTarget {
  id: string;
  x: number;
  y: number;
  size: number;
}

export const TEMPLATE_SIZES = [5, 10, 15, 20, 30, 40, 60, 80, 100];

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  burst: "Burst",
  emanation: "Emanation",
  cone: "Cone",
  line: "Line",
  square: "Square",
};

export const TEMPLATE_COLOR = "#e5ca91";

export function templateRadiusPx(sizeFeet: number, gridSize: number): number {
  return Math.max(gridSize / 2, (Math.max(5, sizeFeet) / 5) * gridSize);
}

export function templateLabel(template: Pick<AoeTemplate, "kind" | "size" | "label">): string {
  const label = template.label?.trim();
  if (label) return label;
  return `${TEMPLATE_LABELS[template.kind]} ${template.size} ft.`;
}

/** Parse a compendium area such as "burst 20", "cone 60", or "cube 10". */
export function parseSpellArea(
  area: string,
  areaDelta = 0
): { kind: TemplateKind; size: number } | null {
  const text = String(area ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const forward = text.match(/\b(burst|emanation|cone|line|cube|square|cylinder)\s+(\d+)/);
  const reverse = forward
    ? null
    : text.match(
        /\b(\d+)\s*(?:-|\s)?(?:foot|feet|ft)\s+(burst|emanation|cone|line|cube|square|cylinder)\b/
      );
  const rawKind = forward?.[1] ?? reverse?.[2] ?? "";
  const rawSize = Number(forward?.[2] ?? reverse?.[1] ?? 0);
  const kind: TemplateKind | null =
    rawKind === "burst" ||
    rawKind === "emanation" ||
    rawKind === "cone" ||
    rawKind === "line" ||
    rawKind === "square"
      ? rawKind
      : rawKind === "cube"
        ? "square"
        : rawKind === "cylinder"
          ? "burst"
          : null;
  if (!kind) return null;
  const size = Math.max(
    5,
    Math.min(500, Math.round(rawSize + Math.max(0, Number(areaDelta) || 0)))
  );
  return { kind, size };
}

const ROUNDS_PER_UNIT: Record<string, number> = {
  round: 1,
  minute: 10,
  hour: 600,
  day: 14_400,
  week: 100_800,
};

/** Convert a printed duration into table rounds for area expiry. */
export function spellDurationRounds(duration: string): number | null {
  const text = String(duration ?? "").toLowerCase();
  const match = text.match(/(\d+)\s*(round|minute|hour|day|week)s?/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.max(1, Math.min(10_000, Math.round(amount * ROUNDS_PER_UNIT[match[2]])));
}

const DAMAGE_AREA_COLORS: Record<string, string> = {
  acid: "#8fcf5a",
  bleed: "#c94f4f",
  cold: "#6fb7e8",
  electricity: "#e8d54f",
  fire: "#e07a3f",
  force: "#a9c7ff",
  mental: "#d18ac7",
  negative: "#8b6fd6",
  poison: "#7fbf7f",
  sonic: "#b58ce0",
  spirit: "#b9a7e8",
  vitality: "#f0d9a8",
  void: "#8b6fd6",
};

/** Pick a readable area colour from the spell's first damage type. */
export function spellAreaColor(spell: { damage?: { type: string }[] | null }): string {
  const type = spell.damage?.[0]?.type?.toLowerCase();
  return (type && DAMAGE_AREA_COLORS[type]) || TEMPLATE_COLOR;
}

/** Tokens whose centres fall inside the area, excluding the caster token. */
export function tokensInTemplate<T extends TemplateTarget>(
  tokens: T[],
  template: Pick<AoeTemplate, "kind" | "size" | "x" | "y" | "direction" | "casterTokenId">,
  gridSize: number
): T[] {
  const radius = templateRadiusPx(template.size, gridSize);
  const direction = Number.isFinite(template.direction) ? template.direction : 0;
  return tokens.filter((token) => {
    if (template.casterTokenId && token.id === template.casterTokenId) return false;
    const dx = token.x - template.x;
    const dy = token.y - template.y;
    if (template.kind === "burst" || template.kind === "emanation") {
      return Math.hypot(dx, dy) <= radius;
    }
    if (template.kind === "square") {
      const half = radius / 2;
      return Math.abs(dx) <= half && Math.abs(dy) <= half;
    }
    const distance = Math.hypot(dx, dy);
    if (distance > radius) return false;
    if (template.kind === "cone") {
      const angle = Math.atan2(dy, dx);
      const difference = Math.abs(
        Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction))
      );
      return difference <= Math.PI / 4;
    }
    const along = dx * Math.cos(direction) + dy * Math.sin(direction);
    const perpendicular = Math.abs(-dx * Math.sin(direction) + dy * Math.cos(direction));
    return along >= 0 && along <= radius && perpendicular <= gridSize / 2;
  });
}

function textValue(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | null {
  const text = textValue(value, max);
  return text || null;
}

function optionalColor(value: unknown): string | undefined {
  const color = textValue(value, 30);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}

function optionalRound(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.max(1, Math.min(1_000_000, Math.round(number)));
}

export function normalizeAoeTemplate(value: unknown): AoeTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind as TemplateKind;
  if (!(kind in TEMPLATE_LABELS)) return null;
  const number = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input) ? input : fallback;
  const size = Math.max(5, Math.min(500, Math.round(number(record.size, 20))));
  const color = optionalColor(record.color);
  return {
    id: optionalText(record.id, 80) ?? undefined,
    kind,
    size,
    x: number(record.x, 0),
    y: number(record.y, 0),
    direction: number(record.direction, 0),
    hidden: record.hidden === true,
    label: textValue(record.label, 80),
    ...(color ? { color } : {}),
    spellId: optionalText(record.spellId, 120),
    casterTokenId: optionalText(record.casterTokenId, 80),
    casterUserId: optionalText(record.casterUserId, 80),
    durationRounds: optionalRound(record.durationRounds),
    expiresRound: optionalRound(record.expiresRound),
    effect: textValue(record.effect, 300),
  };
}

export function normalizeAoeTemplates(value: unknown): AoeTemplate[] {
  if (!Array.isArray(value)) return [];
  const templates: AoeTemplate[] = [];
  for (const entry of value.slice(0, 20)) {
    const template = normalizeAoeTemplate(entry);
    if (template) templates.push(template);
  }
  return templates;
}

/** Remove areas whose round duration ended at or before the current round. */
export function unexpiredAoeTemplates(templates: AoeTemplate[], round: number): AoeTemplate[] {
  const current = Math.max(1, Math.round(round) || 1);
  return templates.filter(
    (entry) =>
      entry.expiresRound === null ||
      entry.expiresRound === undefined ||
      entry.expiresRound >= current
  );
}
