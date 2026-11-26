#!/usr/bin/env node
/**
 * Exhaustive feat/class compatibility audit.
 *
 * For every remaster class at level 20 and every remaster feat, this checks
 * whether the feat is class-accessible and whether its prerequisites are met
 * by a complete level-20 build. Accessible feats are added to the character
 * and the sheet is recomputed to prove the feat is reflected without errors.
 *
 * Usage:
 *   npm run simulate:feats
 *   npm run simulate:feats -- --report feat-class-report.json
 *   npm run simulate:feats -- --class Fighter --feat Shield\ Block
 *   npm run simulate:feats -- --legacy
 */
import fs from "node:fs";
import path from "node:path";
import { buildSimulatedCharacter } from "./simulate-characters";
import { featChoice, featChoiceOptions, featEffect } from "../src/shared/effects";
import {
  computeCharacter,
  featClassAccess,
  featPrerequisiteStatus,
  grantedTrainedSkills,
} from "../src/shared/rules";
import { validateFormula } from "../src/shared/dice";
import { contextForDraft } from "../src/server/compendium";
import {
  SKILLS,
  SKILL_BY_ID,
  type CharacterContext,
  type CharacterDraft,
  type ClassData,
  type Deity,
  type Feat,
  type SkillId,
} from "../src/shared/types";
import { activeGrantChoiceGroups } from "../src/shared/classGrantChoices";
import { selectedClassGrants } from "../src/shared/classGrants";

const projectRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const includeLegacy = args.includes("--legacy");
const classIndex = args.indexOf("--class");
const classFilter = classIndex >= 0 ? args[classIndex + 1]?.toLowerCase() : null;
const featIndex = args.indexOf("--feat");
const featFilter = featIndex >= 0 ? args[featIndex + 1]?.toLowerCase() : null;
const reportIndex = args.indexOf("--report");
const reportPath =
  reportIndex >= 0 && args[reportIndex + 1] ? path.resolve(args[reportIndex + 1]) : null;

const read = <T>(file: string): T[] =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, "data", "compendium", file), "utf8")) as T[];

const classes = read<ClassData>("classes.json").filter((entry) => entry.remaster);
const feats = read<Feat>("feats.json").filter((entry) => includeLegacy || entry.remaster);
const selectedClasses = classFilter
  ? classes.filter((entry) => entry.name.toLowerCase() === classFilter)
  : classes;
const selectedFeats = featFilter
  ? feats.filter((entry) => entry.name.toLowerCase() === featFilter)
  : feats;

interface Failure {
  className: string;
  featName: string;
  featId: string;
  reason: string;
}

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: "",
  classes: selectedClasses.map((entry) => entry.name),
  featCount: selectedFeats.length,
  combinations: 0,
  tested: 0,
  classSkipped: 0,
  levelSkipped: 0,
  prerequisiteSkipped: 0,
  prerequisiteVerify: 0,
  failures: [] as Failure[],
  perClass: {} as Record<
    string,
    {
      tested: number;
      classSkipped: number;
      levelSkipped: number;
      prerequisiteSkipped: number;
      failures: number;
    }
  >,
};

function numericIssues(derived: ReturnType<typeof computeCharacter>, featName: string): string[] {
  const issues: string[] = [];
  const check = (label: string, value: number | null) => {
    if (value !== null && !Number.isFinite(value)) {
      issues.push(`${featName}: ${label} is not finite (${value})`);
    }
  };
  check("HP", derived.maxHp);
  check("AC", derived.ac);
  check("Speed", derived.speed);
  check("Perception", derived.perception);
  check("Class DC", derived.classDc);
  check("Spell DC", derived.spellDc);
  check("Spell attack", derived.spellAttack);
  for (const [key, value] of Object.entries(derived.abilities)) check(`ability ${key}`, value);
  for (const [key, value] of Object.entries(derived.saves)) check(`save ${key}`, value);
  for (const skill of derived.skills) check(`skill ${skill.name}`, skill.mod);
  for (const lore of derived.lore) check(`lore ${lore.name}`, lore.mod);
  for (const attack of derived.attacks) {
    check(`attack ${attack.name}`, attack.attackBonus);
    if (attack.damageFormula !== "0" && !validateFormula(attack.damageFormula).ok) {
      issues.push(`${featName}: invalid damage formula ${attack.damageFormula}`);
    }
  }
  return issues;
}

function fillChoice(draft: CharacterDraft, context: CharacterContext, feat: Feat): void {
  const choice = featChoice(feat.id);
  if (!choice) return;
  if (choice.kind === "text") {
    draft.featChoices[feat.id] = [
      (choice.placeholder ?? "").replace(/^e\.g\.\s*/i, "").trim() || "Adventuring Lore",
    ];
    return;
  }
  const options = featChoiceOptions(choice, draft, context);
  if (options.length) draft.featChoices[feat.id] = [options[0].id];
}

/** Fill class-grant groups activated by the candidate feat. */
function fillGrantChoices(
  draft: CharacterDraft,
  classData: ClassData,
  deity: Deity | null | undefined
): void {
  const featIds = selectedClassGrants(draft, classData, deity).feats.map((feat) => feat.id);
  for (const group of activeGrantChoiceGroups(draft, classData, deity, featIds)) {
    if (!group.options.length) continue;
    const existing = (draft.grantChoices[group.key] ?? []).filter((id) =>
      group.options.some((option) => option.id === id)
    );
    if (existing.length >= group.count) {
      draft.grantChoices[group.key] = existing.slice(0, group.count);
      continue;
    }
    const remaining = group.options.filter((option) => !existing.includes(option.id));
    draft.grantChoices[group.key] = [
      ...existing,
      ...remaining.slice(0, group.count - existing.length).map((option) => option.id),
    ].slice(0, group.count);
  }
}

/**
 * Keep the chosen-skill count stable when the candidate feat fixes a skill
 * that was previously chosen manually. Only newly fixed skills are replaced,
 * so existing feat prerequisites such as "trained in Deception" stay intact.
 */
function rebalanceSkills(
  draft: CharacterDraft,
  context: CharacterContext,
  baselineFixed: Set<string>
): void {
  const fixed = grantedTrainedSkills(draft, context);
  const newlyFixed = new Set([...fixed].filter((skill) => !baselineFixed.has(skill)));
  if (!newlyFixed.size) return;
  const selected = draft.skills.trained.filter((skill) => SKILL_BY_ID[skill as SkillId]);
  const needed = selected.length;
  const cleaned = selected.filter((skill) => !newlyFixed.has(skill));
  if (cleaned.length === needed) return;
  const pool = SKILLS.map((skill) => skill.id).filter(
    (skill) => !fixed.has(skill) && !cleaned.includes(skill)
  );
  while (cleaned.length < needed && pool.length) cleaned.push(pool.shift()!);
  draft.skills.trained = cleaned;
}

function runClass(classData: ClassData, index: number): void {
  const className = classData.name;
  const stats = {
    tested: 0,
    classSkipped: 0,
    levelSkipped: 0,
    prerequisiteSkipped: 0,
    failures: 0,
  };
  report.perClass[className] = stats;

  let build: ReturnType<typeof buildSimulatedCharacter>;
  try {
    build = buildSimulatedCharacter({
      seed: 120_000 + index,
      className,
      level: 20,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.failures.push({
      className,
      featName: "(baseline)",
      featId: "",
      reason: `Could not build the level-20 baseline: ${message}`,
    });
    stats.failures += 1;
    return;
  }

  const baselineDraft = build.draft;
  const baselineContext = contextForDraft(baselineDraft);
  const baseline = computeCharacter(baselineDraft, baselineContext);
  const baselineFixed = grantedTrainedSkills(baselineDraft, baselineContext);
  const baselineErrors = baseline.validation.filter((issue) => issue.severity === "error");
  if (baselineErrors.length) {
    report.failures.push({
      className,
      featName: "(baseline)",
      featId: "",
      reason: `Baseline has validation errors: ${baselineErrors
        .map((issue) => issue.message)
        .slice(0, 3)
        .join("; ")}`,
    });
    stats.failures += 1;
    return;
  }

  for (const feat of selectedFeats) {
    report.combinations += 1;
    if (feat.level > 20) {
      report.levelSkipped += 1;
      stats.levelSkipped += 1;
      continue;
    }
    const access = featClassAccess(feat, baselineContext);
    if (!access.allowed) {
      report.classSkipped += 1;
      stats.classSkipped += 1;
      continue;
    }
    const prerequisite = featPrerequisiteStatus(feat, baselineDraft, baselineContext, baseline);
    if (prerequisite.status === "unmet") {
      report.prerequisiteSkipped += 1;
      stats.prerequisiteSkipped += 1;
      continue;
    }
    if (prerequisite.status === "unknown") report.prerequisiteVerify += 1;

    const draft: CharacterDraft = {
      ...baselineDraft,
      feats: {
        ...baselineDraft.feats,
        extras: [...baselineDraft.feats.extras, feat.id],
      },
      featChoices: { ...baselineDraft.featChoices },
      grantChoices: { ...baselineDraft.grantChoices },
      skills: {
        ...baselineDraft.skills,
        trained: [...baselineDraft.skills.trained],
      },
    };
    fillChoice(draft, baselineContext, feat);
    fillGrantChoices(draft, classData, baselineContext.deity);
    const context: CharacterContext = {
      ...baselineContext,
      feats: { ...baselineContext.feats, [feat.id]: feat },
    };
    rebalanceSkills(draft, context, baselineFixed);

    let derived: ReturnType<typeof computeCharacter>;
    try {
      derived = computeCharacter(draft, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failures.push({
        className,
        featName: feat.name,
        featId: feat.id,
        reason: `Sheet computation threw: ${message}`,
      });
      stats.failures += 1;
      continue;
    }

    const errors = derived.validation.filter((issue) => issue.severity === "error");
    if (errors.length) {
      report.failures.push({
        className,
        featName: feat.name,
        featId: feat.id,
        reason: errors
          .map((issue) => issue.message)
          .slice(0, 3)
          .join("; "),
      });
      stats.failures += 1;
      continue;
    }
    if (!derived.selectedFeats.some((entry) => entry.id === feat.id)) {
      report.failures.push({
        className,
        featName: feat.name,
        featId: feat.id,
        reason: "The selected feat is missing from the derived character sheet.",
      });
      stats.failures += 1;
      continue;
    }
    const issues = numericIssues(derived, feat.name);
    for (const note of featEffect(feat.id)?.notes ?? []) {
      if (!derived.notes.includes(note)) {
        issues.push(`${feat.name}: automation note is missing from the sheet.`);
      }
    }
    if (issues.length) {
      report.failures.push({
        className,
        featName: feat.name,
        featId: feat.id,
        reason: issues.slice(0, 3).join("; "),
      });
      stats.failures += 1;
      continue;
    }

    report.tested += 1;
    stats.tested += 1;
  }

  console.log(
    `${className.padEnd(16)} tested ${String(stats.tested).padStart(4)} · class-skip ${String(
      stats.classSkipped
    ).padStart(4)} · prereq-skip ${String(stats.prerequisiteSkipped).padStart(4)} · failures ${
      stats.failures
    }`
  );
}

const started = Date.now();
for (let index = 0; index < selectedClasses.length; index += 1) {
  runClass(selectedClasses[index], index);
}
report.finishedAt = new Date().toISOString();

console.log(
  `\nFeat/class combinations: ${report.combinations}; tested ${report.tested}; class-skipped ${report.classSkipped}; level-skipped ${report.levelSkipped}; prerequisite-skipped ${report.prerequisiteSkipped}; failures ${report.failures.length}.`
);
console.log(`Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (report.failures.length) {
  console.log("\nFailures:");
  for (const failure of report.failures.slice(0, 30)) {
    console.log(`  ${failure.className} · ${failure.featName}: ${failure.reason}`);
  }
}

if (reportPath) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Report written to ${reportPath}`);
}
if (report.failures.length) process.exitCode = 1;
