import {
  casterInfo,
  divineFontInfo,
  isPreparedCasterClass,
  ordinarySpellSlotsFor,
  preparedEntries,
  preparedUsedKey,
} from "./rules";
import type { CharacterContext, CharacterDraft, Spell } from "./types";

export type SpellCastResource = "cantrip" | "focus" | "font" | "slot";

export interface SpellCastOption {
  rank: number;
  resource: SpellCastResource;
  /** Remaining uses, or null when the resource is unlimited (cantrips). */
  remaining: number | null;
  label: string;
}

export interface SpellCastChoice {
  rank: number;
  resource: SpellCastResource;
}

export interface SpellCastResult {
  draft: CharacterDraft;
  option: SpellCastOption;
}

export interface SpellDamagePart {
  formula: string;
  type: string;
}

export type SpellHeightenReason =
  | "no-base-damage"
  | "no-heightening"
  | "fixed-heightening"
  | "variable-actions"
  | "prose-only"
  | "data-conflict"
  | "unscalable-formula";

export interface SpellDamageAtRank {
  rank: number;
  baseRank: number;
  steps: number;
  parts: SpellDamagePart[];
  supported: boolean;
  reason?: SpellHeightenReason;
  areaDelta: number | null;
}

/**
 * Heightening rows whose structured interval disagrees with the printed
 * "Heightened" prose. Keep them manual until the data is corrected.
 */
const HEIGHTENING_CONFLICTS = new Set([
  "spell:Hnc7eGi7vyZenAIm", // Breath of Life
  "spell:91ZbBll8M7IXQ4yw", // Gluttonous Growth
  "spell:R5FHRv7VqyRnxg2t", // Wall of Ice
]);

const SIMPLE_FORMULA = /^(\d*)d(\d+)([+-]\d+)?$/i;
const FLAT_FORMULA = /^([+-]?\d+)$/;

function clampInt(value: unknown, min: number, max: number): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/** Effective rank for an automatically heightened cantrip. */
export function cantripCastRank(level: number): number {
  return clampInt(Math.ceil(clampInt(level, 1, 20) / 2), 1, 10);
}

/** Focus spells heighten to half level, but never below their printed rank. */
export function focusCastRank(spellRank: number, level: number): number {
  return Math.max(clampInt(spellRank, 1, 10), cantripCastRank(level));
}

export function spellCastOptionAvailable(option: SpellCastOption | undefined): boolean {
  return Boolean(option && (option.remaining === null || option.remaining > 0));
}

export function spellCastOptions(
  spell: Spell,
  draft: CharacterDraft,
  context: CharacterContext,
  opts: { focus?: boolean; focusPointsMax?: number } = {}
): SpellCastOption[] {
  if (spell.ritual) return [];
  const level = clampInt(draft.level, 1, 20);

  if (opts.focus) {
    const max = clampInt(opts.focusPointsMax ?? 0, 0, 3);
    return [
      {
        rank: focusCastRank(spell.rank, level),
        resource: "focus",
        remaining: clampInt(draft.play.focusPoints, 0, max),
        label: "Focus point",
      },
    ];
  }

  if (spell.rank === 0) {
    return [
      {
        rank: cantripCastRank(level),
        resource: "cantrip",
        remaining: null,
        label: "Cantrip",
      },
    ];
  }

  const caster = casterInfo(context.classData);
  if (caster.progression === "none" || caster.progression === "focus") return [];
  const ordinary = ordinarySpellSlotsFor(level, caster.progression, context.classData?.name);
  if (!ordinary) return [];
  const maxRank = ordinary.length;
  if (spell.rank > maxRank) return [];

  const preparedCaster = isPreparedCasterClass(context.classData?.name);
  const font = divineFontInfo(level, context.classData?.name);
  const fontSlots = font?.slots ?? 0;
  const fontUsed = clampInt(draft.spells.divineFontUsed, 0, fontSlots);
  const fontRemaining = Math.max(0, fontSlots - fontUsed);

  if (preparedCaster) {
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: context.deity,
      classData: context.classData,
    }).filter(
      (entry) => entry.id === spell.id && entry.rank >= spell.rank && entry.rank <= maxRank
    );
    if (!entries.length) return [];

    const copiesByRank = new Map<number, { font: number; ordinary: number }>();
    for (const entry of entries) {
      const copies = copiesByRank.get(entry.rank) ?? { font: 0, ordinary: 0 };
      if (entry.font) copies.font += 1;
      else copies.ordinary += 1;
      copiesByRank.set(entry.rank, copies);
    }

    const options: SpellCastOption[] = [];
    for (const [rank, copies] of [...copiesByRank.entries()].sort((a, b) => a[0] - b[0])) {
      const slotCount = ordinary[rank - 1] ?? 0;
      const slotUsed = clampInt(draft.spells.slotsUsed[String(rank)], 0, slotCount);
      if (copies.font > 0) {
        const spent = clampInt(draft.spells.fontUsed[spell.id], 0, copies.font);
        const remaining = Math.max(0, Math.min(fontRemaining, copies.font - spent));
        if (remaining > 0 || copies.ordinary === 0) {
          options.push({
            rank,
            resource: "font",
            remaining,
            label: "Divine font",
          });
        }
      }
      if (copies.ordinary > 0) {
        const spent = clampInt(
          draft.spells.preparedUsed[preparedUsedKey(rank, spell.id)],
          0,
          copies.ordinary
        );
        options.push({
          rank,
          resource: "slot",
          remaining: Math.max(0, Math.min(slotCount - slotUsed, copies.ordinary - spent)),
          label: `Rank ${rank} slot`,
        });
      }
    }

    return options.sort(
      (a, b) =>
        Number(spellCastOptionAvailable(b)) - Number(spellCastOptionAvailable(a)) ||
        (a.resource === "font" ? 0 : 1) - (b.resource === "font" ? 0 : 1) ||
        a.rank - b.rank
    );
  }

  const ranks: number[] = [];
  for (let rank = spell.rank; rank <= maxRank; rank += 1) ranks.push(rank);

  const options: SpellCastOption[] = [];
  for (const rank of ranks) {
    const slotCount = ordinary[rank - 1] ?? 0;
    const used = clampInt(draft.spells.slotsUsed[String(rank)], 0, slotCount);
    options.push({
      rank,
      resource: "slot",
      remaining: Math.max(0, slotCount - used),
      label: `Rank ${rank} slot`,
    });
  }

  return options;
}

export function castSpell(
  draft: CharacterDraft,
  spell: Spell,
  context: CharacterContext,
  choice: SpellCastChoice,
  opts: { focus?: boolean; focusPointsMax?: number } = {}
): SpellCastResult | null {
  const option = spellCastOptions(spell, draft, context, opts).find(
    (entry) => entry.rank === choice.rank && entry.resource === choice.resource
  );
  if (!spellCastOptionAvailable(option) || !option) return null;

  if (option.resource === "cantrip") return { draft, option };

  if (option.resource === "focus") {
    const max = clampInt(opts.focusPointsMax ?? 0, 0, 3);
    const current = clampInt(draft.play.focusPoints, 0, max);
    if (current < 1) return null;
    return {
      draft: { ...draft, play: { ...draft.play, focusPoints: current - 1 } },
      option: { ...option, remaining: current - 1 },
    };
  }

  if (option.resource === "font") {
    const font = divineFontInfo(draft.level, context.classData?.name);
    if (!font) return null;
    const used = clampInt(draft.spells.divineFontUsed, 0, font.slots);
    if (used >= font.slots) return null;
    const copies = preparedEntries(draft, {
      spells: context.spells,
      deity: context.deity,
      classData: context.classData,
    }).filter((entry) => entry.id === spell.id && entry.font && entry.rank === option.rank).length;
    const spent = clampInt(draft.spells.fontUsed[spell.id], 0, copies);
    if (spent >= copies) return null;
    return {
      draft: {
        ...draft,
        spells: {
          ...draft.spells,
          divineFontUsed: used + 1,
          fontUsed: { ...draft.spells.fontUsed, [spell.id]: spent + 1 },
        },
      },
      option: {
        ...option,
        remaining: Math.max(0, Math.min(font.slots - used - 1, copies - spent - 1)),
      },
    };
  }

  const key = String(option.rank);
  const used = Math.max(0, Math.round(Number(draft.spells.slotsUsed[key]) || 0));
  if (option.remaining !== null && option.remaining <= 0) return null;
  const spells: CharacterDraft["spells"] = {
    ...draft.spells,
    slotsUsed: { ...draft.spells.slotsUsed, [key]: used + 1 },
  };
  if (isPreparedCasterClass(context.classData?.name)) {
    const copies = preparedEntries(draft, {
      spells: context.spells,
      deity: context.deity,
      classData: context.classData,
    }).filter((entry) => entry.id === spell.id && !entry.font && entry.rank === option.rank).length;
    if (copies > 0) {
      const copyKey = preparedUsedKey(option.rank, spell.id);
      const spent = clampInt(draft.spells.preparedUsed[copyKey], 0, copies);
      if (spent >= copies) return null;
      spells.preparedUsed = { ...draft.spells.preparedUsed, [copyKey]: spent + 1 };
    }
  }
  return {
    draft: { ...draft, spells },
    option: { ...option, remaining: Math.max(0, (option.remaining ?? 0) - 1) },
  };
}

function parseFormula(formula: string): { dice: number; sides: number; flat: number } | null {
  const match = formula.trim().match(SIMPLE_FORMULA);
  if (!match) return null;
  const dice = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const flat = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(dice) || !Number.isFinite(sides) || !Number.isFinite(flat)) return null;
  return { dice, sides, flat };
}

export function scaleSpellFormula(formula: string, steps: number): string | null {
  if (steps <= 0) return formula;
  const flat = formula.trim().match(FLAT_FORMULA);
  if (flat) return String(Number(flat[1]) * steps);
  const parsed = parseFormula(formula);
  if (!parsed) return null;
  const dice = parsed.dice * steps;
  const mod = parsed.flat * steps;
  const suffix = mod === 0 ? "" : mod > 0 ? `+${mod}` : `${mod}`;
  return `${dice}d${parsed.sides}${suffix}`;
}

export function addSpellFormulas(a: string, b: string): string {
  const left = parseFormula(a);
  const right = parseFormula(b);
  if (left && right && left.sides === right.sides) {
    const dice = left.dice + right.dice;
    const mod = left.flat + right.flat;
    const suffix = mod === 0 ? "" : mod > 0 ? `+${mod}` : `${mod}`;
    return `${dice}d${left.sides}${suffix}`;
  }
  const leftFlat = a.trim().match(FLAT_FORMULA);
  if (leftFlat && right) {
    const mod = Number(leftFlat[1]) + right.flat;
    const suffix = mod === 0 ? "" : mod > 0 ? `+${mod}` : `${mod}`;
    return `${right.dice}d${right.sides}${suffix}`;
  }
  const rightFlat = b.trim().match(FLAT_FORMULA);
  if (rightFlat && left) {
    const mod = left.flat + Number(rightFlat[1]);
    const suffix = mod === 0 ? "" : mod > 0 ? `+${mod}` : `${mod}`;
    return `${left.dice}d${left.sides}${suffix}`;
  }
  return `${a}+${b}`;
}

function heighteningReason(spell: Spell): SpellHeightenReason | null {
  if (!spell.damage?.length) return "no-base-damage";
  if (!spell.heightening) return "no-heightening";
  if (HEIGHTENING_CONFLICTS.has(spell.id)) return "data-conflict";
  if (spell.heightening.type === "fixed") return "fixed-heightening";
  if (spell.heightening.type !== "interval") return "prose-only";
  if (!spell.heightening.damage?.length) return "no-heightening";
  if (/[0-9]\s*(to|or)\s*[0-9]/i.test(spell.actions || "")) return "variable-actions";
  return null;
}

/**
 * Damage at a cast rank. Only structured interval heightening with a safe
 * action count is automated; everything else returns the base damage so the
 * table can apply the printed heightening manually.
 */
export function spellDamageAtRank(spell: Spell, castRank: number): SpellDamageAtRank {
  const baseRank = spell.rank <= 0 ? 1 : spell.rank;
  const rank = Math.max(baseRank, Math.min(10, Math.round(castRank) || baseRank));
  const baseParts = (spell.damage ?? []).filter(
    (part) => part.formula && part.formula.trim() !== "0"
  );
  const interval = Math.max(1, Math.round(spell.heightening?.interval ?? 1));
  const steps = Math.max(0, Math.floor((rank - baseRank) / interval));
  const areaDelta =
    steps > 0 && spell.heightening?.area && spell.heightening.area > 0
      ? spell.heightening.area * steps
      : null;

  if (!baseParts.length) {
    return {
      rank,
      baseRank,
      steps,
      parts: [],
      supported: false,
      reason: "no-base-damage",
      areaDelta,
    };
  }

  if (steps === 0) {
    return { rank, baseRank, steps, parts: baseParts, supported: true, areaDelta };
  }

  const reason = heighteningReason(spell);
  if (reason) {
    return { rank, baseRank, steps, parts: baseParts, supported: false, reason, areaDelta };
  }

  const extra = (spell.heightening?.damage ?? []).filter(
    (part) => part.formula && part.formula.trim() !== "0"
  );
  const parts = baseParts.map((part) => ({ ...part }));
  for (let index = 0; index < extra.length; index += 1) {
    const scaled = scaleSpellFormula(extra[index].formula, steps);
    if (!scaled) {
      return {
        rank,
        baseRank,
        steps,
        parts: baseParts,
        supported: false,
        reason: "unscalable-formula",
        areaDelta,
      };
    }
    const target = parts[index];
    if (target) {
      // Keep the base part's type: the ingester mislabels some secondary
      // heightening rows with the first part's type.
      target.formula = addSpellFormulas(target.formula, scaled);
    } else {
      parts.push({ formula: scaled, type: extra[index].type });
    }
  }

  return { rank, baseRank, steps, parts, supported: true, areaDelta };
}

export function isHealingSpell(spell: Pick<Spell, "traits">): boolean {
  return spell.traits.includes("healing");
}

export function spellHeighteningNotes(spell: Spell): string[] {
  const text = spell.description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = text.match(/Heightened[^.]*\./gi) ?? [];
  return matches.map((entry) => entry.trim()).slice(0, 3);
}

export function spellHeighteningHint(spell: Spell, castRank: number): string | null {
  const result = spellDamageAtRank(spell, castRank);
  if (result.supported && result.steps > 0) {
    return `Heightened to rank ${result.rank}.`;
  }
  if (result.supported) return null;
  switch (result.reason) {
    case "variable-actions":
      return "Action-count variants and heightening are manual; showing the base effect.";
    case "fixed-heightening":
      return "Fixed-rank heightening is manual; showing the base effect.";
    case "data-conflict":
      return "Printed heightening conflicts with the generated data; apply it manually.";
    case "no-heightening":
      return "No structured heightening is available; apply any printed heightening manually.";
    case "prose-only":
      return "Heightening is prose-only; apply it manually.";
    case "unscalable-formula":
      return "This heightening formula is not supported; apply it manually.";
    default:
      return null;
  }
}
