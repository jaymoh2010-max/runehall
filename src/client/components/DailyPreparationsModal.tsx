import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { CharacterContext, CharacterDraft, DerivedCharacter, Spell } from "../../shared/types";
import {
  addPreparedCantrip,
  addPreparedSpellCopy,
  canPrepareCantrip,
  canPrepareSpellAtRank,
  cantripPreparedLimitFor,
  computeCharacter,
  deityFontChoices,
  effectiveFontChoice,
  knownCantripIds,
  ordinaryPreparedLimitAt,
  preparedCantripIds,
  preparedEntries,
  preparedRankSummaries,
  removePreparedCantrip,
  removePreparedCopy,
  type DivineFontChoice,
} from "../../shared/rules";
import { Button, Field, Modal, Select, Tag } from "./ui";

interface DailyPreparationsModalProps {
  open: boolean;
  onClose: () => void;
  draft: CharacterDraft | null;
  context: CharacterContext | null;
  derived: DerivedCharacter | null;
  onApply: (draft: CharacterDraft) => void;
}

interface PreparedGroup {
  spell: Spell;
  count: number;
  font: number;
  ordinary: number;
}

export function DailyPreparationsModal({
  open,
  onClose,
  draft,
  context,
  derived,
  onApply,
}: DailyPreparationsModalProps) {
  const [working, setWorking] = useState<CharacterDraft | null>(draft);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [selectedCantrip, setSelectedCantrip] = useState("");

  useEffect(() => {
    if (!open) return;
    setWorking(draft);
    setSelected({});
    setSelectedCantrip("");
  }, [open, draft]);

  const preparedRows = useMemo(
    () => (working && context ? preparedEntries(working, context) : []),
    [working, context]
  );
  const splits = useMemo(() => preparedRankSummaries(preparedRows), [preparedRows]);
  const spellErrors = useMemo(() => {
    if (!working || !context) return [];
    return computeCharacter(working, context).validation.filter(
      (issue) => issue.step === "spells" && issue.severity === "error"
    );
  }, [working, context]);

  if (!working || !context || !derived) return null;

  const classData = context.classData;
  const ranks = Array.from({ length: Math.max(1, derived.maxSpellRank) }, (_, index) => index + 1);
  const fontRank = derived.divineFontRank;
  const fontSlots = derived.divineFontSlots ?? 0;
  const fontChoices = deityFontChoices(context.deity);
  const fontChoice = effectiveFontChoice(working, context);
  const curriculumIds = new Set(
    derived.grantedSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank > 0)
      .map((spell) => spell.id)
  );
  const curriculumCantripIds = new Set(
    derived.grantedSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank === 0)
      .map((spell) => spell.id)
  );
  const curriculumRanks = new Set(
    derived.grantedSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank > 0)
      .map((spell) => spell.rank)
  );
  const cantripLimit = cantripPreparedLimitFor(classData);
  const preparedCantrips = preparedCantripIds(working, context)
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell) && spell.rank === 0);
  const availableCantrips = knownCantripIds(working, context)
    .map((id) => context.spells[id])
    .filter(
      (spell): spell is Spell =>
        Boolean(spell) && spell.rank === 0 && !spell.traits.includes("focus")
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const wizardExtra = classData?.name.toLowerCase() === "wizard" && curriculumCantripIds.size > 0;
  const maxPreparedCantrips = cantripLimit === null ? null : cantripLimit + (wizardExtra ? 1 : 0);
  const overCantripCapacity =
    maxPreparedCantrips !== null &&
    (preparedCantrips.length > maxPreparedCantrips ||
      (wizardExtra &&
        preparedCantrips.length > cantripLimit! &&
        !preparedCantrips.some((spell) => curriculumCantripIds.has(spell.id))));
  const overCapacity = spellErrors.length > 0 || overCantripCapacity;

  const availableAtRank = (rank: number): Spell[] => {
    const ids = new Set<string>([
      ...working.spells.known,
      ...preparedRows.map((row) => row.id),
      ...derived.grantedSpells
        .filter((spell) => spell.kind !== "focus" && spell.rank > 0)
        .map((spell) => spell.id),
    ]);
    return [...ids]
      .map((id) => context.spells[id])
      .filter((spell): spell is Spell => Boolean(spell) && spell.rank > 0 && spell.rank <= rank)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const preparedGroupsAt = (rank: number): PreparedGroup[] => {
    const groups = new Map<string, PreparedGroup>();
    for (const row of preparedRows) {
      if (row.rank !== rank) continue;
      const spell = context.spells[row.id];
      if (!spell) continue;
      const group = groups.get(row.id) ?? { spell, count: 0, font: 0, ordinary: 0 };
      group.count += 1;
      if (row.font) group.font += 1;
      else group.ordinary += 1;
      groups.set(row.id, group);
    }
    return [...groups.values()].sort((a, b) => a.spell.name.localeCompare(b.spell.name));
  };

  const canPrepare = (spell: Spell, rank: number) =>
    canPrepareSpellAtRank(working, derived, context, spell, rank);

  const prepare = (spell: Spell, rank: number) => {
    if (!canPrepare(spell, rank)) return;
    setWorking((current) =>
      current ? addPreparedSpellCopy(current, context, spell, rank) : current
    );
    setSelected((current) => ({ ...current, [rank]: "" }));
  };

  const remove = (spellId: string, rank: number) => {
    setWorking((current) =>
      current ? removePreparedCopy(current, context, spellId, rank) : current
    );
  };

  const prepareCantrip = (spell: Spell) => {
    if (!canPrepareCantrip(working, context, spell)) return;
    setWorking((current) => (current ? addPreparedCantrip(current, context, spell.id) : current));
    setSelectedCantrip("");
  };

  const removeCantrip = (spellId: string) => {
    setWorking((current) => (current ? removePreparedCantrip(current, context, spellId) : current));
  };

  const clearCantrips = () => {
    setWorking((current) =>
      current
        ? {
            ...current,
            spells: { ...current.spells, preparedCantrips: [] },
          }
        : current
    );
    setSelectedCantrip("");
  };

  const clearAll = () => {
    setWorking((current) =>
      current
        ? {
            ...current,
            spells: {
              ...current.spells,
              prepared: [],
              preparedByRank: {},
              preparedCantrips: [],
              preparedUsed: {},
              fontUsed: {},
              divineFontUsed: 0,
            },
          }
        : current
    );
    setSelected({});
    setSelectedCantrip("");
  };

  const apply = () => {
    if (overCapacity) return;
    const cantrips = preparedCantrips.map((spell) => spell.id);
    onApply({
      ...working,
      spells: {
        ...working.spells,
        preparedCantrips: cantrips,
        preparationsPending: false,
        preparedUsed: {},
        fontUsed: {},
        divineFontUsed: 0,
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Daily preparations"
      subtitle="Choose the spells and cantrips you have prepared for the day. Long rest restores HP, spell slots, and focus; this workflow sets today's prepared copies."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={apply}
            disabled={overCapacity}
            aria-label="Apply daily preparations"
          >
            Apply preparations
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row-between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="tiny muted">
            {preparedRows.length} prepared cop{preparedRows.length === 1 ? "y" : "ies"} today
          </span>
          <div className="row" style={{ gap: 6 }}>
            {working.spells.preparationsPending ? (
              <Tag tone="gold">Preparations pending</Tag>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={13} />}
              onClick={() => setWorking(draft)}
            >
              Reset changes
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        </div>
        {fontSlots > 0 && fontChoices.length > 1 ? (
          <Field
            label="Divine font"
            hint={`Only the chosen font spell can fill the rank ${fontRank ?? 1} font slots.`}
          >
            <Select
              aria-label="Divine font"
              value={fontChoice ?? ""}
              onChange={(event) => {
                const value = event.target.value as DivineFontChoice;
                setWorking((current) =>
                  current
                    ? {
                        ...current,
                        spells: {
                          ...current.spells,
                          fontChoice: value,
                          divineFontUsed: 0,
                          fontUsed: {},
                          preparedUsed: {},
                        },
                      }
                    : current
                );
              }}
            >
              <option value="" disabled>
                Choose Heal or Harm
              </option>
              {fontChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === "heal" ? "Heal" : "Harm"}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {overCantripCapacity ? (
          <div className="auth-error">
            Choose at most {maxPreparedCantrips} cantrips for today
            {wizardExtra ? ` (the extra must be a curriculum cantrip)` : ""}.
          </div>
        ) : spellErrors.length ? (
          <div className="auth-error">
            {spellErrors[0]?.message ?? "Resolve the prepared spell errors before applying."}
            {spellErrors.length > 1 ? ` (+${spellErrors.length - 1} more)` : ""}
          </div>
        ) : null}
        {cantripLimit !== null ? (
          <section
            className="prepared-at-rank"
            aria-labelledby="daily-prepared-cantrips"
            data-testid="daily-prepared-cantrips"
          >
            <div className="prepared-at-rank-head">
              <div>
                <span id="daily-prepared-cantrips" className="field-label">
                  Cantrips
                </span>
                <p className="tiny muted" style={{ margin: "2px 0 0" }}>
                  {preparedCantrips.length} / {maxPreparedCantrips ?? cantripLimit} prepared
                  {wizardExtra ? " · one extra curriculum cantrip" : ""}
                </p>
              </div>
              <Tag tone={preparedCantrips.length ? "gold" : "blue"}>
                {preparedCantrips.length} / {maxPreparedCantrips ?? cantripLimit}
              </Tag>
            </div>
            <div className="chip-row">
              {preparedCantrips.map((spell) => (
                <div key={spell.id} className="prepared-chip">
                  <strong>{spell.name}</strong>
                  {curriculumCantripIds.has(spell.id) ? <Tag tone="gold">Curriculum</Tag> : null}
                  <div className="prepared-stepper">
                    <button
                      type="button"
                      aria-label={`Remove prepared cantrip ${spell.name}`}
                      onClick={() => removeCantrip(spell.id)}
                    >
                      <Minus size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {!preparedCantrips.length ? (
                <p className="muted small">No cantrips prepared.</p>
              ) : null}
            </div>
            <div className="prepared-adder">
              <Select
                aria-label="Cantrip to prepare"
                value={selectedCantrip}
                onChange={(event) => setSelectedCantrip(event.target.value)}
              >
                <option value="">Choose a cantrip…</option>
                {availableCantrips.map((spell) => {
                  const room = canPrepareCantrip(working, context, spell);
                  return (
                    <option key={spell.id} value={spell.id} disabled={!room}>
                      {spell.name}
                      {curriculumCantripIds.has(spell.id) ? " · curriculum" : ""}
                      {!room ? " — full or already prepared" : ""}
                    </option>
                  );
                })}
              </Select>
              <Button
                size="sm"
                aria-label="Prepare selected cantrip"
                disabled={
                  !selectedCantrip ||
                  !availableCantrips.some(
                    (spell) =>
                      spell.id === selectedCantrip && canPrepareCantrip(working, context, spell)
                  )
                }
                onClick={() => {
                  const spell = availableCantrips.find((entry) => entry.id === selectedCantrip);
                  if (spell) prepareCantrip(spell);
                }}
              >
                <Plus size={13} /> Prepare
              </Button>
              {preparedCantrips.length ? (
                <Button size="sm" variant="ghost" onClick={clearCantrips}>
                  Clear cantrips
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}
        {ranks.map((rank) => {
          const groups = preparedGroupsAt(rank);
          const split = splits.get(rank);
          const ordinaryLimit = ordinaryPreparedLimitAt(working, derived, context.classData, rank);
          const fontLimit = fontRank === rank ? fontSlots : 0;
          const totalLimit = ordinaryLimit + fontLimit;
          const available = availableAtRank(rank);
          const selectedId = selected[rank] ?? "";
          const selectedSpell = selectedId ? (context.spells[selectedId] ?? null) : null;
          const selectedRoom = selectedSpell ? canPrepare(selectedSpell, rank) : false;
          if (!totalLimit && !groups.length) return null;
          return (
            <section
              key={rank}
              className="prepared-at-rank"
              aria-labelledby={`daily-prepared-rank-${rank}`}
            >
              <div className="prepared-at-rank-head">
                <div>
                  <span id={`daily-prepared-rank-${rank}`} className="field-label">
                    Rank {rank}
                  </span>
                  <p className="tiny muted" style={{ margin: "2px 0 0" }}>
                    {split?.ordinary ?? 0} / {ordinaryLimit} ordinary
                    {fontLimit ? ` · ${split?.font ?? 0} / ${fontLimit} font` : ""}
                    {split && split.total > totalLimit ? ` · ${split.total} total` : ""}
                    {curriculumRanks.has(rank) ? " · curriculum slot" : ""}
                  </p>
                </div>
                <Tag tone={split && split.total > 0 ? "gold" : "blue"}>
                  {split?.total ?? 0} / {totalLimit}
                </Tag>
              </div>
              <div className="chip-row">
                {groups.map((group) => (
                  <div
                    key={group.spell.id}
                    className={`prepared-chip ${group.font ? "is-font" : ""}`}
                    role="group"
                    aria-label={`Prepared ${group.spell.name} at rank ${rank}`}
                  >
                    <strong>{group.spell.name}</strong>
                    {group.spell.rank !== rank ? (
                      <span className="tiny muted">base rank {group.spell.rank}</span>
                    ) : null}
                    {group.font ? <Tag tone="gold">Font</Tag> : null}
                    <span className="tiny muted">
                      {group.font ? `${group.font} font` : ""}
                      {group.font && group.ordinary ? " · " : ""}
                      {group.ordinary ? `${group.ordinary} ordinary` : ""}
                    </span>
                    <div className="prepared-stepper">
                      <button
                        type="button"
                        aria-label={`Decrease prepared ${group.spell.name} at rank ${rank}`}
                        onClick={() => remove(group.spell.id, rank)}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{group.count}</span>
                      <button
                        type="button"
                        aria-label={`Increase prepared ${group.spell.name} at rank ${rank}`}
                        disabled={!canPrepare(group.spell, rank)}
                        onClick={() => prepare(group.spell, rank)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {!groups.length ? <p className="muted small">No spells prepared.</p> : null}
              </div>
              {available.length ? (
                <div className="prepared-adder">
                  <Select
                    aria-label={`Spell to prepare at rank ${rank}`}
                    value={selectedId}
                    onChange={(event) =>
                      setSelected((current) => ({ ...current, [rank]: event.target.value }))
                    }
                  >
                    <option value="">Choose a spell…</option>
                    {available.map((spell) => (
                      <option key={spell.id} value={spell.id} disabled={!canPrepare(spell, rank)}>
                        {spell.name}
                        {spell.rank !== rank ? ` (base rank ${spell.rank})` : ""}
                        {curriculumIds.has(spell.id) ? " · curriculum" : ""}
                        {!canPrepare(spell, rank) ? " — full" : ""}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    aria-label={`Prepare selected spell at rank ${rank}`}
                    disabled={!selectedSpell || !selectedRoom}
                    onClick={() => selectedSpell && prepare(selectedSpell, rank)}
                  >
                    Prepare
                  </Button>
                </div>
              ) : (
                <p className="tiny muted">
                  No eligible spells in the spellbook. Add spells from Edit character first.
                </p>
              )}
            </section>
          );
        })}
        {!ranks.some((rank) => {
          const ordinaryLimit = ordinaryPreparedLimitAt(working, derived, context.classData, rank);
          const fontLimit = fontRank === rank ? fontSlots : 0;
          const split = splits.get(rank);
          return ordinaryLimit + fontLimit > 0 || (split?.total ?? 0) > 0;
        }) ? (
          <p className="muted small">
            This character has no prepared spell slots yet. Raise their level or choose a
            spellcasting class in Edit character.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
