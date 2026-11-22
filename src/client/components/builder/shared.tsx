import { useState, type ReactNode } from "react";
import {
  Backpack,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Dice5,
  Dna,
  FlaskConical,
  ScrollText,
  Sparkles,
  Swords,
  UserRound,
} from "lucide-react";
import type {
  AbilityKey,
  Ancestry,
  Background,
  CampaignRuleset,
  CharacterContext,
  CharacterDraft,
  ClassData,
  ContentMode,
  DerivedCharacter,
  Heritage,
} from "../../../shared/types";
import { ABILITY_LABELS } from "../../../shared/types";
import { Input, PageEyebrow, RichText, Select } from "../ui";

export type StepId =
  | "ancestry"
  | "heritage"
  | "background"
  | "class"
  | "abilities"
  | "skills"
  | "feats"
  | "spells"
  | "gear"
  | "details"
  | "review";

export type Picker =
  | {
      kind: "feat";
      category: "ancestry" | "class" | "skill" | "general";
      level: number;
      /** Bonus feats granted outside the normal slot grid. */
      target?: "extras" | "freeArchetype";
    }
  | {
      kind: "spell";
      rank: number | null;
      focus?: boolean;
      target: "cantrips" | "known" | "focus" | "rituals" | "innate";
    }
  | { kind: "equipment" }
  | { kind: "deity" }
  | null;

export interface StaticData {
  ancestries: Ancestry[];
  heritages: Heritage[];
  backgrounds: Background[];
  classes: ClassData[];
}

export const STEPS: { id: StepId; label: string; short: string; icon: ReactNode }[] = [
  { id: "ancestry", label: "Ancestry", short: "Ancestry", icon: <Dna size={16} /> },
  { id: "heritage", label: "Heritage", short: "Heritage", icon: <Sparkles size={16} /> },
  { id: "background", label: "Background", short: "Background", icon: <ScrollText size={16} /> },
  { id: "class", label: "Class", short: "Class", icon: <Swords size={16} /> },
  { id: "abilities", label: "Ability scores", short: "Abilities", icon: <Dice5 size={16} /> },
  { id: "skills", label: "Skills", short: "Skills", icon: <BookOpen size={16} /> },
  { id: "feats", label: "Feats", short: "Feats", icon: <Swords size={16} /> },
  { id: "spells", label: "Spells", short: "Spells", icon: <FlaskConical size={16} /> },
  { id: "gear", label: "Equipment", short: "Gear", icon: <Backpack size={16} /> },
  { id: "details", label: "Details", short: "Details", icon: <UserRound size={16} /> },
  { id: "review", label: "Review", short: "Review", icon: <CheckCircle2 size={16} /> },
];

export function BoostSelect({
  value,
  options,
  exclude,
  onChange,
  placeholder = "Choose…",
}: {
  value: AbilityKey | null;
  options: AbilityKey[];
  exclude: AbilityKey[];
  onChange: (value: AbilityKey | null) => void;
  placeholder?: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onChange={(event) => onChange((event.target.value || null) as AbilityKey | null)}
    >
      <option value="">{placeholder}</option>
      {options.map((ability) => (
        <option
          key={ability}
          value={ability}
          disabled={exclude.includes(ability) && value !== ability}
        >
          {ABILITY_LABELS[ability]}
        </option>
      ))}
    </Select>
  );
}

export interface BuilderProps {
  draft: CharacterDraft;
  update: (updater: (draft: CharacterDraft) => CharacterDraft) => void;
  derived: DerivedCharacter;
  context: CharacterContext;
  staticData: StaticData;
  campaignRuleset: CampaignRuleset | null;
  contentMode: ContentMode;
  contentModeLocked: boolean;
  legacyDefault: boolean;
  legacyLocked: boolean;
  openPicker: (picker: Picker) => void;
  onPortrait: (file: File) => Promise<void>;
  setStep: (step: StepId) => void;
}

export function StepHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <div className="step-heading">
      <PageEyebrow>{eyebrow}</PageEyebrow>
      <h1>{title}</h1>
      <h2 className="sr-only">Step choices</h2>
      <p>{lede}</p>
    </div>
  );
}

export function ValidationNote({ issues }: { issues: { severity: string; message: string }[] }) {
  if (!issues.length) return null;
  return (
    <div className="validation-note">
      {issues.slice(0, 4).map((issue, index) => (
        <div key={index} className={`validation-line ${issue.severity}`}>
          <CircleAlert size={14} />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-box">
      <BookOpen size={15} />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function MiniFeatureList({
  features,
}: {
  features: { name: string; level: number; description: string }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!features.length) return null;
  return (
    <div className="feature-list">
      {features.map((feature) => (
        <div key={`${feature.name}-${feature.level}`} className="feature-row">
          <button
            type="button"
            className="feature-row-head"
            onClick={() => setOpen(open === feature.name ? null : feature.name)}
          >
            <span>
              <strong>{feature.name}</strong>
              <span className="tiny muted"> · level {feature.level}</span>
            </span>
            {open === feature.name ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {open === feature.name ? <RichText html={feature.description} /> : null}
        </div>
      ))}
    </div>
  );
}
