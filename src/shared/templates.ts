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
