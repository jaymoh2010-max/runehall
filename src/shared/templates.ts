export type TemplateKind = "burst" | "emanation" | "cone" | "line";

export interface AoeTemplate {
  kind: TemplateKind;
  /** Size in feet, matching PF2e area entries. */
  size: number;
  /** Scene-space origin. */
  x: number;
  y: number;
  /** Direction in radians for cones and lines. */
  direction: number;
}

export const TEMPLATE_SIZES = [5, 10, 15, 20, 30, 40, 60];

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  burst: "Burst",
  emanation: "Emanation",
  cone: "Cone",
  line: "Line",
};

export function templateRadiusPx(sizeFeet: number, gridSize: number): number {
  return Math.max(gridSize / 2, (Math.max(5, sizeFeet) / 5) * gridSize);
}

export function templateLabel(template: Pick<AoeTemplate, "kind" | "size">): string {
  return `${TEMPLATE_LABELS[template.kind]} ${template.size} ft.`;
}

export function normalizeAoeTemplate(value: unknown): AoeTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind as TemplateKind;
  if (!(kind in TEMPLATE_LABELS)) return null;
  const number = (input: unknown, fallback: number) =>
    typeof input === "number" && Number.isFinite(input) ? input : fallback;
  const size = Math.max(5, Math.min(120, Math.round(number(record.size, 20))));
  return {
    kind,
    size,
    x: number(record.x, 0),
    y: number(record.y, 0),
    direction: number(record.direction, 0),
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
