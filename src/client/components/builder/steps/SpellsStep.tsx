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
  addPreparedCantrip,
  addPreparedSpellCopy,
  addStudiousSpell,
  applicableChoiceGroups,
  canPrepareCantrip,
  canPrepareSpellAtRank,
  canPrepareStudiousSpell,
  casterInfo,
  cantripLimitFor,
  cantripPreparedLimitFor,
  classKeyOptions,
  computeCharacter,
  deityFontChoices,
  deitySkillOptions,
  effectiveFontChoice,
  emptyCharacterDraft,
  featSlotsFor,
  flexibleBoosts,
  grantedTrainedSkills,
  isChosenFontSpell,
  isFontSpell,
  isPreparedCasterClass,
  knownSpellRanks,
  normalizeCharacterDraft,
  ordinaryPreparedLimitAt,
  preparedCantripIds,
  preparedEntries,
  preparedRankSummaries,
  removePreparedCantrip,
  removePreparedCopy,
  removePreparedSpellEverywhere,
  removeKnownSpellAtRank,
  removeStudiousSpell,
  requiredExtraSkills,
  selectedChoiceOptions,
  selectedDeitySkill,
  signed,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
  spellSourceLabel,
  startingWealthCp,
  titleCase,
  traitLabel,
  weaponDamageLabel,
  type DivineFontChoice,
} from "../../../../shared/rules";
import { api, formatCp, uploadImage } from "../../../api";
import { AnimistApparitionsCard } from "../../AnimistApparitionsCard";
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
import { DeityPicker, EquipmentPicker, FeatPicker, SpellPicker } from "../pickers";
import { ContentSourceToggle } from "../ContentSourceToggle";
import { RunePicker } from "../RunePicker";
import { DailyPreparationsModal } from "../../DailyPreparationsModal";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import { psiAmpFor, type PsiAmpInfo } from "../../../../shared/psiAmps";
import type { BuilderProps } from "../shared";
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

function spellTestId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function SpellsStep({ draft, update, derived, context, setStep, openPicker }: BuilderProps) {
  const [prepRanks, setPrepRanks] = useState<Record<string, number>>({});
  const [prepOpen, setPrepOpen] = useState(false);
  const [studiousChoice, setStudiousChoice] = useState("");
  const [multiclassPickerOpen, setMulticlassPickerOpen] = useState(false);
  const classData = context.classData;
  const caster = casterInfo(classData);
  const tradition = derived.casterTradition ?? draft.spells.tradition;
  const cantrips = draft.spells.cantrips
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const multiclassCantrips = draft.spells.multiclassCantrips
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const known = draft.spells.known
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const focus = draft.spells.focus
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const rituals = draft.spells.rituals
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const innate = draft.spells.innate
    .map((id) => context.spells[id])
    .filter((spell): spell is Spell => Boolean(spell));
  const grantedSpellIds = new Set(derived.grantedSpells.map((spell) => spell.id));
  const grantedFocus = derived.grantedSpells.filter((spell) => spell.kind === "focus");
  const grantedFocusIds = new Set(grantedFocus.map((spell) => spell.id));
  const manualFocus = focus.filter((spell) => !grantedFocusIds.has(spell.id));
  const grantedNonFocus = derived.grantedSpells.filter((spell) => spell.kind !== "focus");
  const grantedNonFocusIds = new Set(grantedNonFocus.map((spell) => spell.id));
  const grantedCantrips = grantedNonFocus
    .filter((spell) => spell.rank === 0)
    .map((spell) => context.spells[spell.id])
    .filter((spell): spell is Spell => Boolean(spell));
  const baseCantripCount = cantrips.filter((spell) => !grantedSpellIds.has(spell.id)).length;
  const slots = derived.spellSlots;
  const fontSlots = derived.divineFontSlots;
  const fontRank = derived.divineFontRank;
  const fontChoices = deityFontChoices(context.deity);
  const fontChoice = effectiveFontChoice(draft, {
    spells: context.spells,
    deity: context.deity,
    classData,
  });
  const fontNeedsChoice = Boolean(
    fontSlots && fontChoices.length > 1 && !draft.spells.fontChoice && !fontChoice
  );
  const curriculumIds = new Set(
    derived.grantedSpells.filter((spell) => spell.kind === "curriculum").map((spell) => spell.id)
  );
  const curriculumRanks = new Set(
    derived.grantedSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank > 0)
      .map((spell) => spell.rank)
  );
  const wizardCurriculum = classData?.name.toLowerCase() === "wizard";
  const isFocusCaster = caster.progression === "focus";
  const repertoire = spellRepertoireLimits(classData, draft.level);
  const knownCantripCap = cantripLimitFor(classData) ?? repertoire?.cantrips ?? null;
  const preparedCantripCap = cantripPreparedLimitFor(classData);
  const isPreparedCaster = isPreparedCasterClass(classData?.name);
  const isSpontaneousCaster =
    !isPreparedCaster && caster.progression !== "none" && caster.progression !== "focus";
  const isAnimist = classData?.name.toLowerCase() === "animist";
  const isPsychic = classData?.name.toLowerCase() === "psychic";
  const psiAmps: PsiAmpInfo[] = isPsychic
    ? derived.grantedSpells
        .map((spell) => psiAmpFor(spell.id))
        .filter((amp): amp is PsiAmpInfo => Boolean(amp))
    : [];
  const preparedListLabel = isAnimist ? "prepared list" : spellSourceLabel(classData);
  const cantripContext = { spells: context.spells, deity: context.deity, classData };
  const preparedCantripList = preparedCantripIds(draft, cantripContext);
  const preparedCantripSet = new Set(preparedCantripList);
  const curriculumCantripIds = new Set(
    derived.grantedSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank === 0)
      .map((spell) => spell.id)
  );
  const preparedCantripMax =
    preparedCantripCap === null
      ? null
      : preparedCantripCap + (wizardCurriculum && curriculumCantripIds.size > 0 ? 1 : 0);
  const traditionMissing = Boolean(caster.traditionOptions) && !tradition;
  const preparedRows = preparedEntries(draft, {
    spells: context.spells,
    deity: context.deity,
    classData,
  });
  const preparedSplits = preparedRankSummaries(preparedRows);
  const preparedSummaryBySpell = new Map<
    string,
    { rank: number; font: number; ordinary: number }[]
  >();
  for (const row of preparedRows) {
    const list = preparedSummaryBySpell.get(row.id) ?? [];
    const existing = list.find((entry) => entry.rank === row.rank);
    if (existing) {
      if (row.font) existing.font += 1;
      else existing.ordinary += 1;
    } else {
      list.push({ rank: row.rank, font: row.font ? 1 : 0, ordinary: row.font ? 0 : 1 });
    }
    preparedSummaryBySpell.set(row.id, list);
  }
  for (const list of preparedSummaryBySpell.values()) {
    list.sort((a, b) => a.rank - b.rank);
  }
  const fontLabel = fontChoice ? titleCase(fontChoice) : "Heal or Harm";
  const issues = derived.validation.filter((issue) => issue.step === "spells");
  const knownByRank = new Map<number, Spell[]>();
  const addRanked = (spell: Spell, rank = spell.rank) => {
    const list = knownByRank.get(rank) ?? [];
    if (!list.some((entry) => entry.id === spell.id)) list.push(spell);
    knownByRank.set(rank, list);
  };
  for (const spell of known) {
    const ranks = isSpontaneousCaster ? knownSpellRanks(draft, spell) : [spell.rank];
    for (const rank of ranks) addRanked(spell, rank);
  }
  for (const spell of grantedNonFocus) {
    const resolved = context.spells[spell.id];
    if (resolved) addRanked(resolved);
  }
  const addSpell = (spell: Spell, target: "cantrips" | "known" | "focus") =>
    update((current) => {
      const key = target;
      if (current.spells[key].includes(spell.id)) return current;
      let next: CharacterDraft = {
        ...current,
        spells: { ...current.spells, [key]: [...current.spells[key], spell.id] },
      };
      if (target === "cantrips" && isPreparedCaster) {
        if (canPrepareCantrip(next, cantripContext, spell)) {
          next = addPreparedCantrip(next, cantripContext, spell.id);
        }
      }
      return next;
    });
  const removeSpell = (id: string, target: "cantrips" | "known" | "focus" | "rituals" | "innate") =>
    update((current) => {
      const cleared = removePreparedSpellEverywhere(current, id);
      const knownRanks = { ...cleared.spells.knownRanks };
      if (target === "known") delete knownRanks[id];
      let next: CharacterDraft = {
        ...cleared,
        spells: {
          ...cleared.spells,
          knownRanks,
          [target]: cleared.spells[target].filter((s) => s !== id),
        },
      };
      if (target === "cantrips") {
        next = removePreparedCantrip(next, cantripContext, id);
      }
      return next;
    });

  const extraSpells = (
    <Card className="spell-section">
      <div className="row-between">
        <div>
          <h3>Rituals</h3>
          <p className="muted small">
            Rituals are downtime magic. They do not use spell slots; the sheet rolls the primary
            check and leaves the ritual's cost and consequences to the table.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          onClick={() => openPicker({ kind: "spell", rank: null, target: "rituals" })}
        >
          Add ritual
        </Button>
      </div>
      <div className="spell-chip-grid">
        {rituals.map((spell) => (
          <div key={spell.id} className="spell-chip">
            <span>
              <strong>{spell.name}</strong>
              <span className="tiny muted"> · rank {spell.rank}</span>
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${spell.name}`}
              onClick={() => removeSpell(spell.id, "rituals")}
            >
              <Minus size={13} />
            </button>
          </div>
        ))}
        {!rituals.length ? <p className="muted small">No rituals selected.</p> : null}
      </div>
      <div className="row-between" style={{ marginTop: 14 }}>
        <div>
          <h3>Innate spells</h3>
          <p className="muted small">
            Innate spells are granted by ancestry, heritage, feats, or items. Their uses reset
            during daily preparations; cantrips are at will.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          onClick={() => openPicker({ kind: "spell", rank: null, target: "innate" })}
        >
          Add innate spell
        </Button>
      </div>
      <div className="spell-chip-grid">
        {innate.map((spell) => (
          <div key={spell.id} className="spell-chip">
            <span>
              <strong>{spell.name}</strong>
              <span className="tiny muted">
                {" "}
                · {spell.rank === 0 ? "cantrip" : `rank ${spell.rank}`}
              </span>
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${spell.name}`}
              onClick={() => removeSpell(spell.id, "innate")}
            >
              <Minus size={13} />
            </button>
          </div>
        ))}
        {!innate.length ? <p className="muted small">No innate spells selected.</p> : null}
      </div>
    </Card>
  );

  const ordinaryLimitAt = (rank: number) =>
    ordinaryPreparedLimitAt(draft, derived, classData, rank);

  const selectedRankFor = (spell: Spell) => {
    const maxRank = derived.maxSpellRank || Math.max(1, spell.rank);
    const chosen = prepRanks[spell.id];
    return chosen && chosen >= spell.rank && chosen <= maxRank ? chosen : Math.max(1, spell.rank);
  };

  const rankHasRoom = (spell: Spell, rank: number) =>
    canPrepareSpellAtRank(
      draft,
      derived,
      { spells: context.spells, deity: context.deity, classData },
      spell,
      rank
    );

  const prepareSpell = (spell: Spell, rank: number) => {
    if (!rankHasRoom(spell, rank)) return;
    update((current) =>
      addPreparedSpellCopy(
        current,
        { spells: context.spells, deity: context.deity, classData },
        spell,
        rank
      )
    );
  };

  const removePrepared = (spellId: string, rank: number) =>
    update((current) =>
      removePreparedCopy(
        current,
        { spells: context.spells, deity: context.deity, classData },
        spellId,
        rank
      )
    );

  const toggleCantripPreparation = (spell: Spell) =>
    update((current) => {
      const prepared = preparedCantripIds(current, cantripContext);
      if (prepared.includes(spell.id)) {
        return removePreparedCantrip(current, cantripContext, spell.id);
      }
      if (!canPrepareCantrip(current, cantripContext, spell)) return current;
      return addPreparedCantrip(current, cantripContext, spell.id);
    });

  const preparedGroupsAt = (rank: number) => {
    const groups = new Map<
      string,
      { spell: Spell; count: number; font: number; ordinary: number }
    >();
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

  const rankOptionsFor = (spell: Spell) => {
    const maxRank = Math.max(1, derived.maxSpellRank);
    return Array.from(
      { length: Math.max(0, maxRank - spell.rank + 1) },
      (_, index) => spell.rank + index
    );
  };

  const focusCard = (
    <Card className="spell-section">
      <div className="row-between">
        <div>
          <h3>Focus spells</h3>
          <p className="muted small">
            Focus spells use your focus pool. {derived.focusPointsMax} focus point
            {derived.focusPointsMax === 1 ? "" : "s"}.
          </p>
        </div>
        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => openPicker({ kind: "spell", rank: null, focus: true, target: "focus" })}
        >
          Add focus spell
        </Button>
      </div>
      <div className="spell-chip-grid">
        {manualFocus.map((spell) => (
          <div key={spell.id} className="spell-chip">
            <span>
              <strong>{spell.name}</strong>
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${spell.name}`}
              onClick={() => removeSpell(spell.id, "focus")}
            >
              <Minus size={13} />
            </button>
          </div>
        ))}
        {grantedFocus.map((spell) => (
          <div key={`granted-${spell.id}`} className="spell-chip">
            <span>
              <strong>{spell.name}</strong>
              <span className="tiny muted">
                {" "}
                � granted{spell.rank ? ` � rank ${spell.rank}` : ""}
              </span>
            </span>
            <Tag tone="gold">Granted</Tag>
          </div>
        ))}
        {!manualFocus.length && !grantedFocus.length ? (
          <p className="muted small">No focus spells selected.</p>
        ) : null}
      </div>
    </Card>
  );

  if (caster.progression === "none") {
    return (
      <div className="step">
        <StepHeading
          eyebrow="Step 08 · Spells"
          title="No spellcasting preparation required."
          lede="Your class doesn't use spellcasting, though class features or archetypes may still grant magical tricks later."
        />
        <div className="info-box">
          <BookOpen size={16} />
          <p>
            Monk ki spells, ranger warden spells, and other focus abilities can be added below. They
            use the same focus pool and Refocus rules as full spellcasters.
          </p>
        </div>
        {focusCard}
        {extraSpells}
        <div className="step-actions">
          <Button variant="primary" onClick={() => setStep("gear")}>
            Continue to equipment
          </Button>
        </div>
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
      {isPreparedCaster ? (
        <div className="info-box">
          <BookOpen size={16} />
          <p>
            {draft.spells.preparationsPending
              ? "Long rest complete. Choose the spells and cantrips you have prepared today."
              : "Prepared casters choose their ranked spells and cantrips during daily preparations."}
          </p>
          <Button
            size="sm"
            variant={draft.spells.preparationsPending ? "primary" : "secondary"}
            onClick={() => setPrepOpen(true)}
          >
            Prepare today&apos;s spells
          </Button>
        </div>
      ) : null}
      {traditionMissing ? (
        <div className="info-box">
          <CircleAlert size={16} />
          <p>
            Choose a bloodline, patron, or eidolon on the Class step before adding ordinary spells.
            Class-granted spells still appear below.
          </p>
        </div>
      ) : null}
      {caster.traditionOptions ? (
        <Card className="tradition-card">
          <h3>Magical tradition</h3>
          {tradition ? (
            <p className="muted small">
              <strong>{titleCase(tradition)}</strong> · granted by your class choice.
            </p>
          ) : (
            <>
              <p className="muted small">
                Your class draws power from one of the four traditions. Choose the one your
                bloodline, patron, or eidolon grants.
              </p>
              <div className="tradition-grid">
                {caster.traditionOptions.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`tradition-option ${tradition === option ? "is-selected" : ""}`}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        spells: { ...current.spells, tradition: option },
                      }))
                    }
                  >
                    <Sparkles size={17} />
                    <strong>{titleCase(option)}</strong>
                    <span className="tiny muted">
                      {option === "arcane"
                        ? "Wizardry and lore"
                        : option === "divine"
                          ? "Gods and faith"
                          : option === "occult"
                            ? "Mind and mystery"
                            : "Nature and primal power"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
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
              <p className="muted small">
                Click a pip to mark it spent. Spell uses reset on a long rest or during daily
                preparations.
              </p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    spells: {
                      ...current.spells,
                      slotsUsed: {},
                      divineFontUsed: 0,
                      preparedUsed: {},
                      fontUsed: {},
                      apparitionUsed: {},
                    },
                  }))
                }
              >
                Reset spell uses
              </Button>
              <Badge tone="blue">{isPreparedCaster ? "Prepared" : "Spontaneous"}</Badge>
              <Badge tone="gold">
                {caster.progression === "bounded" ? "Bounded caster" : "Full caster"}
              </Badge>
            </div>
          </div>
          {fontSlots && fontChoices.length > 1 ? (
            <div
              className="row"
              style={{ gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}
            >
              <span className="field-label">Divine font</span>
              <Select
                aria-label="Divine font"
                value={draft.spells.fontChoice ?? fontChoice ?? ""}
                onChange={(event) => {
                  const value = event.target.value as DivineFontChoice;
                  update((current) => {
                    if (current.spells.fontChoice === value) return current;
                    return {
                      ...current,
                      spells: {
                        ...current.spells,
                        fontChoice: value,
                        divineFontUsed: 0,
                        fontUsed: {},
                      },
                    };
                  });
                }}
              >
                <option value="" disabled>
                  Choose Heal or Harm
                </option>
                {fontChoices.map((name) => (
                  <option key={name} value={name}>
                    {titleCase(name)}
                  </option>
                ))}
              </Select>
              <span className="tiny muted">Only the chosen spell can fill divine font slots.</span>
              {fontNeedsChoice && !fontChoice ? <Tag tone="gold">Choose one</Tag> : null}
            </div>
          ) : fontSlots && fontChoice ? (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {titleCase(fontChoice)} font chosen by your deity.
            </p>
          ) : null}
          {derived.spellSlotsNote ? (
            <p className="muted small" style={{ marginTop: 8 }}>
              {derived.spellSlotsNote}
            </p>
          ) : null}
          <div className="slot-rows">
            {slots.map((count, index) => {
              const rank = index + 1;
              const used = draft.spells.slotsUsed[String(rank)] ?? 0;
              const regularCount =
                fontRank === rank ? Math.max(0, count - (fontSlots ?? 0)) : count;
              const fontUsed = Math.max(
                0,
                Math.min(fontSlots ?? 0, draft.spells.divineFontUsed ?? 0)
              );
              return (
                <div key={rank}>
                  <div className="slot-row">
                    <span className="slot-rank">Rank {rank}</span>
                    <div className="slot-pips">
                      {Array.from({ length: regularCount }).map((_, pip) => (
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
                                slotsUsed: {
                                  ...current.spells.slotsUsed,
                                  [String(rank)]: pip < used ? pip : pip + 1,
                                },
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                    <span className="tiny muted">
                      {Math.max(0, regularCount - used)} of {regularCount} left
                    </span>
                  </div>
                  {fontRank === rank && fontSlots ? (
                    <div className="slot-row slot-row-font">
                      <span className="slot-rank">
                        {fontChoice ? `${titleCase(fontChoice)} font` : "Divine font"} · Rank {rank}
                      </span>
                      <div className="slot-pips">
                        {Array.from({ length: fontSlots }).map((_, pip) => (
                          <button
                            key={pip}
                            type="button"
                            className={`slot-pip is-font ${pip < fontUsed ? "is-used" : ""}`}
                            title={pip < fontUsed ? "Restore font slot" : "Spend font slot"}
                            onClick={() =>
                              update((current) => ({
                                ...current,
                                spells: {
                                  ...current.spells,
                                  divineFontUsed: pip < fontUsed ? pip : pip + 1,
                                },
                              }))
                            }
                          />
                        ))}
                      </div>
                      <span className="tiny muted">
                        {fontSlots - fontUsed} of {fontSlots} left · {fontLabel}
                      </span>
                    </div>
                  ) : null}
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

      {isAnimist ? (
        <AnimistApparitionsCard draft={draft} context={context} onChange={update} />
      ) : null}

      {derived.grantedSpells.length ? (
        <Card className="spell-section">
          <div className="sheet-section-head">
            <h2>Granted spells</h2>
            <span className="tiny muted">
              From your class choice; these do not use normal picks.
            </span>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {(["focus", "repertoire", "curriculum"] as const).map((kind) => {
              const spells = derived.grantedSpells.filter((spell) => spell.kind === kind);
              if (!spells.length) return null;
              return (
                <div key={kind}>
                  <span className="field-label">
                    {kind === "focus"
                      ? "Focus"
                      : kind === "repertoire"
                        ? "Repertoire gift"
                        : "Curriculum"}
                  </span>
                  <div className="chip-row" style={{ marginTop: 5 }}>
                    {spells.map((spell) => (
                      <Tag key={`${kind}-${spell.id}`} tone="gold">
                        {spell.name}
                        {spell.rank ? ` · rank ${spell.rank}` : ""}
                      </Tag>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {psiAmps.length ? (
        <Card className="spell-section" data-testid="psi-amps">
          <div className="row-between">
            <div>
              <h3>Psi amps</h3>
              <p className="muted small">
                Amping one of these cantrips costs 1 Focus Point. The cantrip remains castable at
                will without spending focus.
              </p>
            </div>
            <Tag tone="gold">{psiAmps.length} amps</Tag>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {psiAmps.map((amp) => (
              <div key={amp.spellId} className="prepared-at-rank" style={{ padding: "8px 10px" }}>
                <div className="row-between">
                  <strong>{amp.name}</strong>
                  <Tag tone="blue">{amp.mind.replace(/^The /, "")}</Tag>
                </div>
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                  {amp.summary}
                </p>
                {amp.heightened ? (
                  <p className="tiny gold-text" style={{ margin: "3px 0 0" }}>
                    {amp.heightened}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {!isFocusCaster ? (
        <>
          <Card className="spell-section">
            <div className="row-between">
              <div>
                <h3>Cantrips</h3>
                <p className="muted small">
                  {baseCantripCount}
                  {knownCantripCap !== null ? ` / ${knownCantripCap}` : ""} known
                  {isPreparedCaster && preparedCantripMax !== null
                    ? ` · ${preparedCantripList.length} / ${preparedCantripMax} prepared today`
                    : " · rank 0"}
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                disabled={
                  traditionMissing ||
                  (knownCantripCap !== null && baseCantripCount >= knownCantripCap)
                }
                onClick={() => openPicker({ kind: "spell", rank: 0, target: "cantrips" })}
              >
                Add cantrip
              </Button>
            </div>
            <div className="spell-chip-grid">
              {cantrips.map((spell) => {
                const prepared = preparedCantripSet.has(spell.id);
                return (
                  <div key={spell.id} className="spell-chip">
                    <span>
                      <strong>{spell.name}</strong>
                      <span className="tiny muted"> · {spell.actions || "cast"}</span>
                    </span>
                    {isPreparedCaster ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${prepared ? "Unprepare" : "Prepare"} ${spell.name}`}
                        aria-pressed={prepared}
                        title={prepared ? "Prepared for today" : "Prepare for today"}
                        onClick={() => toggleCantripPreparation(spell)}
                      >
                        {prepared ? <Check size={13} /> : <Plus size={13} />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${spell.name}`}
                      onClick={() => removeSpell(spell.id, "cantrips")}
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                );
              })}
              {grantedCantrips
                .filter((spell) => !draft.spells.cantrips.includes(spell.id))
                .map((spell) => {
                  const prepared = preparedCantripSet.has(spell.id);
                  return (
                    <div key={`granted-${spell.id}`} className="spell-chip">
                      <span>
                        <strong>{spell.name}</strong>
                        <span className="tiny muted"> · granted cantrip</span>
                      </span>
                      {isPreparedCaster ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${prepared ? "Unprepare" : "Prepare"} ${spell.name}`}
                          aria-pressed={prepared}
                          title={prepared ? "Prepared for today" : "Prepare for today"}
                          onClick={() => toggleCantripPreparation(spell)}
                        >
                          {prepared ? <Check size={13} /> : <Plus size={13} />}
                        </button>
                      ) : null}
                      <Tag tone="gold">Granted</Tag>
                    </div>
                  );
                })}
              {!cantrips.length && !grantedCantrips.length ? (
                <p className="muted small">No cantrips selected yet.</p>
              ) : null}
            </div>
            {isPreparedCaster ? (
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Only cantrips marked as prepared are castable at the table.
                {wizardCurriculum && curriculumCantripIds.size
                  ? " One extra prepared cantrip may come from your curriculum."
                  : ""}
              </p>
            ) : null}
          </Card>

          {derived.multiclassCaster ? (
            <Card className="spell-section" data-testid="multiclass-cantrips">
              <div className="row-between">
                <div>
                  <h3>{derived.multiclassCaster.className} Dedication cantrips</h3>
                  <p className="muted small">
                    Choose up to {derived.multiclassCaster.cantripLimit}{" "}
                    {derived.multiclassCaster.tradition} cantrip
                    {derived.multiclassCaster.cantripLimit === 1 ? "" : "s"} from the dedication.
                  </p>
                </div>
                <Badge
                  tone={
                    multiclassCantrips.length >= derived.multiclassCaster.cantripLimit
                      ? "green"
                      : "gold"
                  }
                >
                  {multiclassCantrips.length} / {derived.multiclassCaster.cantripLimit}
                </Badge>
              </div>
              <div className="chip-row">
                {multiclassCantrips.map((spell) => (
                  <span className="chip" key={spell.id}>
                    {spell.name}
                    <button
                      type="button"
                      className="chip-remove"
                      aria-label={`Remove ${spell.name} from dedication cantrips`}
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          spells: {
                            ...current.spells,
                            multiclassCantrips: current.spells.multiclassCantrips.filter(
                              (id) => id !== spell.id
                            ),
                          },
                        }))
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  icon={<Plus size={13} />}
                  disabled={multiclassCantrips.length >= derived.multiclassCaster.cantripLimit}
                  onClick={() => setMulticlassPickerOpen(true)}
                >
                  Add dedication cantrip
                </Button>
              </div>
            </Card>
          ) : null}

          {derived.studiousSlots ? (
            <Card className="spell-section" data-testid="studious-slots">
              <div className="row-between">
                <div>
                  <h3>Studious slots</h3>
                  <p className="muted small">
                    Rank {derived.studiousSlots.rank} · {draft.spells.studiousPrepared.length} /{" "}
                    {derived.studiousSlots.count} prepared. These slots only hold your studious
                    spells.
                  </p>
                </div>
                <Tag tone={draft.spells.studiousPrepared.length ? "gold" : "blue"}>
                  {draft.spells.studiousPrepared.length} / {derived.studiousSlots.count}
                </Tag>
              </div>
              <div className="chip-row">
                {derived.studiousSlots.spells
                  .map((spell) => ({
                    spell,
                    count: draft.spells.studiousPrepared.filter((id) => id === spell.id).length,
                  }))
                  .filter((entry) => entry.count > 0)
                  .map(({ spell, count }) => (
                    <div key={spell.id} className="prepared-chip">
                      <strong>{spell.name}</strong>
                      <span className="tiny muted"> · rank {spell.rank}</span>
                      <div className="prepared-stepper">
                        <button
                          type="button"
                          aria-label={`Remove studious ${spell.name}`}
                          onClick={() =>
                            update((current) => removeStudiousSpell(current, classData, spell.id))
                          }
                        >
                          <Minus size={12} />
                        </button>
                        <span>{count}</span>
                        <button
                          type="button"
                          aria-label={`Add studious ${spell.name}`}
                          disabled={!canPrepareStudiousSpell(draft, classData, spell.id)}
                          onClick={() =>
                            update((current) => addStudiousSpell(current, classData, spell.id))
                          }
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                {!draft.spells.studiousPrepared.length ? (
                  <p className="muted small">No studious spells prepared yet.</p>
                ) : null}
              </div>
              <div className="prepared-adder">
                <Select
                  aria-label="Studious spell to prepare"
                  value={studiousChoice}
                  onChange={(event) => setStudiousChoice(event.target.value)}
                >
                  <option value="">Choose a studious spell…</option>
                  {derived.studiousSlots.spells.map((spell) => {
                    const room = canPrepareStudiousSpell(draft, classData, spell.id);
                    return (
                      <option key={spell.id} value={spell.id} disabled={!room}>
                        {spell.name} · rank {spell.rank}
                        {!room ? " — full" : ""}
                      </option>
                    );
                  })}
                </Select>
                <Button
                  size="sm"
                  aria-label="Prepare selected studious spell"
                  disabled={
                    !studiousChoice || !canPrepareStudiousSpell(draft, classData, studiousChoice)
                  }
                  onClick={() => {
                    if (!studiousChoice) return;
                    update((current) => addStudiousSpell(current, classData, studiousChoice));
                    setStudiousChoice("");
                  }}
                >
                  Prepare
                </Button>
              </div>
            </Card>
          ) : null}

          {isPreparedCaster ? (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              To upcast, choose a higher preparation rank in the spell&apos;s row. Each rank card
              shows the copies that fill its slots.
            </p>
          ) : null}

          {Array.from({ length: derived.maxSpellRank }).map((_, index) => {
            const rank = index + 1;
            const spells = knownByRank.get(rank) ?? [];
            const chosenSpells = spells.filter((spell) => !grantedNonFocusIds.has(spell.id));
            const grantedForRank = spells.length - chosenSpells.length;
            const rankSlots = slots?.[rank - 1] ?? 0;
            const split = preparedSplits.get(rank);
            const preparedForRank = split?.total ?? 0;
            const fontPrepared = split?.font ?? 0;
            const ordinaryPrepared = split?.ordinary ?? 0;
            const fontSlotsForRank = fontRank === rank ? (fontSlots ?? 0) : 0;
            const ordinaryRankSlots = ordinaryLimitAt(rank);
            const preparedGroups = preparedGroupsAt(rank);
            return (
              <Card key={rank} className="spell-section" data-testid={`spell-rank-${rank}`}>
                <div className="row-between">
                  <div>
                    <h3>
                      Rank {rank} {preparedListLabel}
                    </h3>
                    <p className="muted small" data-testid={`rank-summary-${rank}`}>
                      {chosenSpells.length}
                      {repertoire ? ` / ${repertoire.ranks[rank - 1] ?? 0}` : ""}{" "}
                      {isPreparedCaster ? `in ${preparedListLabel}` : "known"}
                      {grantedForRank ? ` + ${grantedForRank} granted` : ""}
                      {isPreparedCaster
                        ? fontSlotsForRank
                          ? ` · ${ordinaryPrepared} / ${ordinaryRankSlots} ordinary · ${fontPrepared} / ${fontSlotsForRank} font (${preparedForRank} total)`
                          : ` · ${preparedForRank} / ${rankSlots} prepared${
                              wizardCurriculum && curriculumRanks.has(rank)
                                ? " · 1 curriculum slot"
                                : ""
                            }`
                        : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    icon={<Plus size={14} />}
                    aria-label={`Add rank ${rank} spell to ${preparedListLabel}`}
                    disabled={
                      traditionMissing ||
                      Boolean(
                        repertoire && chosenSpells.length >= (repertoire.ranks[rank - 1] ?? 0)
                      )
                    }
                    onClick={() =>
                      openPicker(
                        isPreparedCaster
                          ? { kind: "spell", rank, target: "known" }
                          : {
                              kind: "spell",
                              rank: null,
                              maxRank: rank,
                              target: "knownAtRank",
                              learnRank: rank,
                            }
                      )
                    }
                  >
                    Add spell
                  </Button>
                </div>
                {isPreparedCaster ? (
                  <div
                    className="prepared-at-rank"
                    role="group"
                    aria-labelledby={`prepared-rank-${rank}-label`}
                    data-testid={`prepared-rank-${rank}`}
                  >
                    <div className="prepared-at-rank-head">
                      <span id={`prepared-rank-${rank}-label`} className="field-label">
                        Prepared at rank {rank}
                      </span>
                    </div>
                    <div className="chip-row">
                      {preparedGroups.map((group) => (
                        <div
                          key={group.spell.id}
                          className={`prepared-chip ${group.font ? "is-font" : ""}`}
                          role="group"
                          aria-label={`Prepared ${group.spell.name} at rank ${rank}`}
                          data-testid={`prepared-${rank}-${spellTestId(group.spell.name)}`}
                        >
                          <strong>{group.spell.name}</strong>
                          {group.spell.rank !== rank ? (
                            <span className="tiny muted">base rank {group.spell.rank}</span>
                          ) : null}
                          {group.font ? <Tag tone="gold">Font</Tag> : null}
                          {group.font || group.ordinary ? (
                            <span className="tiny muted">
                              {group.font ? `${group.font} font` : ""}
                              {group.font && group.ordinary ? " · " : ""}
                              {group.ordinary ? `${group.ordinary} ordinary` : ""}
                            </span>
                          ) : null}
                          <div className="prepared-stepper">
                            <button
                              type="button"
                              onClick={() => removePrepared(group.spell.id, rank)}
                              aria-label={`Decrease prepared ${group.spell.name} at rank ${rank}`}
                            >
                              <Minus size={12} />
                            </button>
                            <span>{group.count}</span>
                            <button
                              type="button"
                              onClick={() => prepareSpell(group.spell, rank)}
                              disabled={!rankHasRoom(group.spell, rank)}
                              aria-label={`Increase prepared ${group.spell.name} at rank ${rank}`}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!preparedGroups.length ? (
                        <p className="muted small">No rank {rank} spells prepared yet.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="spell-list-compact">
                  {spells.map((spell) => {
                    const grantedSpell = grantedNonFocusIds.has(spell.id);
                    const selectedRank = selectedRankFor(spell);
                    const rankChoices = rankOptionsFor(spell);
                    const canPrepare = rankHasRoom(spell, selectedRank);
                    return (
                      <div
                        key={spell.id}
                        className="spell-row"
                        role="group"
                        aria-label={`${spell.name} ${preparedListLabel} row`}
                        data-testid={`spellbook-row-${spellTestId(spell.name)}`}
                      >
                        <div className="grow">
                          <strong>{spell.name}</strong>
                          {rank !== spell.rank ? (
                            <span className="tiny muted"> base rank {spell.rank}</span>
                          ) : null}
                          {grantedSpell ? <Tag tone="gold">Granted</Tag> : null}
                          <span className="tiny muted">
                            {" "}
                            · {spell.actions || "—"} · {spell.range || "range —"}
                            {spell.defense?.save ? ` · ${spell.defense.save}` : ""}
                          </span>
                          {spell.damageText ? (
                            <span className="tiny gold-text"> · {spell.damageText}</span>
                          ) : null}
                          {preparedSummaryBySpell.has(spell.id) ? (
                            <span className="tiny gold-text">
                              {" "}
                              · Prepared{" "}
                              {preparedSummaryBySpell
                                .get(spell.id)!
                                .flatMap((entry) => {
                                  const parts: string[] = [];
                                  if (entry.font) {
                                    parts.push(`rank ${entry.rank} font ×${entry.font}`);
                                  }
                                  if (entry.ordinary) {
                                    parts.push(`rank ${entry.rank} ordinary ×${entry.ordinary}`);
                                  }
                                  return parts;
                                })
                                .join(", ")}
                            </span>
                          ) : null}
                          {isSpontaneousCaster && knownSpellRanks(draft, spell).length > 1 ? (
                            <span className="tiny muted">
                              {" "}
                              · learned at ranks {knownSpellRanks(draft, spell).join(", ")}
                            </span>
                          ) : null}
                        </div>
                        {isPreparedCaster ? (
                          <div className="prepared-adder">
                            <Select
                              aria-label={`Preparation rank for ${spell.name}`}
                              value={String(selectedRank)}
                              onChange={(event) =>
                                setPrepRanks((current) => ({
                                  ...current,
                                  [spell.id]: Number(event.target.value),
                                }))
                              }
                            >
                              {rankChoices.map((option) => {
                                const optionFont = preparedSplits.get(option)?.font ?? 0;
                                const fontRoom =
                                  fontRank === option &&
                                  isFontSpell(spell, context.deity) &&
                                  (fontChoice === null ||
                                    isChosenFontSpell(spell, context.deity, fontChoice)) &&
                                  optionFont < (fontSlots ?? 0);
                                const room = rankHasRoom(spell, option);
                                return (
                                  <option key={option} value={option} disabled={!room}>
                                    Rank {option}
                                    {option === spell.rank ? " (base)" : ""}
                                    {fontRoom ? " · font first" : ""}
                                    {!room ? " — full" : ""}
                                  </option>
                                );
                              })}
                            </Select>
                            <Button
                              size="sm"
                              aria-label={`Prepare ${spell.name} at rank ${selectedRank}`}
                              disabled={!canPrepare}
                              onClick={() => prepareSpell(spell, selectedRank)}
                            >
                              Prepare
                            </Button>
                          </div>
                        ) : null}
                        {grantedSpell ? null : (
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={
                              isSpontaneousCaster
                                ? `Remove ${spell.name} from rank ${rank}`
                                : `Remove ${spell.name} from ${preparedListLabel}`
                            }
                            onClick={() =>
                              isSpontaneousCaster
                                ? update((current) => removeKnownSpellAtRank(current, spell, rank))
                                : removeSpell(spell.id, "known")
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!spells.length ? (
                    <p className="muted small">No rank {rank} spells selected.</p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </>
      ) : null}

      {!isPreparedCaster && caster.progression !== "focus" && draft.level >= 3 ? (
        <Card className="spell-section">
          <h3>Signature spells</h3>
          <p className="muted small">
            Choose one known spell per rank. Only signature spells can be heightened freely when you
            cast them at the table. Selecting a spell replaces any other signature spell of the same
            rank.
          </p>
          <div className="spell-chip-grid">
            {known
              .filter((spell) => spell.rank > 0)
              .map((spell) => {
                const signature = draft.spells.signature ?? [];
                const selected = signature.includes(spell.id);
                return (
                  <button
                    type="button"
                    key={spell.id}
                    className={`spell-chip ${selected ? "is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() =>
                      update((current) => {
                        const currentSignature = current.spells.signature ?? [];
                        const next = currentSignature.includes(spell.id)
                          ? currentSignature.filter((id) => id !== spell.id)
                          : [
                              ...currentSignature.filter(
                                (id) => context.spells[id]?.rank !== spell.rank
                              ),
                              spell.id,
                            ];
                        return {
                          ...current,
                          spells: { ...current.spells, signature: next },
                        };
                      })
                    }
                  >
                    <span>
                      <strong>{spell.name}</strong>
                      <span className="tiny muted"> rank {spell.rank}</span>
                    </span>
                    {selected ? <Tag tone="gold">Signature</Tag> : null}
                  </button>
                );
              })}
            {!known.some((spell) => spell.rank > 0) ? (
              <p className="muted small">Add a known spell before choosing signature spells.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="spell-section">
        <div className="row-between">
          <div>
            <h3>Focus spells</h3>
            <p className="muted small">
              Focus spells use your focus pool. {derived.focusPointsMax} focus point
              {derived.focusPointsMax === 1 ? "" : "s"}.
            </p>
          </div>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => openPicker({ kind: "spell", rank: null, focus: true, target: "focus" })}
          >
            Add focus spell
          </Button>
        </div>
        <div className="spell-chip-grid">
          {manualFocus.map((spell) => (
            <div key={spell.id} className="spell-chip">
              <span>
                <strong>{spell.name}</strong>
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${spell.name}`}
                onClick={() => removeSpell(spell.id, "focus")}
              >
                <Minus size={13} />
              </button>
            </div>
          ))}
          {grantedFocus.map((spell) => (
            <div key={`granted-${spell.id}`} className="spell-chip">
              <span>
                <strong>{spell.name}</strong>
                <span className="tiny muted">
                  {" "}
                  · granted{spell.rank ? ` · rank ${spell.rank}` : ""}
                </span>
              </span>
              <Tag tone="gold">Granted</Tag>
            </div>
          ))}
          {!manualFocus.length && !grantedFocus.length ? (
            <p className="muted small">No focus spells selected.</p>
          ) : null}
        </div>
      </Card>
      {extraSpells}
      {derived.multiclassCaster ? (
        <SpellPicker
          open={multiclassPickerOpen}
          onClose={() => setMulticlassPickerOpen(false)}
          rank={0}
          tradition={derived.multiclassCaster.tradition}
          classTrait={derived.multiclassCaster.className.toLowerCase()}
          expanded={draft.contentMode === "expanded"}
          onExpandedChange={() => undefined}
          contentModeLocked
          legacyDefault={draft.includeLegacy}
          legacyLocked
          excludeIds={[
            ...draft.spells.cantrips,
            ...draft.spells.multiclassCantrips,
            ...derived.grantedSpells.map((spell) => spell.id),
          ]}
          onSelect={(spell) => {
            update((current) => {
              if (current.spells.multiclassCantrips.includes(spell.id)) return current;
              if (
                current.spells.multiclassCantrips.length >= derived.multiclassCaster!.cantripLimit
              ) {
                return current;
              }
              return {
                ...current,
                spells: {
                  ...current.spells,
                  multiclassCantrips: [...current.spells.multiclassCantrips, spell.id],
                },
              };
            });
            setMulticlassPickerOpen(false);
          }}
        />
      ) : null}
      <div className="info-box">
        <BookOpen size={16} />
        <p>
          Prepared casters choose the slot rank for each copy; a higher-rank slot heightens a
          lower-rank spell. Cleric divine font is counted separately: Heal/Harm copies prepared at
          the font rank fill font slots first, and extra copies use ordinary slots at that rank.
          Each duplicate uses a slot. Spontaneous repertoire limits are checked for bards, oracles,
          sorcerers, and summoners. Prepared cantrips are chosen separately from ranked spells. Slot
          pips are a table aid and reset on a long rest or during daily preparations.
        </p>
      </div>
      <DailyPreparationsModal
        open={prepOpen}
        onClose={() => setPrepOpen(false)}
        draft={draft}
        context={context}
        derived={derived}
        onApply={(next) => {
          update(() => next);
          setPrepOpen(false);
        }}
      />
      <ValidationNote issues={issues} />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("feats")}>
          Back
        </Button>
        <Button variant="primary" onClick={() => setStep("gear")} icon={<ArrowRight size={15} />}>
          Equipment
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------
