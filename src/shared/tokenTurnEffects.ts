import { normalizePersistentDamageList } from "./persistentDamage";
import type { Monster, TokenCondition, TokenTurnEffects } from "./types";

export function emptyTokenTurnEffects(): TokenTurnEffects {
  return {
    fastHealing: 0,
    fastHealingActive: true,
    fastHealingNote: "",
    regeneration: 0,
    regenerationActive: true,
    regenerationNote: "",
    regenerationDeactivatedBy: [],
    persistentDamage: [],
  };
}

function integer(value: unknown, max = 1_000): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function note(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function conditionBaseName(value: string): string {
  const raw = String(value ?? "").trim();
  const trailing = raw.match(/^(.*?)\s+\d+$/);
  return (trailing?.[1] ?? raw).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
}

export function normalizeTokenTurnEffects(input: unknown): TokenTurnEffects {
  const base = emptyTokenTurnEffects();
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  const deactivated = Array.isArray(raw.regenerationDeactivatedBy)
    ? raw.regenerationDeactivatedBy
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => note(entry, 40))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  return {
    fastHealing: integer(raw.fastHealing),
    fastHealingActive: raw.fastHealingActive !== false,
    fastHealingNote: note(raw.fastHealingNote),
    regeneration: integer(raw.regeneration),
    regenerationActive: raw.regenerationActive !== false,
    regenerationNote: note(raw.regenerationNote),
    regenerationDeactivatedBy: deactivated,
    persistentDamage: normalizePersistentDamageList(raw.persistentDamage),
  };
}

function abilityNote(name: string): string {
  return name.match(/\(([^)]*)\)/)?.[1]?.trim() ?? "";
}

function deactivatedBy(noteText: string): string[] {
  const match = noteText.match(/deactivated by\s+(.+)/i);
  if (!match) return [];
  return match[1]
    .split(/\s*,\s*(?:(?:or|and)\s+)?|\s+(?:or|and)\s+/i)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Seed token effects from statblock ability names. Fast healing with a
 * parenthetical condition is stored but inactive until the GM enables it;
 * regeneration is active but can be suppressed with the
 * "Regeneration Suppressed" token condition.
 */
export function tokenTurnEffectsFromMonster(monster: Monster): TokenTurnEffects {
  const effects = emptyTokenTurnEffects();
  for (const ability of monster.abilities ?? []) {
    if (ability.actionType && ability.actionType !== "passive") continue;
    if (ability.type === "spell") continue;
    const name = String(ability.name ?? "").trim();
    const fast = name.match(/^Fast Healing\s+(\d+)\b/i);
    if (fast) {
      const value = Number(fast[1]);
      const condition = abilityNote(name);
      effects.fastHealing = Math.max(effects.fastHealing, value);
      effects.fastHealingActive = effects.fastHealingActive && !condition;
      effects.fastHealingNote = condition || effects.fastHealingNote;
    }
    const regeneration = name.match(/^Regeneration\s+(\d+)\b/i);
    if (regeneration) {
      const value = Number(regeneration[1]);
      const condition = abilityNote(name);
      effects.regeneration = Math.max(effects.regeneration, value);
      effects.regenerationNote = condition || effects.regenerationNote;
      if (condition) {
        effects.regenerationDeactivatedBy = deactivatedBy(condition);
      }
    }
  }
  return effects;
}

export function tokenHasRegenerationSuppressed(conditions: TokenCondition[]): boolean {
  return conditions.some(
    (condition) => conditionBaseName(condition.name) === "regeneration suppressed"
  );
}

/** Fixed start-of-turn healing from token effects. */
export function tokenTurnHealing(effects: TokenTurnEffects, conditions: TokenCondition[]): number {
  let healing = 0;
  if (effects.fastHealingActive) healing += effects.fastHealing;
  if (effects.regenerationActive && !tokenHasRegenerationSuppressed(conditions)) {
    healing += effects.regeneration;
  }
  return Math.max(0, Math.min(1_000, Math.round(healing)));
}
