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

export function SkillsStep({ draft, update, derived, context, setStep }: BuilderProps) {
  const background = context.background;
  const classData = context.classData;
  const fixed = grantedTrainedSkills(draft, context);
  const required = classData
    ? Math.max(0, classData.trainedSkills.additional + Math.max(0, derived.abilityMods.int))
    : 0;
  const chosen = draft.skills.trained.filter((skill) => !fixed.has(skill));
  const increaseLevels = (classData?.skillIncreaseLevels ?? []).filter(
    (level) => level <= draft.level
  );
  const issues = derived.validation.filter((issue) => issue.step === "skills");

  const toggleTrained = (skill: SkillId) =>
    update((current) => {
      const isChosen = current.skills.trained.includes(skill);
      if (isChosen)
        return {
          ...current,
          skills: {
            ...current.skills,
            trained: current.skills.trained.filter((id) => id !== skill),
          },
        };
      if (fixed.has(skill)) return current;
      if (current.skills.trained.filter((id) => !fixed.has(id)).length >= required) return current;
      return {
        ...current,
        skills: { ...current.skills, trained: [...current.skills.trained, skill] },
      };
    });

  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 06 · Skills"
        title="What have you trained?"
        lede="Your background and class grant free training. Intelligence adds extra skill choices, and every few levels you can improve a skill's proficiency rank."
      />
      <Card className="skill-fixed">
        <h3>Automatic training</h3>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {[...fixed].map((skill) => {
            const rank = derived.skills.find((entry) => entry.id === skill)?.rank ?? 1;
            return (
              <Tag key={skill} tone="green">
                {titleCase(skill)} · {PROFICIENCY_NAMES[rank]}
              </Tag>
            );
          })}
          {(background?.lore ?? []).map((lore) => (
            <Tag key={lore} tone="green">
              {lore} · trained
            </Tag>
          ))}
          {draft.skills.backgroundLore.filter(Boolean).map((lore) => {
            const name = lore.toLowerCase().includes("lore") ? lore : `${lore} Lore`;
            return (
              <Tag key={name} tone="green">
                {name} · trained
              </Tag>
            );
          })}
          {!fixed.size && !background?.lore.length && !draft.skills.backgroundLore.some(Boolean) ? (
            <span className="muted small">No automatic skills yet.</span>
          ) : null}
        </div>
      </Card>
      <Card className="skill-picker">
        <div className="skill-picker-head">
          <div>
            <h3>Class skill choices</h3>
            <p className="muted small">
              Choose {required} additional trained skill{required === 1 ? "" : "s"} (including
              Intelligence bonus).
            </p>
          </div>
          <Badge tone={chosen.length === required ? "green" : "gold"}>
            {chosen.length}/{required}
          </Badge>
        </div>
        <div className="skill-choice-grid">
          {SKILLS.map((skill) => {
            const isFixed = fixed.has(skill.id);
            const isChosen = draft.skills.trained.includes(skill.id);
            const disabled = isFixed || (!isChosen && chosen.length >= required);
            return (
              <button
                type="button"
                key={skill.id}
                className={`skill-choice ${isFixed ? "is-fixed" : ""} ${isChosen ? "is-selected" : ""}`}
                onClick={() => toggleTrained(skill.id)}
                disabled={isFixed || (disabled && !isChosen)}
              >
                <span>
                  <strong>{skill.name}</strong>
                  <span className="tiny muted"> ({ABILITY_SHORT[skill.ability]})</span>
                </span>
                {isFixed ? (
                  <Badge tone="green">Class</Badge>
                ) : isChosen ? (
                  <CheckCircle2 size={15} />
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="skill-increases">
        <h3>Skill increases</h3>
        <p className="muted small" style={{ marginTop: 3 }}>
          Each increase raises a trained skill by one rank. Higher ranks unlock at 3rd, 7th, and
          15th level.
        </p>
        <div className="increase-list">
          {increaseLevels.map((level) => {
            const value = draft.skills.increases[String(level)] ?? "";
            const cap = skillRankCap(level);
            const options = SKILLS.filter(
              (skill) =>
                skill.id === value ||
                (derived.skills.find((x) => x.id === skill.id)?.rank ?? 0) < cap
            );
            return (
              <div key={level} className="increase-row">
                <span className="increase-level">Level {level}</span>
                <Select
                  value={value}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      skills: {
                        ...current.skills,
                        increases: {
                          ...current.skills.increases,
                          [String(level)]: event.target.value,
                        },
                      },
                    }))
                  }
                >
                  <option value="">Choose a skill…</option>
                  {options.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} (currently{" "}
                      {PROFICIENCY_NAMES[derived.skills.find((x) => x.id === skill.id)?.rank ?? 0]})
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
          {!increaseLevels.length ? (
            <p className="muted small">Skill increases begin at 3rd level.</p>
          ) : null}
        </div>
      </Card>
      <Card className="lore-card">
        <div className="row-between">
          <div>
            <h3>Lore skills</h3>
            <p className="muted small">Narrow fields of knowledge, always Intelligence-based.</p>
          </div>
        </div>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {(background?.lore ?? []).map((lore) => (
            <Tag key={lore} tone="green">
              {lore}
            </Tag>
          ))}
          {draft.skills.lore.map((lore, index) => (
            <Tag key={`${lore}-${index}`} tone="blue">
              {lore}
              <button
                type="button"
                className="tag-remove"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    skills: {
                      ...current.skills,
                      lore: current.skills.lore.filter((_, i) => i !== index),
                    },
                  }))
                }
              >
                ×
              </button>
            </Tag>
          ))}
        </div>
        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = form.elements.namedItem("lore") as HTMLInputElement;
            const value = input.value.trim();
            if (!value) return;
            update((current) => ({
              ...current,
              skills: { ...current.skills, lore: [...current.skills.lore, value] },
            }));
            input.value = "";
          }}
        >
          <Input name="lore" placeholder="e.g. Absalom Lore" />
          <Button type="submit" icon={<Plus size={14} />}>
            Add lore
          </Button>
        </form>
      </Card>
      <Card className="skill-table-card">
        <h3>Skill totals</h3>
        <div className="skill-table">
          {derived.skills.map((skill) => (
            <div key={skill.id} className="skill-table-row">
              <span>{skill.name}</span>
              <span className="muted tiny">{ABILITY_SHORT[skill.ability]}</span>
              <Tag tone={skill.rank ? "green" : "neutral"}>{PROFICIENCY_NAMES[skill.rank]}</Tag>
              <strong className="mono">{signed(skill.mod)}</strong>
            </div>
          ))}
          {derived.lore.map((lore) => (
            <div key={lore.name} className="skill-table-row">
              <span>{lore.name}</span>
              <span className="muted tiny">INT</span>
              <Tag tone="blue">Lore</Tag>
              <strong className="mono">{signed(lore.mod)}</strong>
            </div>
          ))}
        </div>
      </Card>
      <ValidationNote issues={issues} />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("abilities")}>
          Back
        </Button>
        <Button variant="primary" onClick={() => setStep("feats")} icon={<ArrowRight size={15} />}>
          Feats
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------
