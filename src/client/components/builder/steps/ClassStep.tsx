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
import { DeityPicker, EquipmentPicker, FeatPicker, SpellPicker } from "../pickers";
import { ContentSourceToggle } from "../ContentSourceToggle";
import { RunePicker } from "../RunePicker";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import { CLASS_GRANTS } from "../../../../shared/classGrants";
import type { BuilderProps } from "../shared";
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

function grantSummary(
  grant:
    | {
        feats?: { name: string }[];
        spells?: { name: string; kind: string }[];
      }
    | undefined
): string {
  if (!grant) return "";
  const parts = (grant.feats ?? []).map((feat) => feat.name);
  const byKind = new Map<string, string[]>();
  for (const spell of grant.spells ?? []) {
    const list = byKind.get(spell.kind) ?? [];
    list.push(spell.name);
    byKind.set(spell.kind, list);
  }
  const labels: Record<string, string> = {
    focus: "focus",
    repertoire: "gift",
    curriculum: "curriculum",
  };
  for (const [kind, names] of byKind) {
    parts.push(
      names.length <= 2 ? names.join(" / ") : `${names.length} ${labels[kind] ?? kind} spells`
    );
  }
  return parts.join(" · ");
}

export function ClassStep({
  draft,
  update,
  staticData,
  derived,
  context,
  setStep,
  openPicker,
  contentMode,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
}: BuilderProps) {
  const [query, setQuery] = useState("");
  const [legacy, setLegacy] = useState(legacyDefault);
  useEffect(() => {
    setLegacy(legacyDefault);
  }, [legacyDefault]);
  const expanded = contentMode === "expanded";
  const classes = staticData.classes.filter((cls) => {
    if (!legacy && !cls.remaster) return false;
    if (!expanded && cls.id !== draft.classId && !isCoreSource(cls.source)) return false;
    const q = query.trim().toLowerCase();
    return !q || `${cls.name} ${cls.source}`.toLowerCase().includes(q);
  });
  const selected = staticData.classes.find((cls) => cls.id === draft.classId) ?? null;
  const keyOptions = selected ? classKeyOptions(draft, selected) : [];
  const groups = selected ? applicableChoiceGroups(draft, selected) : [];
  const chosen = selected ? selectedChoiceOptions(draft, selected) : [];
  const needsDeity = Boolean(
    selected?.features.some((feature) => feature.name.toLowerCase().startsWith("deity (")) ||
    selected?.name.toLowerCase() === "cleric" ||
    selected?.name.toLowerCase() === "champion"
  );
  const deity = context.deity;
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 04 · Class"
        title="What do you fight with?"
        lede="Your class is the engine of your character: hit points, proficiencies, feats, and the shape of your turns. Choose a calling."
      />
      <div className="browse-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search classes…" />
        <Toggle
          checked={legacy}
          onChange={(value) => {
            setLegacy(value);
            update((current) => ({ ...current, includeLegacy: value }));
          }}
          label="Include legacy"
          disabled={legacyLocked}
        />
        <ContentSourceToggle
          mode={contentMode}
          onChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
          disabled={contentModeLocked}
        />
      </div>
      <div className="selection-grid class-grid">
        {classes.map((cls) => (
          <button
            type="button"
            key={cls.id}
            className={`selection-card ${draft.classId === cls.id ? "is-selected" : ""}`}
            onClick={() =>
              update((current) => {
                if (current.classId === cls.id) return current;
                return {
                  ...current,
                  classId: cls.id,
                  keyAbility: null,
                  classChoices: {},
                  deityId: null,
                  deitySkill: null,
                  spells: {
                    ...current.spells,
                    tradition: null,
                    cantrips: [],
                    known: [],
                    prepared: [],
                    focus: [],
                    slotsUsed: {},
                  },
                  feats: { ...current.feats, class: {} },
                };
              })
            }
          >
            <span className="selection-emblem">
              <Swords size={19} />
            </span>
            <span className="selection-copy">
              <span className="selection-name">{cls.name}</span>
              <span className="selection-sub">
                {cls.hp} HP · {cls.keyAbility.map((a) => ABILITY_SHORT[a]).join(" / ") || "Special"}
              </span>
              <span className="selection-source">{cls.source}</span>
            </span>
            {draft.classId === cls.id ? (
              <CheckCircle2 size={17} className="selection-check" />
            ) : null}
          </button>
        ))}
      </div>
      {selected ? (
        <>
          <Card className="selection-detail">
            <div className="selection-detail-head">
              <div>
                <PageEyebrow>Selected class</PageEyebrow>
                <h2>{selected.name}</h2>
                <p className="muted">
                  {selected.source} · {selected.rarity}
                </p>
              </div>
              <div className="chip-row">
                <Tag tone="gold">{selected.hp} HP</Tag>
                <Tag tone="gold">{selected.spellcasting ? "Spellcaster" : "Martial"}</Tag>
                <Tag>{selected.perception ? "Perception trained" : ""}</Tag>
              </div>
            </div>
            <div className="detail-columns">
              <div>
                <RichText html={selected.description} />
              </div>
              <div className="class-facts">
                <div>
                  <span>Saving throws</span>
                  <strong>
                    Fort {selected.savingThrows.fortitude} · Ref {selected.savingThrows.reflex} ·
                    Will {selected.savingThrows.will}
                  </strong>
                </div>
                <div>
                  <span>Key ability</span>
                  <strong>
                    {selected.keyAbility.map((a) => ABILITY_LABELS[a]).join(" or ") ||
                      "Chosen by subclass"}
                  </strong>
                </div>
                <div>
                  <span>Skills</span>
                  <strong>
                    {selected.trainedSkills.value.map(titleCase).join(", ") || "—"} +{" "}
                    {selected.trainedSkills.additional} choice
                    {selected.trainedSkills.additional === 1 ? "" : "s"}
                  </strong>
                </div>
                <div>
                  <span>Feat levels</span>
                  <strong>Class {selected.featLevels.class.join(", ") || "—"}</strong>
                </div>
              </div>
            </div>
          </Card>

          <div className="class-choice-section">
            <div className="section-title" style={{ marginBottom: 12 }}>
              <div>
                <h2>Class choices</h2>
                <p>These determine your subclass, doctrine, bloodline, or specialty.</p>
              </div>
            </div>
            {needsDeity ? (
              <Card className="choice-group">
                <div className="choice-group-head">
                  <div>
                    <h3>Deity</h3>
                    <p className="muted small">
                      Your faith grants a skill, domains, a divine font, and a favored weapon.
                    </p>
                  </div>
                  <Button variant="gold" size="sm" onClick={() => openPicker({ kind: "deity" })}>
                    {deity ? "Change deity" : "Choose deity"}
                  </Button>
                </div>
                {deity ? (
                  <div className="deity-summary">
                    <div>
                      <strong>{deity.name}</strong>
                      <span className="muted small"> · {deity.source}</span>
                    </div>
                    <div className="chip-row">
                      {deity.font.map((font) => (
                        <Tag key={font} tone="gold">
                          {titleCase(font)}
                        </Tag>
                      ))}
                      {(deity.skill ?? []).map((skill) => (
                        <Tag key={skill} tone="green">
                          {titleCase(skill)}
                        </Tag>
                      ))}
                      {deity.weapons.map((weapon) => (
                        <Tag key={weapon}>{weapon}</Tag>
                      ))}
                    </div>
                    {deitySkillOptions(deity).length > 1 ? (
                      <Field label="Deity-granted skill">
                        <Select
                          value={selectedDeitySkill(draft, deity) ?? ""}
                          onChange={(event) =>
                            update((current) => ({
                              ...current,
                              deitySkill: event.target.value || null,
                            }))
                          }
                        >
                          <option value="">Choose a skill…</option>
                          {deitySkillOptions(deity).map((skill) => (
                            <option key={skill} value={skill}>
                              {titleCase(skill)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted small">No deity selected yet.</p>
                )}
              </Card>
            ) : null}
            {groups.map((group) => {
              const picks = draft.classChoices[group.key] ?? [];
              const optionList = group.options.filter((option) => {
                if (option.level > draft.level) return false;
                if (expanded || picks.includes(option.id)) return true;
                if (!legacy && !option.remaster) return false;
                return isCoreSource(option.source);
              });
              return (
                <Card key={group.key} className="choice-group">
                  <div className="choice-group-head">
                    <div>
                      <h3>{group.prompt}</h3>
                      <p className="muted small">
                        {group.sourceFeature?.name ? `${group.sourceFeature.name} · ` : ""}
                        {group.count === 1 ? "Choose one" : `Choose ${group.count}`}
                      </p>
                    </div>
                    <Badge tone={picks.length === group.count ? "green" : "gold"}>
                      {picks.length}/{group.count}
                    </Badge>
                  </div>
                  <div className="choice-options">
                    {optionList.map((option) => {
                      const selectedOption = picks.includes(option.id);
                      const grant = CLASS_GRANTS[option.id];
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={`choice-option ${selectedOption ? "is-selected" : ""}`}
                          onClick={() =>
                            update((current) => {
                              const currentPicks = current.classChoices[group.key] ?? [];
                              let nextPicks: string[];
                              if (selectedOption)
                                nextPicks = currentPicks.filter((id) => id !== option.id);
                              else if (group.count === 1) nextPicks = [option.id];
                              else if (currentPicks.length < group.count)
                                nextPicks = [...currentPicks, option.id];
                              else nextPicks = [...currentPicks.slice(1), option.id];
                              return {
                                ...current,
                                classChoices: {
                                  ...current.classChoices,
                                  [group.key]: nextPicks,
                                },
                              };
                            })
                          }
                        >
                          <span className="choice-option-head">
                            <strong>{option.name}</strong>
                            {selectedOption ? <CheckCircle2 size={15} /> : null}
                          </span>
                          <span className="tiny muted">{option.source}</span>
                          {grant?.feats?.length || grant?.spells?.length ? (
                            <span className="tiny gold-text">{grantSummary(grant)}</span>
                          ) : null}
                          {grant?.notes?.[0] ? (
                            <span className="tiny muted">{grant.notes[0]}</span>
                          ) : null}
                          <span className="choice-option-desc">
                            {option.description
                              .replace(/<[^>]+>/g, " ")
                              .replace(/\s+/g, " ")
                              .trim()
                              .slice(0, 145)}
                            …
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
            {!groups.length ? (
              <p className="muted small">This class has no choices at your current level.</p>
            ) : null}
          </div>

          <Card className="selection-detail">
            <h3 style={{ marginBottom: 10 }}>Class features</h3>
            <MiniFeatureList
              features={selected.features.filter((feature) => feature.level <= draft.level)}
            />
          </Card>
          <ValidationNote issues={derived.validation.filter((issue) => issue.step === "class")} />
          <div className="step-actions">
            <Button variant="ghost" onClick={() => setStep("background")}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("abilities")}
              icon={<ArrowRight size={15} />}
            >
              Ability scores
            </Button>
          </div>
        </>
      ) : (
        <div className="detail-placeholder">
          <Swords size={25} />
          <p>Select a class to reveal its proficiencies, hit points, and class choices.</p>
        </div>
      )}
    </div>
  );
}
