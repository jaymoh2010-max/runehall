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
import { featChoice, featGrant, WEAPON_PROFICIENCY_ID } from "../../../../shared/effects";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import {
  featAllowedByHeritageGrant,
  heritageChosenFeatId,
  heritageFeatGrant,
  heritageFeatTraits,
  heritageNotes,
} from "../../../../shared/heritage";
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
  const slots = featSlotsFor(classData, draft.level, Boolean(context.freeArchetype));
  const ancestryTrait = heritageFeatTraits(context.heritage, ancestry).join(",");
  const classTrait = classData?.name.toLowerCase();
  const issues = derived.validation.filter((issue) => issue.step === "feats");
  const selectedFeatList = [
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...Object.values(draft.feats.freeArchetype),
    ...draft.feats.extras,
  ]
    .map((id) => context.feats[id])
    .filter((feat): feat is Feat => Boolean(feat));
  const grantEntry = selectedFeatList
    .map((feat) => ({ feat, grant: featGrant(feat.id) }))
    .find((entry) => entry.grant);
  const grantFeatId = grantEntry?.feat.id ?? null;
  const [grantOptions, setGrantOptions] = useState<Feat[]>([]);
  const heritage = context.heritage;
  const heritageGrant = heritageFeatGrant(heritage);
  const heritageChoiceId = heritageChosenFeatId(draft, heritage) ?? "";
  const heritageChosenFeat = heritageChoiceId ? (context.feats[heritageChoiceId] ?? null) : null;
  const heritageChosenChoice = heritageChosenFeat ? featChoice(heritageChosenFeat.id) : undefined;
  const heritageNeedsWeaponChoice =
    heritageChosenFeat?.id === WEAPON_PROFICIENCY_ID &&
    Number(classData?.attacks.martial ?? 0) >= 1;
  const [heritageOptions, setHeritageOptions] = useState<Feat[]>([]);
  const heritageSelectOptions =
    heritageChosenFeat && !heritageOptions.some((feat) => feat.id === heritageChosenFeat.id)
      ? [heritageChosenFeat, ...heritageOptions]
      : heritageOptions;

  useEffect(() => {
    if (!heritageGrant) {
      setHeritageOptions([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("category", heritageGrant.category);
    params.set("levelMin", "1");
    params.set("levelMax", String(heritageGrant.level));
    params.set("limit", "200");
    if (heritageGrant.filterTraits?.length) {
      params.set("trait", heritageGrant.filterTraits.join(","));
    }
    if (!draft.includeLegacy) params.set("legacy", "0");
    if (draft.contentMode === "core") params.set("core", "1");
    api<{ items: Feat[] }>(`/api/compendium/feats?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setHeritageOptions(
          result.items.filter((feat) =>
            featAllowedByHeritageGrant(feat, heritageGrant, context.classData?.name)
          )
        );
      })
      .catch(() => {
        if (!cancelled) setHeritageOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    heritageGrant,
    heritage?.id,
    context.classData?.name,
    draft.includeLegacy,
    draft.contentMode,
  ]);

  useEffect(() => {
    if (!grantFeatId) {
      setGrantOptions([]);
      return;
    }
    const grant = featGrant(grantFeatId);
    if (!grant) return;
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("category", grant.category);
    params.set("levelMin", "1");
    params.set("levelMax", String(grant.level));
    params.set("limit", "200");
    if (grant.category === "ancestry" && ancestryTrait) params.set("trait", ancestryTrait);
    if (grant.category === "class" && classTrait) params.set("trait", classTrait);
    if (!draft.includeLegacy) params.set("legacy", "0");
    if (draft.contentMode === "core") params.set("core", "1");
    api<{ items: Feat[] }>(`/api/compendium/feats?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setGrantOptions(result.items);
      })
      .catch(() => {
        if (!cancelled) setGrantOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [grantFeatId, ancestryTrait, draft.includeLegacy, draft.contentMode]);

  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 07 · Feats"
        title="How do you sharpen your edge?"
        lede="Feats are the techniques, talents, and tricks that make your character yours. Class, skill, general, and ancestry feats unlock on different schedules."
      />
      {heritageGrant ? (
        <Card className={`feat-slot ${heritageChoiceId ? "is-filled" : ""}`}>
          <div className="feat-slot-head">
            <div className="feat-slot-level">Gift</div>
            <div className="grow">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <strong>{heritage?.name} heritage feat</strong>
                <Badge tone={heritageChoiceId ? "green" : "gold"}>
                  {heritageChoiceId ? "Chosen" : "Required"}
                </Badge>
              </div>
              <p className="tiny muted">
                {heritageGrant.prompt}. This feat does not consume a feat slot.
              </p>
            </div>
          </div>
          <Select
            value={heritageChoiceId}
            onChange={(event) => {
              const value = event.target.value;
              update((current) => ({
                ...current,
                featChoices: {
                  ...current.featChoices,
                  [heritage!.id]: value ? [value] : [],
                },
              }));
            }}
          >
            <option value="">Choose…</option>
            {heritageSelectOptions.map((feat) => (
              <option key={feat.id} value={feat.id}>
                {feat.name} · level {feat.level}
              </option>
            ))}
          </Select>
          {heritageChosenFeat ? (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              <div className="chip-row">
                <Tag>{heritageChosenFeat.source}</Tag>
                {heritageChosenFeat.traits.slice(0, 5).map((trait) => (
                  <Tag key={trait}>{traitLabel(trait)}</Tag>
                ))}
              </div>
              {heritageChosenChoice ? (
                <Field
                  label={heritageChosenChoice.prompt}
                  hint="Runehall applies your choice to the sheet."
                >
                  {heritageChosenChoice.kind === "text" ? (
                    <Input
                      value={draft.featChoices[heritageChosenFeat.id]?.[0] ?? ""}
                      placeholder={heritageChosenChoice.placeholder}
                      onChange={(event) => {
                        const value = event.target.value;
                        update((current) => ({
                          ...current,
                          featChoices: {
                            ...current.featChoices,
                            [heritageChosenFeat.id]: value ? [value] : [],
                          },
                        }));
                      }}
                    />
                  ) : (
                    <Select
                      value={draft.featChoices[heritageChosenFeat.id]?.[0] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        update((current) => ({
                          ...current,
                          featChoices: {
                            ...current.featChoices,
                            [heritageChosenFeat.id]: value ? [value] : [],
                          },
                        }));
                      }}
                    >
                      <option value="">Choose…</option>
                      {heritageChosenChoice.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : null}
              {heritageNeedsWeaponChoice ? (
                <Field
                  label="Advanced weapon"
                  hint="You're already trained in martial weapons, so name the advanced weapon to train."
                >
                  <Input
                    value={draft.featChoices[heritageChosenFeat.id]?.[0] ?? ""}
                    placeholder="e.g. Aldori Dueling Sword"
                    onChange={(event) => {
                      const value = event.target.value;
                      update((current) => ({
                        ...current,
                        featChoices: {
                          ...current.featChoices,
                          [heritageChosenFeat.id]: value ? [value] : [],
                        },
                      }));
                    }}
                  />
                </Field>
              ) : null}
              {heritageChosenFeat.prerequisites.length ? (
                <p className="tiny muted">
                  <strong>Requires:</strong> {heritageChosenFeat.prerequisites.join("; ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {heritageNotes(heritage).map((note) => (
            <p key={note} className="tiny muted">
              {note}
            </p>
          ))}
        </Card>
      ) : null}
      <div className="feat-slots">
        {slots.map((slot) => {
          const bucket = slot.freeArchetype
            ? draft.feats.freeArchetype
            : draft.feats[slot.category];
          const featId = bucket?.[String(slot.level)];
          const feat = featId ? context.feats[featId] : null;
          const choice = feat ? featChoice(feat.id) : undefined;
          const needsWeaponChoice =
            feat?.id === WEAPON_PROFICIENCY_ID && Number(classData?.attacks.martial ?? 0) >= 1;
          const label = slot.freeArchetype
            ? "Free archetype feat"
            : `${slot.category === "class" ? "Class" : slot.category === "ancestry" ? "Ancestry" : slot.category === "skill" ? "Skill" : "General"} feat`;
          return (
            <Card
              key={`${slot.freeArchetype ? "free" : slot.category}-${slot.level}`}
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
                      openPicker({
                        kind: "feat",
                        category: slot.category,
                        level: slot.level,
                        target: slot.freeArchetype ? "freeArchetype" : undefined,
                      })
                    }
                  >
                    {feat ? "Change" : "Choose"}
                  </Button>
                  {feat ? (
                    <IconButton
                      label="Remove feat"
                      onClick={() =>
                        update((current) => {
                          const key = slot.freeArchetype ? "freeArchetype" : slot.category;
                          const bucket = { ...current.feats[key] };
                          delete bucket[String(slot.level)];
                          return {
                            ...current,
                            feats: { ...current.feats, [key]: bucket },
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
                      {choice.kind === "text" ? (
                        <Input
                          value={draft.featChoices[feat.id]?.[0] ?? ""}
                          placeholder={choice.placeholder}
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
                        />
                      ) : (
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
                      )}
                    </Field>
                  ) : null}
                  {needsWeaponChoice ? (
                    <Field
                      label="Advanced weapon"
                      hint="You're already trained in martial weapons, so name the advanced weapon to train."
                    >
                      <Input
                        value={draft.featChoices[feat.id]?.[0] ?? ""}
                        placeholder="e.g. Aldori Dueling Sword"
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
                      />
                    </Field>
                  ) : null}
                  {grantFeatId === feat.id && grantEntry?.grant ? (
                    <Field
                      label={grantEntry.grant.prompt}
                      hint="The granted feat's effects apply to your sheet."
                    >
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
                        {grantOptions
                          .filter((option) => option.id !== feat.id)
                          .map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
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
      {classTrait === "summoner" ? (
        <Card className="feat-slot-card">
          <div className="row-between">
            <div>
              <h3>Evolution Feat</h3>
              <p className="muted small">
                The summoner gains a bonus 1st-level evolution feat outside the normal class feat
                slots.
              </p>
            </div>
            <Button
              size="sm"
              variant={draft.feats.extras.length ? "ghost" : "primary"}
              onClick={() =>
                openPicker({ kind: "feat", category: "class", level: 1, target: "extras" })
              }
            >
              {draft.feats.extras.length ? "Change" : "Choose"}
            </Button>
          </div>
          <div className="chip-row" style={{ marginTop: 8 }}>
            {draft.feats.extras.map((featId) => {
              const feat = context.feats[featId];
              return (
                <Tag key={featId} tone="gold">
                  {feat?.name ?? "Evolution feat"}
                </Tag>
              );
            })}
          </div>
        </Card>
      ) : null}
      {derived.grantedFeats.length ? (
        <Card className="granted-feats">
          <h3>Granted feats</h3>
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
