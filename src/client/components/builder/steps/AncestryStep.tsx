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

export function AncestryStep({
  draft,
  update,
  staticData,
  setStep,
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
  const selected = staticData.ancestries.find((a) => a.id === draft.ancestryId) ?? null;
  const visible = staticData.ancestries.filter((ancestry) => {
    if (!legacy && !ancestry.remaster) return false;
    if (!expanded && ancestry.id !== draft.ancestryId && !isCoreSource(ancestry.source)) return false;
    const q = query.trim().toLowerCase();
    return !q || `${ancestry.name} ${ancestry.traits.join(" ")}`.toLowerCase().includes(q);
  });
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 01 · Ancestry"
        title="Where do you come from?"
        lede="Your ancestry shapes your body, your senses, and the first sparks of your potential. Choose the people, lineage, or strange origin that made you."
      />
      <div className="browse-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search ancestries…" />
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
      <div className="selection-grid ancestry-grid">
        {visible.map((ancestry) => (
          <button
            type="button"
            key={ancestry.id}
            className={`selection-card ${draft.ancestryId === ancestry.id ? "is-selected" : ""}`}
            onClick={() =>
              update((current) => {
                const flex = flexibleBoosts(ancestry);
                const sameAncestry = current.ancestryId === ancestry.id;
                const heritage = staticData.heritages.find((h) => h.id === current.heritageId);
                return {
                  ...current,
                  ancestryId: sameAncestry ? null : ancestry.id,
                  heritageId: sameAncestry
                    ? null
                    : heritage?.versatile ||
                        heritage?.ancestry === ancestry.name ||
                        heritage?.ancestrySlug === ancestry.name.toLowerCase()
                      ? current.heritageId
                      : null,
                  boosts: {
                    ...current.boosts,
                    ancestry: sameAncestry ? [] : flex.map(() => null),
                  },
                };
              })
            }
          >
            <span className="selection-emblem">{ancestry.name[0]}</span>
            <span className="selection-copy">
              <span className="selection-name">{ancestry.name}</span>
              <span className="selection-sub">
                {ancestry.hp} HP · {ancestry.speed} ft. · {SIZES[ancestry.size] || ancestry.size}
              </span>
              <span className="selection-source">{ancestry.source}</span>
            </span>
            {draft.ancestryId === ancestry.id ? <CheckCircle2 size={17} className="selection-check" /> : null}
          </button>
        ))}
      </div>
      {selected ? (
        <Card className="selection-detail">
          <div className="selection-detail-head">
            <div>
              <PageEyebrow>Selected ancestry</PageEyebrow>
              <h2>{selected.name}</h2>
              <p className="muted">
                {selected.source} · {selected.rarity}
              </p>
            </div>
            <div className="chip-row">
              <Tag tone="gold">{selected.hp} HP</Tag>
              <Tag tone="gold">{selected.speed} ft.</Tag>
              {(selected.otherSpeeds ?? []).map((entry) => (
                <Tag key={entry.type} tone="gold">
                  {titleCase(entry.type)} {entry.value} ft.
                </Tag>
              ))}
              <Tag>{SIZES[selected.size] || selected.size}</Tag>
              <Tag>{VISION_LABELS[selected.vision] || selected.vision}</Tag>
            </div>
          </div>
          <div className="detail-columns">
            <div>
              <RichText html={selected.description} />
              <h3 style={{ marginTop: 18, marginBottom: 9 }}>Traits</h3>
              <div className="chip-row">
                {selected.traits.map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}
              </div>
              <h3 style={{ marginTop: 18, marginBottom: 9 }}>Languages</h3>
              <p className="muted small">
                {selected.languages.map(titleCase).join(", ") || "None"}
                {selected.additionalLanguages.count
                  ? ` · plus ${selected.additionalLanguages.count} additional language${selected.additionalLanguages.count === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
            <div>
              <h3 style={{ marginBottom: 9 }}>Ability boosts</h3>
              <div className="boost-summary">
                {selected.boosts.map((boost, index) =>
                  boost.fixed ? (
                    <Tag key={index} tone="green">{boost.from.map((a) => ABILITY_SHORT[a]).join(" / ")} +2</Tag>
                  ) : (
                    <Tag key={index} tone="gold">Free boost</Tag>
                  ),
                )}
                {selected.flaws.map((flaw) => (
                  <Tag key={flaw} tone="red">{ABILITY_SHORT[flaw]} −2</Tag>
                ))}
              </div>
              <h3 style={{ marginTop: 18, marginBottom: 9 }}>Ancestry features</h3>
              <MiniFeatureList features={selected.features} />
            </div>
          </div>
          <div className="step-actions">
            <Button variant="ghost" onClick={() => setStep("ancestry")} disabled>Back</Button>
            <Button variant="primary" onClick={() => setStep("heritage")} icon={<ArrowRight size={15} />}>
              Choose a heritage
            </Button>
          </div>
        </Card>
      ) : (
        <div className="detail-placeholder">
          <Dna size={25} />
          <p>Select an ancestry to inspect its boosts, hit points, languages, and ancestry features.</p>
        </div>
      )}
    </div>
  );
}
