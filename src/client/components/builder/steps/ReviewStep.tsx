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
import type { BuilderProps, StepId } from "../shared";
import { STEPS } from "../shared";
import {
  StepHeading,
  ValidationNote,
  SearchInput,
  MiniFeatureList,
} from "../shared";

export function ReviewStep({
  draft,
  derived,
  context,
  setStep,
  onExport,
  onImport,
  onDelete,
}: BuilderProps & {
  onExport: () => void;
  onImport: (file: File) => void;
  onDelete: () => void;
}) {
  const errors = derived.validation.filter((issue) => issue.severity === "error");
  const warnings = derived.validation.filter((issue) => issue.severity === "warning");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 11 · Review"
        title="Ready for the road?"
        lede="Check the final numbers, resolve any missing choices, and take your hero to the table."
      />
      <Card className={`review-status ${errors.length ? "has-errors" : "is-ready"}`}>
        <div className="review-status-mark">
          {errors.length ? <CircleAlert size={28} /> : <CheckCircle2 size={28} />}
        </div>
        <div>
          <h2>{errors.length ? `${errors.length} thing${errors.length === 1 ? "" : "s"} still need attention` : "Your hero is ready"}</h2>
          <p>{errors.length ? "Fix the items below, or finish them with your GM." : "Every required choice is made. Open the character sheet, or jump into a campaign table."}</p>
        </div>
      </Card>

      <div className="review-grid">
        <Card className="review-list">
          <h3>Choices</h3>
          <dl>
            <div><dt>Ancestry</dt><dd>{context.ancestry?.name || "—"}</dd></div>
            <div><dt>Heritage</dt><dd>{context.heritage?.name || "—"}</dd></div>
            <div><dt>Background</dt><dd>{context.background?.name || "—"}</dd></div>
            <div><dt>Class</dt><dd>{context.classData?.name || "—"}</dd></div>
            <div><dt>Deity</dt><dd>{context.deity?.name || "—"}</dd></div>
            <div><dt>Level</dt><dd>{draft.level}</dd></div>
            <div><dt>Feats chosen</dt><dd>{Object.values(draft.feats.ancestry).length + Object.values(draft.feats.class).length + Object.values(draft.feats.skill).length + Object.values(draft.feats.general).length}</dd></div>
            <div><dt>Spells chosen</dt><dd>{draft.spells.cantrips.length + draft.spells.known.length}</dd></div>
            <div><dt>Equipment</dt><dd>{draft.equipment.length} entries</dd></div>
          </dl>
        </Card>
        <Card className="review-list">
          <h3>Numbers</h3>
          <dl>
            <div><dt>Hit points</dt><dd>{derived.maxHp}</dd></div>
            <div><dt>Armor class</dt><dd>{derived.ac}</dd></div>
            <div><dt>Perception</dt><dd>{signed(derived.perception)}</dd></div>
            <div><dt>Fortitude</dt><dd>{signed(derived.saves.fortitude)}</dd></div>
            <div><dt>Reflex</dt><dd>{signed(derived.saves.reflex)}</dd></div>
            <div><dt>Will</dt><dd>{signed(derived.saves.will)}</dd></div>
            <div><dt>Class DC</dt><dd>{derived.classDc}</dd></div>
            <div><dt>Spell DC</dt><dd>{derived.spellDc ?? "—"}</dd></div>
          </dl>
        </Card>
      </div>

      {errors.length || warnings.length ? (
        <Card className="issues-card">
          <h3>Outstanding items</h3>
          <div className="issues-list">
            {errors.map((issue, index) => (
              <button key={`e-${index}`} type="button" className="issue-row error" onClick={() => issue.step && setStep(issue.step as StepId)}>
                <CircleAlert size={15} />
                <span>{issue.message}</span>
                {issue.step ? <span className="issue-jump">Go to {STEPS.find((step) => step.id === issue.step)?.label ?? issue.step}</span> : null}
              </button>
            ))}
            {warnings.map((issue, index) => (
              <div key={`w-${index}`} className="issue-row warning">
                <CircleAlert size={15} />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="review-actions-card">
        <div>
          <h3>Character file</h3>
          <p className="muted small">Export a portable JSON copy. Import it into another campaign or keep it as a backup.</p>
        </div>
        <div className="row wrap">
          <Button icon={<Download size={15} />} onClick={onExport}>Export JSON</Button>
          <Button icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete}>Delete</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = "";
            }}
          />
        </div>
      </Card>
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("details")}>Back</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
