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
import type { BuilderProps } from "../shared";
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

export function BackgroundStep({
  draft,
  update,
  staticData,
  setStep,
  context,
  derived,
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
  const visible = staticData.backgrounds.filter((background) => {
    if (!legacy && !background.remaster) return false;
    if (!expanded && background.id !== draft.backgroundId && !isCoreSource(background.source))
      return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      `${background.name} ${background.traits.join(" ")} ${background.source}`
        .toLowerCase()
        .includes(q)
    );
  });
  const selected = staticData.backgrounds.find((b) => b.id === draft.backgroundId) ?? null;
  const selectedBackgroundFeat = (selected?.featChoices ?? [])
    .flatMap((choice) => choice.options)
    .find((option) => option.id === draft.backgroundFeat);
  const granted = [
    ...(selected?.grantedFeats ?? []),
    ...(selectedBackgroundFeat ? [selectedBackgroundFeat] : []),
  ];
  let loreChoiceOffset = 0;
  const loreChoiceRows = (selected?.loreChoices ?? []).flatMap((choice) =>
    Array.from({ length: choice.count }, (_, index) => ({
      ...choice,
      index: loreChoiceOffset++,
      position: index,
    }))
  );
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 03 · Background"
        title="What did you do before this?"
        lede="A background is the life you lived before the adventure found you. It gives two ability boosts, trained skills, and a starting feat."
      />
      <div className="browse-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search backgrounds…" />
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
      <div className="selection-grid">
        {visible.map((background) => (
          <button
            type="button"
            key={background.id}
            className={`selection-card ${draft.backgroundId === background.id ? "is-selected" : ""}`}
            onClick={() =>
              update((current) => {
                const flex = background.boosts.filter((boost) => !boost.fixed);
                return {
                  ...current,
                  backgroundId: current.backgroundId === background.id ? null : background.id,
                  backgroundFeat: null,
                  boosts: {
                    ...current.boosts,
                    background: current.backgroundId === background.id ? [] : flex.map(() => null),
                  },
                  skills: {
                    ...current.skills,
                    background: [],
                    backgroundLore: [],
                  },
                };
              })
            }
          >
            <span className="selection-emblem">{background.name[0]}</span>
            <span className="selection-copy">
              <span className="selection-name">{background.name}</span>
              <span className="selection-sub">
                {background.trainedSkills.map(titleCase).join(", ") || "Background"}
              </span>
              <span className="selection-source">{background.source}</span>
            </span>
            {draft.backgroundId === background.id ? (
              <CheckCircle2 size={17} className="selection-check" />
            ) : null}
          </button>
        ))}
      </div>
      {selected ? (
        <Card className="selection-detail">
          <div className="selection-detail-head">
            <div>
              <PageEyebrow>Selected background</PageEyebrow>
              <h2>{selected.name}</h2>
              <p className="muted">
                {selected.source} · {selected.rarity}
              </p>
            </div>
            <div className="chip-row">
              {selected.traits.map((trait) => (
                <Tag key={trait}>{traitLabel(trait)}</Tag>
              ))}
            </div>
          </div>
          <div className="detail-columns">
            <div>
              <RichText html={selected.description} />
            </div>
            <div>
              <h3 style={{ marginBottom: 9 }}>Boosts</h3>
              <div className="boost-summary">
                {selected.boosts.map((boost, index) => (
                  <Tag key={index} tone={boost.fixed ? "green" : "gold"}>
                    {boost.from.map((ability) => ABILITY_SHORT[ability]).join(" / ")} +2
                  </Tag>
                ))}
              </div>
              <h3 style={{ marginTop: 17, marginBottom: 8 }}>Trained skills</h3>
              <div className="chip-row">
                {selected.trainedSkills.map((skill) => (
                  <Tag key={skill} tone="green">
                    {titleCase(skill)}
                  </Tag>
                ))}
                {selected.lore.map((lore) => (
                  <Tag key={lore} tone="green">
                    {lore}
                  </Tag>
                ))}
                {!selected.trainedSkills.length && !selected.lore.length ? (
                  <span className="muted small">None</span>
                ) : null}
              </div>
              {(selected.skillChoices ?? []).map((choice, index) => {
                const value = draft.skills.background[index] ?? "";
                return (
                  <Field key={`${choice.prompt}-${index}`} label={choice.prompt}>
                    <Select
                      value={value}
                      onChange={(event) =>
                        update((current) => {
                          const next = [...current.skills.background];
                          next[index] = event.target.value;
                          return {
                            ...current,
                            skills: { ...current.skills, background: next },
                          };
                        })
                      }
                    >
                      <option value="">Choose a skill…</option>
                      {choice.options.map((skill) => (
                        <option key={skill} value={skill}>
                          {titleCase(skill)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              })}
              {loreChoiceRows.map((choice) => {
                const value = draft.skills.backgroundLore[choice.index] ?? "";
                const setLore = (nextValue: string) =>
                  update((current) => {
                    const next = [...current.skills.backgroundLore];
                    next[choice.index] = nextValue;
                    return {
                      ...current,
                      skills: { ...current.skills, backgroundLore: next },
                    };
                  });
                return (
                  <Field
                    key={`${choice.prompt}-${choice.index}`}
                    label={
                      choice.count > 1 ? `${choice.prompt} (${choice.position + 1})` : choice.prompt
                    }
                  >
                    {choice.options.length ? (
                      <Select value={value} onChange={(event) => setLore(event.target.value)}>
                        <option value="">Choose a Lore skill…</option>
                        {choice.options.map((lore) => (
                          <option key={lore} value={lore}>
                            {lore}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        value={value}
                        onChange={(event) => setLore(event.target.value)}
                        placeholder="e.g. Desert Lore"
                      />
                    )}
                  </Field>
                );
              })}
              {(selected.featChoices ?? []).map((choice, index) => (
                <Field key={`${choice.prompt}-${index}`} label={choice.prompt}>
                  <Select
                    value={draft.backgroundFeat ?? ""}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        backgroundFeat: event.target.value || null,
                      }))
                    }
                  >
                    <option value="">Choose a feat…</option>
                    {choice.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
              {granted.length ? (
                <>
                  <h3 style={{ marginTop: 17, marginBottom: 8 }}>Granted feat</h3>
                  <div className="chip-row">
                    {granted.map((feat) => (
                      <Tag key={feat.name} tone="gold">
                        {feat.name}
                      </Tag>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="step-actions">
            <Button variant="ghost" onClick={() => setStep("heritage")}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("class")}
              icon={<ArrowRight size={15} />}
            >
              Choose a class
            </Button>
          </div>
        </Card>
      ) : (
        <div className="detail-placeholder">
          <ScrollText size={25} />
          <p>Select a background to see its boosts, skills, and granted feat.</p>
        </div>
      )}
      <ValidationNote issues={derived.validation.filter((issue) => issue.step === "background")} />
    </div>
  );
}
