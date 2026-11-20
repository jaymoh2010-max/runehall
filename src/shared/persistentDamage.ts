import type { PersistentDamageInstance } from "./types";

/** End-of-turn flat check DC for persistent damage. */
export const PERSISTENT_DAMAGE_DC = 15;

export function newPersistentDamageId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `pd-${uuid}`;
}

export function normalizePersistentDamage(input: unknown): PersistentDamageInstance | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const formula = typeof raw.formula === "string" ? raw.formula.trim().slice(0, 40) : "";
  if (!formula) return null;
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : newPersistentDamageId(),
    formula,
    type:
      typeof raw.type === "string" && raw.type.trim()
        ? raw.type.trim().toLowerCase().slice(0, 30)
        : "untyped",
    dc: Math.max(1, Math.min(30, Math.round(Number(raw.dc) || PERSISTENT_DAMAGE_DC))),
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : "",
  };
}

export function normalizePersistentDamageList(input: unknown): PersistentDamageInstance[] {
  if (!Array.isArray(input)) return [];
  const out: PersistentDamageInstance[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const instance = normalizePersistentDamage(entry);
    if (!instance || seen.has(instance.id)) continue;
    seen.add(instance.id);
    out.push(instance);
    if (out.length >= 20) break;
  }
  return out;
}

export function persistentDamageLabel(instance: PersistentDamageInstance): string {
  return `${instance.formula} ${instance.type}`.trim();
}
