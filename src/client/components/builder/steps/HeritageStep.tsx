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
import {
  heritageFeatGrant,
  heritageNotes,
  heritageSenseList,
  heritageSkillChoice,
} from "../../../../shared/heritage";
import type { BuilderProps } from "../shared";
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

export function HeritageStep({
  draft,
  update,
  staticData,
  setStep,
  derived,
  context,
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
  const ancestry = staticData.ancestries.find((a) => a.id === draft.ancestryId) ?? null;
  const all = ancestry
    ? staticData.heritages.filter(
        (h) =>
          h.versatile ||
          h.ancestry === ancestry.name ||
          h.ancestrySlug === ancestry.name.toLowerCase()
      )
    : staticData.heritages;
  const visible = all.filter((heritage) => {
    if (!legacy && !heritage.remaster) return false;
    if (!expanded && heritage.id !== draft.heritageId && !isCoreSource(heritage.source))
      return false;
    const q = query.trim().toLowerCase();
    return !q || `${heritage.name} ${heritage.traits.join(" ")}`.toLowerCase().includes(q);
  });
  const selected = all.find((h) => h.id === draft.heritageId) ?? null;
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 02 · Heritage"
        title="What makes you different?"
        lede="A heritage is a lineage, mutation, or circumstance within your ancestry. It grants a passive benefit and often changes how you see the world."
      />
      {!ancestry ? (
        <EmptyState
          icon={<Dna size={28} />}
          title="Choose an ancestry first"
          description="Your heritage options depend on your ancestry."
          action={
            <Button variant="primary" onClick={() => setStep("ancestry")}>
              Pick an ancestry
            </Button>
          }
        />
      ) : (
        <>
          <div className="browse-toolbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={`Search ${ancestry.name} heritages…`}
            />
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
            {visible.map((heritage) => (
              <button
                type="button"
                key={heritage.id}
                className={`selection-card ${draft.heritageId === heritage.id ? "is-selected" : ""}`}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    heritageId: current.heritageId === heritage.id ? null : heritage.id,
                  }))
                }
              >
                <span className="selection-emblem">{heritage.name[0]}</span>
                <span className="selection-copy">
                  <span className="selection-name">{heritage.name}</span>
                  <span className="selection-sub">
                    {heritage.versatile ? "Versatile · " : ""}
                    {heritage.source}
                  </span>
                  <span className="selection-source">
                    {heritage.traits.slice(0, 3).join(" · ") || "Heritage"}
                  </span>
                </span>
                {draft.heritageId === heritage.id ? (
                  <CheckCircle2 size={17} className="selection-check" />
                ) : null}
              </button>
            ))}
          </div>
          {!visible.length ? (
            <div className="detail-placeholder">
              <p>No heritages match that search.</p>
            </div>
          ) : null}
          {selected ? (
            <Card className="selection-detail">
              <div className="selection-detail-head">
                <div>
                  <PageEyebrow>Selected heritage</PageEyebrow>
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
              <RichText html={selected.description} />
              {heritageSenseList(selected, context.ancestry).length ? (
                <div className="chip-row" style={{ marginTop: 10 }}>
                  {heritageSenseList(selected, context.ancestry).map((sense) => (
                    <Tag key={sense} tone="blue">
                      {VISION_LABELS[sense] ?? titleCase(sense)}
                    </Tag>
                  ))}
                </div>
              ) : null}
              {heritageSkillChoice(selected) ? (
                <p className="tiny muted">
                  Your heritage skill choice appears on the <strong>Skills</strong> step.
                </p>
              ) : null}
              {heritageFeatGrant(selected) ? (
                <p className="tiny muted">
                  Your heritage feat choice appears on the <strong>Feats</strong> step and does not
                  consume a feat slot.
                </p>
              ) : null}
              {heritageNotes(selected).map((note) => (
                <p key={note} className="tiny muted">
                  {note}
                </p>
              ))}
              <div className="step-actions">
                <Button variant="ghost" onClick={() => setStep("ancestry")}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep("background")}
                  icon={<ArrowRight size={15} />}
                >
                  Choose a background
                </Button>
              </div>
            </Card>
          ) : (
            <div className="detail-placeholder">
              <Sparkles size={25} />
              <p>Select a heritage to read its full benefit.</p>
            </div>
          )}
        </>
      )}
      <ValidationNote issues={derived.validation.filter((issue) => issue.step === "heritage")} />
    </div>
  );
}
