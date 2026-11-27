import type { RunesmithEtchedRune, RunesmithRune, RunesmithState } from "./types";

/** Runes known at each repertoire breakpoint. */
export function runesmithRepertoireLimit(level: number): number {
  if (level >= 17) return 12;
  if (level >= 13) return 10;
  if (level >= 9) return 8;
  if (level >= 5) return 6;
  return 4;
}

/** Maximum number of simultaneously etched base runes. */
export function runesmithEtchedLimit(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export function newRunesmithEtchedId(): string {
  return `etched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default target text for a rune's usage line. */
export function runesmithDefaultTarget(rune: RunesmithRune): string {
  const usage = rune.usage.toLowerCase();
  if (usage.includes("creature")) return "Self";
  if (usage.includes("weapon")) return "Weapon";
  if (usage.includes("armor")) return "Armor";
  if (usage.includes("shield")) return "Shield";
  if (usage.includes("square")) return "Square";
  return "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

export function normalizeRunesmithState(value: unknown): RunesmithState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const repertoire = stringList(raw.repertoire);
  const etchedRaw = Array.isArray(raw.etched) ? raw.etched : [];
  const seen = new Set<string>();
  const etched: RunesmithEtchedRune[] = [];
  for (const entry of etchedRaw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.runeId !== "string" || !record.runeId.trim()) continue;
    const id =
      typeof record.id === "string" && record.id.trim() ? record.id.trim() : newRunesmithEtchedId();
    if (seen.has(id)) continue;
    seen.add(id);
    etched.push({
      id,
      runeId: record.runeId.trim(),
      target: typeof record.target === "string" ? record.target : "",
      diacriticId:
        typeof record.diacriticId === "string" && record.diacriticId.trim()
          ? record.diacriticId.trim()
          : null,
    });
  }
  return { repertoire, etched };
}

export function runesmithRune(
  id: string | null | undefined,
  runes: Record<string, RunesmithRune> | undefined
): RunesmithRune | null {
  return id && runes ? (runes[id] ?? null) : null;
}

/** True when the rune is a diacritic that must be attached to a base rune. */
export function isDiacriticRune(rune: RunesmithRune | null | undefined): boolean {
  return Boolean(
    rune?.diacritic || rune?.traits.some((trait) => trait.toLowerCase() === "diacritic")
  );
}

export function runesmithEtchedDisplayName(
  etched: RunesmithEtchedRune,
  runes: Record<string, RunesmithRune> | undefined
): string {
  const base = runesmithRune(etched.runeId, runes);
  const diacritic = runesmithRune(etched.diacriticId, runes);
  if (!base) return "Unknown rune";
  return diacritic ? `${diacritic.name} on ${base.name}` : base.name;
}
