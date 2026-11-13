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
import { featChoice } from "../../../../shared/effects";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import type { BuilderProps } from "../shared";
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

export function FeatsStep({
  draft,
  update,
  derived,
  context,
  setStep,
  openPicker,
  campaignRuleset,
}: BuilderProps) {
  const classData = context.classData;
  const ancestry = context.ancestry;
  const slots = featSlotsFor(classData, draft.level);
  const ancestryTrait = ancestry?.name.toLowerCase().replace(/\s+/g, "-");
  const classTrait = classData?.name.toLowerCase();
  const issues = derived.validation.filter((issue) => issue.step === "feats");
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 07 · Feats"
        title="How do you sharpen your edge?"
        lede="Feats are the techniques, talents, and tricks that make your character yours. Class, skill, general, and ancestry feats unlock on different schedules."
      />
      <div className="feat-slots">
        {slots.map((slot) => {
          const featId = draft.feats[slot.category]?.[String(slot.level)];
          const feat = featId ? context.feats[featId] : null;
          const choice = feat ? featChoice(feat.id) : undefined;
          const label = `${slot.category === "class" ? "Class" : slot.category === "ancestry" ? "Ancestry" : slot.category === "skill" ? "Skill" : "General"} feat`;
          return (
            <Card
              key={`${slot.category}-${slot.level}`}
              className={`feat-slot ${feat ? "is-filled" : ""}`}
            >
              <div className="feat-slot-head">
                <div className="feat-slot-level">L{slot.level}</div>
                <div className="grow">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <strong>{label}</strong>
                    <Badge tone={feat ? "green" : "gold"}>{feat ? "Filled" : "Open"}</Badge>
                  </div>
                  {feat ? (
                    <p className="tiny muted">
                      {feat.name} · {feat.source}
                    </p>
                  ) : (
                    <p className="tiny muted">Choose a feat for this slot.</p>
                  )}
                </div>
                <div className="row" style={{ gap: 5 }}>
                  <Button
                    size="sm"
                    variant={feat ? "ghost" : "primary"}
                    onClick={() =>
                      openPicker({ kind: "feat", category: slot.category, level: slot.level })
                    }
                  >
                    {feat ? "Change" : "Choose"}
                  </Button>
                  {feat ? (
                    <IconButton
                      label="Remove feat"
                      onClick={() =>
                        update((current) => {
                          const bucket = { ...current.feats[slot.category] };
                          delete bucket[String(slot.level)];
                          return {
                            ...current,
                            feats: { ...current.feats, [slot.category]: bucket },
                            featChoices: Object.fromEntries(
                              Object.entries(current.featChoices).filter(([id]) => id !== feat.id)
                            ),
                          };
                        })
                      }
                    >
                      <Minus size={14} />
                    </IconButton>
                  ) : null}
                </div>
              </div>
              {feat ? (
                <div className="feat-slot-body">
                  <div className="chip-row" style={{ marginBottom: 8 }}>
                    {feat.traits.map((trait) => (
                      <Tag key={trait}>{traitLabel(trait)}</Tag>
                    ))}
                    {feat.rarity !== "common" ? <Tag tone="violet">{feat.rarity}</Tag> : null}
                  </div>
                  {feat.prerequisites.length ? (
                    <div className="prereq-inline">
                      <strong>Requires:</strong> {feat.prerequisites.join("; ")}
                    </div>
                  ) : null}
                  {choice ? (
                    <Field label={choice.prompt} hint="Runehall applies your choice to the sheet.">
                      <Select
                        value={draft.featChoices[feat.id]?.[0] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          update((current) => ({
                            ...current,
                            featChoices: {
                              ...current.featChoices,
                              [feat.id]: value ? [value] : [],
                            },
                          }));
                        }}
                      >
                        <option value="">Choose…</option>
                        {choice.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  <RichText html={feat.description} />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      {!slots.length ? <p className="muted small">No feat slots at this level.</p> : null}
      {derived.grantedFeats.length ? (
        <Card className="granted-feats">
          <h3>Granted by your background</h3>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {derived.grantedFeats.map((feat) => (
              <Tag key={feat.name} tone="gold">
                {feat.name}
              </Tag>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            These do not consume a feat slot.
          </p>
        </Card>
      ) : null}
      <div className="info-box">
        <BookOpen size={16} />
        <p>
          Feats whose prerequisites are not met are hidden. Complex story or campaign prerequisites
          are shown as warnings so you can verify them with your GM.{" "}
          {campaignRuleset
            ? `This campaign uses ${rulesetLabel(campaignRuleset)}; the GM controls which sources are available.`
            : "The feat picker starts with core sources; use Expanded sources there to see the full compendium."}
        </p>
      </div>
      <ValidationNote issues={issues} />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("skills")}>
          Back
        </Button>
        <Button variant="primary" onClick={() => setStep("spells")} icon={<ArrowRight size={15} />}>
          Spells
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------
