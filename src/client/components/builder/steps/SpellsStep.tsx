import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Coins,
  Dice5,
  Download,
  Dna,
  FileUp,
  FlaskConical,
  Heart,
  Loader2,
  Minus,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import {
  ABILITIES,
  ABILITY_DESCRIPTIONS,
  ABILITY_LABELS,
  ABILITY_SHORT,
  PROFICIENCY_NAMES,
  SIZES,
  SKILLS,
  SKILL_BY_ID,
  VISION_LABELS,
  type AbilityKey,
  type Ancestry,
  type Background,
  type CampaignRuleset,
  type CharacterContext,
  type CharacterDraft,
  type CharacterRecord,
  type ClassData,
  type ContentMode,
  type Deity,
  type DerivedCharacter,
  type Equipment,
  type Feat,
  type Heritage,
  type SkillId,
  type Spell,
} from "../../../../shared/types";
import {
  abilityMod,
  applicableChoiceGroups,
  casterInfo,
  classKeyOptions,
  computeCharacter,
  deitySkillOptions,
  emptyCharacterDraft,
  featSlotsFor,
  flexibleBoosts,
  grantedTrainedSkills,
  normalizeCharacterDraft,
  requiredExtraSkills,
  selectedChoiceOptions,
  selectedDeitySkill,
  signed,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
  startingWealthCp,
  titleCase,
  traitLabel,
  weaponDamageLabel,
} from "../../../../shared/rules";
import { api, formatCp, uploadImage } from "../../../api";
import { errorMessage } from "../../../stores";
import { useToasts } from "../../../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageEyebrow,
  ProgressBar,
  RichText,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
  Toggle,
} from "../../ui";
import {
  DeityPicker,
  EquipmentPicker,
  FeatPicker,
  SpellPicker,
} from "../pickers";
import { ContentSourceToggle } from "../ContentSourceToggle";
import { RunePicker } from "../RunePicker";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import type { BuilderProps } from "../shared";
import {
  StepHeading,
  ValidationNote,
  SearchInput,
  MiniFeatureList,
} from "../shared";

export function SpellsStep({ draft, update, derived, context, setStep, openPicker }: BuilderProps) {
  const classData = context.classData;
  const caster = casterInfo(classData);
  const tradition = caster.tradition ?? draft.spells.tradition;
  const classTrait = classData?.name.toLowerCase();
  const cantrips = draft.spells.cantrips.map((id) => context.spells[id]).filter((spell): spell is Spell => Boolean(spell));
  const known = draft.spells.known.map((id) => context.spells[id]).filter((spell): spell is Spell => Boolean(spell));
  const focus = draft.spells.focus.map((id) => context.spells[id]).filter((spell): spell is Spell => Boolean(spell));
  const slots = derived.spellSlots;
  const isFocusCaster = caster.progression === "focus";
  const repertoire = spellRepertoireLimits(classData, draft.level);
  const isPreparedCaster = ["animist", "cleric", "druid", "magus", "necromancer", "witch", "wizard"].includes(
    classData?.name.toLowerCase() ?? "",
  );
  const preparedCounts = new Map<string, number>();
  for (const id of draft.spells.prepared) preparedCounts.set(id, (preparedCounts.get(id) ?? 0) + 1);
  const preparedByRank = new Map<number, number>();
  for (const id of draft.spells.prepared) {
    const spell = context.spells[id];
    if (!spell) continue;
    preparedByRank.set(spell.rank, (preparedByRank.get(spell.rank) ?? 0) + 1);
  }
  const issues = derived.validation.filter((issue) => issue.step === "spells");
  const knownByRank = new Map<number, Spell[]>();
  for (const spell of known) {
    const list = knownByRank.get(spell.rank) ?? [];
    list.push(spell);
    knownByRank.set(spell.rank, list);
  }
  const addSpell = (spell: Spell, target: "cantrips" | "known" | "focus") =>
    update((current) => {
      const key = target;
      if (current.spells[key].includes(spell.id)) return current;
      return { ...current, spells: { ...current.spells, [key]: [...current.spells[key], spell.id] } };
    });
  const removeSpell = (id: string, target: "cantrips" | "known" | "focus") =>
    update((current) => ({
      ...current,
      spells: {
        ...current.spells,
        [target]: current.spells[target].filter((s) => s !== id),
        prepared: current.spells.prepared.filter((s) => s !== id),
      },
    }));

  if (caster.progression === "none") {
    return (
      <div className="step">
        <StepHeading
          eyebrow="Step 08 · Spells"
          title="No spellbook required."
          lede="Your class doesn't use spellcasting, though class features or archetypes may still grant magical tricks later."
        />
        <EmptyState
          icon={<FlaskConical size={28} />}
          title="Martial at heart"
          description="You can skip this step. If your character later gains a focus spell or innate magic, note it in Details."
          action={<Button variant="primary" onClick={() => setStep("gear")}>Continue to equipment</Button>}
        />
      </div>
    );
  }

  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 08 · Spells"
        title="What magic answers your call?"
        lede="Choose a tradition, learn cantrips and spells, and track your spell slots at the table. Full, bounded, psychic, and focus casters each use their own progression."
      />
      {caster.traditionOptions ? (
        <Card className="tradition-card">
          <h3>Magical tradition</h3>
          <p className="muted small">Your class draws power from one of the four traditions. Choose the one your bloodline, patron, or eidolon grants.</p>
          <div className="tradition-grid">
            {caster.traditionOptions.map((option) => (
              <button
                type="button"
                key={option}
                className={`tradition-option ${tradition === option ? "is-selected" : ""}`}
                onClick={() => update((current) => ({ ...current, spells: { ...current.spells, tradition: option } }))}
              >
                <Sparkles size={17} />
                <strong>{titleCase(option)}</strong>
                <span className="tiny muted">
                  {option === "arcane" ? "Wizardry and lore" : option === "divine" ? "Gods and faith" : option === "occult" ? "Mind and mystery" : "Nature and primal power"}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="tradition-inline">
          <Sparkles size={15} /> {titleCase(tradition || "")} tradition
        </div>
      )}

      {slots ? (
        <Card className="slots-card">
          <div className="row-between">
            <div>
              <h3>Spell slots</h3>
              <p className="muted small">Click a pip to mark it spent. Reset between sessions.</p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update((current) => ({ ...current, spells: { ...current.spells, slotsUsed: {} } }))
                }
              >
                Reset slots
              </Button>
              <Badge tone="gold">
                {caster.progression === "bounded" ? "Bounded caster" : "Full caster"}
              </Badge>
            </div>
          </div>
          {derived.spellSlotsNote ? (
            <p className="muted small" style={{ marginTop: 8 }}>{derived.spellSlotsNote}</p>
          ) : null}
          <div className="slot-rows">
            {slots.map((count, index) => {
              const rank = index + 1;
              const used = draft.spells.slotsUsed[String(rank)] ?? 0;
              return (
                <div key={rank} className="slot-row">
                  <span className="slot-rank">Rank {rank}</span>
                  <div className="slot-pips">
                    {Array.from({ length: count }).map((_, pip) => (
                      <button
                        key={pip}
                        type="button"
                        className={`slot-pip ${pip < used ? "is-used" : ""}`}
                        title={pip < used ? "Restore slot" : "Spend slot"}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            spells: {
                              ...current.spells,
                              slotsUsed: { ...current.spells.slotsUsed, [String(rank)]: pip < used ? pip : pip + 1 },
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                  <span className="tiny muted">{count - used} of {count} left</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="info-box">
          <CircleAlert size={16} />
          <p>{derived.spellSlotsNote ?? "This class has no spell slots."}</p>
        </div>
      )}

      {!isFocusCaster ? (
        <>
      <Card className="spell-section">
        <div className="row-between">
          <div>
            <h3>Cantrips</h3>
            <p className="muted small">
              {cantrips.length}
              {repertoire ? ` / ${repertoire.cantrips}` : ""} chosen · rank 0
            </p>
          </div>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            disabled={Boolean(repertoire && cantrips.length >= repertoire.cantrips)}
            onClick={() => openPicker({ kind: "spell", rank: 0, target: "cantrips" })}
          >
            Add cantrip
          </Button>
        </div>
        <div className="spell-chip-grid">
          {cantrips.map((spell) => (
            <div key={spell.id} className="spell-chip">
              <span><strong>{spell.name}</strong><span className="tiny muted"> · {spell.actions || "cast"}</span></span>
              <button type="button" className="icon-btn" aria-label={`Remove ${spell.name}`} onClick={() => removeSpell(spell.id, "cantrips")}><Minus size={13} /></button>
            </div>
          ))}
          {!cantrips.length ? <p className="muted small">No cantrips selected yet.</p> : null}
        </div>
      </Card>

      {Array.from({ length: derived.maxSpellRank }).map((_, index) => {
        const rank = index + 1;
        const spells = knownByRank.get(rank) ?? [];
        const rankSlots = slots?.[rank - 1] ?? 0;
        const preparedForRank = preparedByRank.get(rank) ?? 0;
        return (
          <Card key={rank} className="spell-section">
            <div className="row-between">
              <div>
                <h3>Rank {rank} spells</h3>
                <p className="muted small">
                  {spells.length}
                  {repertoire ? ` / ${repertoire.ranks[rank - 1] ?? 0}` : ""} chosen
                  {isPreparedCaster
                    ? ` · ${preparedForRank} / ${rankSlots} prepared`
                    : ""}
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                disabled={Boolean(repertoire && spells.length >= (repertoire.ranks[rank - 1] ?? 0))}
                onClick={() => openPicker({ kind: "spell", rank, target: "known" })}
              >
                Add spell
              </Button>
            </div>
            <div className="spell-list-compact">
              {spells.map((spell) => (
                <div key={spell.id} className="spell-row">
                  <div className="grow">
                    <strong>{spell.name}</strong>
                    <span className="tiny muted"> · {spell.actions || "—"} · {spell.range || "range —"}{spell.defense?.save ? ` · ${spell.defense.save}` : ""}</span>
                    {spell.damageText ? <span className="tiny gold-text"> · {spell.damageText}</span> : null}
                  </div>
                  {isPreparedCaster ? (
                    <div className="prepared-stepper" title={`${preparedCounts.get(spell.id) ?? 0} of ${rankSlots} rank ${rank} slots prepared`}>
                      <button
                        type="button"
                        onClick={() =>
                          update((current) => {
                            const prepared = [...current.spells.prepared];
                            const index = prepared.lastIndexOf(spell.id);
                            if (index >= 0) prepared.splice(index, 1);
                            return { ...current, spells: { ...current.spells, prepared } };
                          })
                        }
                        disabled={(preparedCounts.get(spell.id) ?? 0) === 0}
                        aria-label={`Remove one prepared ${spell.name}`}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{preparedCounts.get(spell.id) || 0}</span>
                      <button
                        type="button"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            spells: {
                              ...current.spells,
                              prepared: [...current.spells.prepared, spell.id],
                            },
                          }))
                        }
                        disabled={preparedForRank >= rankSlots}
                        aria-label={`Prepare another ${spell.name}`}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  ) : null}
                  <button type="button" className="icon-btn" aria-label={`Remove ${spell.name}`} onClick={() => removeSpell(spell.id, "known")}><Minus size={13} /></button>
                </div>
              ))}
              {!spells.length ? <p className="muted small">No rank {rank} spells selected.</p> : null}
            </div>
          </Card>
        );
      })}
        </>
      ) : null}

      <Card className="spell-section">
        <div className="row-between">
          <div>
            <h3>Focus spells</h3>
            <p className="muted small">Focus spells use your focus pool. {derived.focusPointsMax} focus point{derived.focusPointsMax === 1 ? "" : "s"}.</p>
          </div>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => openPicker({ kind: "spell", rank: null, focus: true, target: "focus" })}>
            Add focus spell
          </Button>
        </div>
        <div className="spell-chip-grid">
          {focus.map((spell) => (
            <div key={spell.id} className="spell-chip">
              <span><strong>{spell.name}</strong></span>
              <button type="button" className="icon-btn" aria-label={`Remove ${spell.name}`} onClick={() => removeSpell(spell.id, "focus")}><Minus size={13} /></button>
            </div>
          ))}
          {!focus.length ? <p className="muted small">No focus spells selected.</p> : null}
        </div>
      </Card>
      <div className="info-box">
        <BookOpen size={16} />
        <p>
          Prepared casters can prepare up to their available slots for each rank; the Prepare button stops when that
          rank is full. Spontaneous repertoire limits are checked for bards, oracles, sorcerers, and summoners. Slot
          pips are a table aid and reset between sessions.
        </p>
      </div>
      <ValidationNote issues={issues} />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("feats")}>Back</Button>
        <Button variant="primary" onClick={() => setStep("gear")} icon={<ArrowRight size={15} />}>Equipment</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
