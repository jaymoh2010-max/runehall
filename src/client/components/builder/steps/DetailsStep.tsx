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

export function DetailsStep({ draft, update, setStep, onPortrait }: BuilderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const updateCompanion = (index: number, patch: Partial<CharacterDraft["companions"][number]>) =>
    update((current) => ({
      ...current,
      companions: current.companions.map((companion, i) =>
        i === index ? { ...companion, ...patch } : companion,
      ),
    }));
  const addCompanion = () =>
    update((current) => ({
      ...current,
      companions: [
        ...current.companions,
        {
          id: `comp_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`,
          name: "New Companion",
          kind: "animal",
          level: Math.max(1, current.level),
          hpCurrent: null,
          hpMax: null,
          ac: null,
          notes: "",
        },
      ],
    }));
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 10 · Details"
        title="Who are you, really?"
        lede="The numbers are only half a character. Give your hero a face, a voice, and a reason to keep walking into danger."
      />
      <Card className="portrait-card">
        <div className="portrait-editor">
          <Avatar name={draft.name} src={draft.portraitUrl} size={96} />
          <div className="grow">
            <h3>Portrait</h3>
            <p className="muted small">Upload a portrait for your sheet and table token. PNG, JPG, WebP, GIF, or AVIF up to 15 MB.</p>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <Button size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Upload portrait</Button>
              {draft.portraitUrl ? <Button size="sm" variant="ghost" onClick={() => update((current) => ({ ...current, portraitUrl: null }))}>Remove</Button> : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onPortrait(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </Card>

      <Card className="details-card">
        <div className="form-grid">
          <Field label="Character name">
            <Input value={draft.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} maxLength={120} />
          </Field>
          <Field label="Pronouns">
            <Input value={draft.details.pronouns} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, pronouns: event.target.value } }))} placeholder="e.g. she/her" />
          </Field>
          <Field label="Age">
            <Input value={draft.details.age} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, age: event.target.value } }))} placeholder="e.g. 27" />
          </Field>
          <Field label="Gender">
            <Input value={draft.details.gender} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, gender: event.target.value } }))} placeholder="Optional" />
          </Field>
          <Field label="Height">
            <Input value={draft.details.height} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, height: event.target.value } }))} placeholder="e.g. 5'8&quot;" />
          </Field>
          <Field label="Weight">
            <Input value={draft.details.weight} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, weight: event.target.value } }))} placeholder="Optional" />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Appearance">
            <Textarea value={draft.details.appearance} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, appearance: event.target.value } }))} placeholder="What do people notice first?" />
          </Field>
          <Field label="Personality">
            <Textarea value={draft.details.personality} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, personality: event.target.value } }))} placeholder="Mannerisms, ideals, fears…" />
          </Field>
        </div>
        <Field label="Beliefs & bonds">
          <Textarea value={draft.details.beliefs} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, beliefs: event.target.value } }))} placeholder="What do you believe in? Who or what would you die for?" />
        </Field>
        <Field label="Notes & backstory">
          <Textarea value={draft.details.notes} onChange={(event) => update((current) => ({ ...current, details: { ...current.details, notes: event.target.value } }))} placeholder="The story so far…" />
        </Field>
        <div className="languages-editor">
          <h3>Additional languages</h3>
          <p className="muted small">Languages granted by your ancestry are applied automatically. Add bonus languages from feats or Int here.</p>
          <div className="chip-row" style={{ marginTop: 9 }}>
            {draft.details.languages.map((language, index) => (
              <Tag key={`${language}-${index}`} tone="blue">
                {language}
                <button type="button" className="tag-remove" onClick={() => update((current) => ({ ...current, details: { ...current.details, languages: current.details.languages.filter((_, i) => i !== index) } }))}>×</button>
              </Tag>
            ))}
          </div>
          <form
            className="row" style={{ marginTop: 10 }}
            onSubmit={(event) => {
              event.preventDefault();
              const input = (event.currentTarget.elements.namedItem("language") as HTMLInputElement);
              const value = input.value.trim();
              if (!value) return;
              update((current) => ({ ...current, details: { ...current.details, languages: [...current.details.languages, value] } }));
              input.value = "";
            }}
          >
            <Input name="language" placeholder="e.g. Elven" />
            <Button type="submit" icon={<Plus size={14} />}>Add language</Button>
          </form>
        </div>
      </Card>

      <Card className="companions-card">
        <div className="row-between">
          <div>
            <h3>Companions &amp; summons</h3>
            <p className="muted small">
              A manual roster for animal companions, familiars, eidolons, and summoned creatures.
            </p>
          </div>
          <Button size="sm" icon={<Plus size={14} />} onClick={addCompanion}>
            Add companion
          </Button>
        </div>
        {draft.companions.map((companion, index) => (
          <div key={companion.id} className="companion-row">
            <div className="companion-row-head">
              <strong>{companion.name || "Companion"}</strong>
              <IconButton
                label={`Remove ${companion.name || "companion"}`}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    companions: current.companions.filter((_, i) => i !== index),
                  }))
                }
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
            <div className="companion-grid">
              <Field label="Name">
                <Input
                  value={companion.name}
                  onChange={(event) => updateCompanion(index, { name: event.target.value })}
                  maxLength={80}
                />
              </Field>
              <Field label="Kind">
                <Select
                  value={companion.kind}
                  onChange={(event) =>
                    updateCompanion(index, { kind: event.target.value as CharacterDraft["companions"][number]["kind"] })
                  }
                >
                  <option value="animal">Animal companion</option>
                  <option value="familiar">Familiar</option>
                  <option value="eidolon">Eidolon</option>
                  <option value="summon">Summon</option>
                </Select>
              </Field>
              <Field label="Level">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={companion.level}
                  onChange={(event) => updateCompanion(index, { level: Number(event.target.value) || 1 })}
                />
              </Field>
              <Field label="HP current">
                <Input
                  type="number"
                  min={0}
                  value={companion.hpCurrent ?? ""}
                  onChange={(event) =>
                    updateCompanion(index, {
                      hpCurrent: event.target.value === "" ? null : Math.max(0, Number(event.target.value)),
                    })
                  }
                />
              </Field>
              <Field label="HP max">
                <Input
                  type="number"
                  min={1}
                  value={companion.hpMax ?? ""}
                  onChange={(event) =>
                    updateCompanion(index, {
                      hpMax: event.target.value === "" ? null : Math.max(1, Number(event.target.value)),
                    })
                  }
                />
              </Field>
              <Field label="AC">
                <Input
                  type="number"
                  min={0}
                  value={companion.ac ?? ""}
                  onChange={(event) =>
                    updateCompanion(index, {
                      ac: event.target.value === "" ? null : Math.max(0, Number(event.target.value)),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Attacks and notes">
              <Textarea
                value={companion.notes}
                onChange={(event) => updateCompanion(index, { notes: event.target.value })}
                placeholder="e.g. Jaws +7 (1d6+2 piercing), Speed 25 ft., scent"
                rows={2}
              />
            </Field>
          </div>
        ))}
        {!draft.companions.length ? (
          <p className="muted small">No companions yet. Add one when a class feature grants it.</p>
        ) : null}
      </Card>
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("gear")}>Back</Button>
        <Button variant="primary" onClick={() => setStep("review")} icon={<ArrowRight size={15} />}>Review character</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
