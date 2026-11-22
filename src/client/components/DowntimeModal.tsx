import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Coins, Hammer, Moon, TrendingUp } from "lucide-react";
import type {
  CharacterDraft,
  CharacterRecord,
  DegreeOfSuccess,
  DerivedCharacter,
  DowntimeActivity,
  DowntimeActivityKind,
  RollResult,
} from "../../shared/types";
import { PROFICIENCY_NAMES } from "../../shared/types";
import { DEGREE_LABELS } from "../../shared/dice";
import {
  DOWNTIME_ACTIVITY_KINDS,
  defaultSubsistDc,
  downtimeKindLabel,
} from "../../shared/downtime";
import { dcForLevel } from "../../shared/gmScreen";
import { currencyToCp } from "../../shared/inventory";
import { lifestyleRate, upkeepCostCp } from "../../shared/upkeep";
import { api, formatCp } from "../api";
import { errorMessage } from "../stores";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageEyebrow,
  ProgressBar,
  Select,
  Tag,
  Textarea,
} from "./ui";

interface DowntimeResponse {
  character: CharacterRecord;
  days: number;
  paidCp: number;
  lifestyle: string;
  label: string;
  activity: DowntimeActivity | null;
  roll: RollResult | null;
  degree: DegreeOfSuccess | null;
  earnedCp: number;
  upkeepWaived: boolean;
  completed: boolean;
}

function signedMod(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function degreeTone(degree: DegreeOfSuccess | null): "green" | "gold" | "red" | "neutral" {
  if (degree === "critical-success" || degree === "success") return "green";
  if (degree === "failure") return "gold";
  if (degree === "critical-failure") return "red";
  return "neutral";
}

function activityMessage(result: DowntimeResponse): string {
  const kind = result.activity?.kind;
  const earned = result.earnedCp > 0 ? `Earned ${formatCp(result.earnedCp)}. ` : "";
  if (kind === "subsist") {
    return result.upkeepWaived
      ? `${result.degree ? DEGREE_LABELS[result.degree] : "Subsist"}: upkeep waived for the day.`
      : `${result.degree ? DEGREE_LABELS[result.degree] : "Subsist"}: paid ${formatCp(
          result.paidCp
        )} upkeep and became fatigued.`;
  }
  if (kind === "craft" || kind === "retrain") {
    const activity = result.activity;
    const daysSpent = activity?.daysSpent ?? 0;
    return result.completed
      ? `${activity?.label ?? "Project"} complete after ${daysSpent} ${
          daysSpent === 1 ? "day" : "days"
        }. Paid ${formatCp(result.paidCp)} upkeep.`
      : `${activity?.label ?? "Project"}: day ${daysSpent} of ${
          activity?.daysRequired ?? 0
        }. Paid ${formatCp(result.paidCp)} upkeep.`;
  }
  if (kind === "earn-income") {
    const degree = result.degree ? `${DEGREE_LABELS[result.degree]}. ` : "";
    return `${degree}${earned}Paid ${formatCp(result.paidCp)} upkeep.`;
  }
  return `Spent a downtime day. ${earned}Paid ${formatCp(result.paidCp)} upkeep.`;
}

export function DowntimeModal({
  open,
  onClose,
  character,
  draft,
  derived,
  canEdit,
  toast,
  onCharacterUpdated,
}: {
  open: boolean;
  onClose: () => void;
  character: CharacterRecord | null;
  draft: CharacterDraft | null;
  derived: DerivedCharacter | null;
  canEdit: boolean;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
  onCharacterUpdated: (character: CharacterRecord) => void;
}) {
  const [kind, setKind] = useState<DowntimeActivityKind>("earn-income");
  const [skill, setSkill] = useState("crafting");
  const [taskLevel, setTaskLevel] = useState("1");
  const [dc, setDc] = useState("15");
  const [label, setLabel] = useState("");
  const [daysRequired, setDaysRequired] = useState("4");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<DowntimeResponse | null>(null);
  const wasOpen = useRef(false);

  const incomeSkills = useMemo(() => {
    if (!derived) return [];
    const base = derived.skills
      .filter((entry) => entry.rank > 0)
      .map((entry) => ({
        value: entry.id,
        name: entry.name,
        mod: entry.mod,
        rank: entry.rank,
      }));
    const lore = derived.lore
      .filter((entry) => entry.rank > 0)
      .map((entry) => ({
        value: `lore:${entry.name}`,
        name: `${entry.name} Lore`,
        mod: entry.mod,
        rank: entry.rank,
      }));
    return [...base, ...lore].sort((a, b) => a.name.localeCompare(b.name));
  }, [derived]);

  const subsistSkills = useMemo(() => {
    if (!derived) return [];
    return derived.skills
      .filter((entry) => entry.id === "society" || entry.id === "survival")
      .map((entry) => ({ value: entry.id, name: entry.name, mod: entry.mod }));
  }, [derived]);

  const skillEntry = (key: string | null) => {
    if (!derived || !key) return null;
    if (key.startsWith("lore:")) {
      const name = key.slice(5);
      return derived.lore.find((entry) => entry.name.toLowerCase() === name.toLowerCase()) ?? null;
    }
    return derived.skills.find((entry) => entry.id === key) ?? null;
  };

  useEffect(() => {
    if (open && !wasOpen.current && draft) {
      const level = Math.max(
        0,
        Math.min(draft.level, character?.campaignSettlementLevel ?? draft.level)
      );
      setKind("earn-income");
      setSkill(incomeSkills[0]?.value ?? "crafting");
      setTaskLevel(String(level));
      setDc(String(dcForLevel(level)));
      setLabel("");
      setDaysRequired("4");
      setNotes("");
      setError("");
      setResult(null);
    }
    wasOpen.current = open;
  }, [open, draft, character?.campaignSettlementLevel, incomeSkills]);

  if (!open || !draft || !character || !derived) return null;

  const rate = lifestyleRate(draft.play.lifestyle);
  const upkeepCp = upkeepCostCp(rate.id, 1);
  const activeActivities = draft.play.downtimeActivities.filter(
    (activity) => activity.status === "active"
  );
  const recentActivities = draft.play.downtimeActivities
    .filter((activity) => activity.status === "complete")
    .slice(0, 6);
  const daysLeft = draft.play.downtimeDays;
  const incomeSkillValid =
    kind !== "earn-income" || incomeSkills.some((entry) => entry.value === skill);
  const canSpendDay = canEdit && daysLeft > 0 && busy === null;
  const canStart = canSpendDay && incomeSkillValid;

  const send = async (activityPayload: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey);
    setError("");
    try {
      const response = await api<DowntimeResponse>(
        `/api/characters/${character.id}/downtime/spend`,
        { method: "POST", body: { activity: activityPayload } }
      );
      onCharacterUpdated(response.character);
      setResult(response);
      const tone =
        response.degree === "critical-failure"
          ? "error"
          : response.degree === "failure"
            ? "info"
            : "success";
      toast(activityMessage(response), tone);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const selectKind = (next: DowntimeActivityKind) => {
    setKind(next);
    setError("");
    if (next === "earn-income") {
      setSkill(incomeSkills[0]?.value ?? "crafting");
      setDc(String(dcForLevel(Number(taskLevel) || 0)));
    } else if (next === "subsist") {
      setSkill(subsistSkills[0]?.value ?? "survival");
      setDc(String(defaultSubsistDc(character.campaignSettlementLevel ?? 1)));
    } else if (next === "craft") {
      setDaysRequired("4");
    } else if (next === "retrain") {
      setDaysRequired("7");
    }
  };

  const startActivity = () => {
    const payload: Record<string, unknown> = { kind, notes };
    if (kind === "earn-income") {
      payload.skill = skill;
      payload.taskLevel = Math.max(0, Math.min(20, Number(taskLevel) || 0));
      payload.dc = Math.max(1, Math.min(100, Number(dc) || dcForLevel(Number(taskLevel) || 0)));
      payload.label = label.trim();
    } else if (kind === "subsist") {
      payload.skill = skill;
      payload.dc = Math.max(
        1,
        Math.min(100, Number(dc) || defaultSubsistDc(character.campaignSettlementLevel ?? 1))
      );
    } else if (kind === "craft" || kind === "retrain") {
      payload.label = label.trim();
      payload.daysRequired = Math.max(1, Math.min(3650, Number(daysRequired) || 4));
    } else {
      payload.label = label.trim();
    }
    void send(payload, "new");
  };

  const activeIcon = (activity: DowntimeActivity) => {
    if (activity.kind === "earn-income") return <TrendingUp size={15} />;
    if (activity.kind === "subsist") return <Moon size={15} />;
    if (activity.kind === "craft") return <Hammer size={15} />;
    return <CalendarClock size={15} />;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Downtime activities"
      subtitle={`Spend a day on work, subsistence, or a project. Upkeep is charged for the day unless Subsist waives it.`}
      wide
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="stack">
        <div className="row wrap">
          <Badge tone={daysLeft > 0 ? "green" : "red"}>
            {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </Badge>
          <Badge tone="gold">
            <Coins size={12} /> {formatCp(currencyToCp(draft.currency))} purse
          </Badge>
          <Badge>
            {formatCp(upkeepCp)}/day · {rate.label}
          </Badge>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        {result ? (
          <div className="downtime-result">
            <div className="row-between">
              <strong>{result.activity?.label ?? "Last downtime day"}</strong>
              {result.degree ? (
                <Tag tone={degreeTone(result.degree)}>{DEGREE_LABELS[result.degree]}</Tag>
              ) : null}
            </div>
            {result.roll ? (
              <p className="small">
                <span className="muted">{result.roll.label}:</span> {result.roll.total} (
                {result.roll.breakdown})
              </p>
            ) : null}
            <p className="tiny muted">
              Earned {formatCp(result.earnedCp)} · Paid {formatCp(result.paidCp)}
              {result.upkeepWaived ? " · upkeep waived" : ""}
            </p>
          </div>
        ) : null}

        <div className="downtime-section">
          <PageEyebrow>Active work</PageEyebrow>
          {activeActivities.length ? (
            <div className="stack-sm">
              {activeActivities.map((activity) => (
                <div key={activity.id} className="downtime-activity">
                  <div className="row-between">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="downtime-icon">{activeIcon(activity)}</span>
                      <div>
                        <strong>{activity.label}</strong>
                        <div className="tiny muted">
                          {downtimeKindLabel(activity.kind)}
                          {activity.skill
                            ? ` · ${skillEntry(activity.skill)?.name ?? activity.skill}`
                            : ""}
                          {activity.taskLevel !== null ? ` · level ${activity.taskLevel}` : ""}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === activity.id}
                      disabled={!canSpendDay}
                      onClick={() => void send({ activityId: activity.id }, activity.id)}
                    >
                      {activity.kind === "earn-income" ? "Work a day" : "Spend a day"}
                    </Button>
                  </div>
                  {activity.daysRequired !== null ? (
                    <ProgressBar
                      value={activity.daysSpent}
                      max={activity.daysRequired}
                      label={`${activity.daysSpent} of ${activity.daysRequired} ${
                        activity.daysRequired === 1 ? "day" : "days"
                      }`}
                    />
                  ) : (
                    <p className="tiny muted">
                      {activity.dailyEarnedCp !== null
                        ? `${formatCp(activity.dailyEarnedCp)}/day after the first check · `
                        : "First day rolls the check · "}
                      {activity.daysSpent} day{activity.daysSpent === 1 ? "" : "s"} worked ·{" "}
                      {formatCp(activity.earnedCp)} earned
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">No active jobs or projects.</p>
          )}
        </div>

        <div className="downtime-section">
          <PageEyebrow>Plan a day</PageEyebrow>
          <Field label="Activity">
            <Select
              value={kind}
              aria-label="Downtime activity"
              disabled={!canEdit}
              onChange={(event) => selectKind(event.target.value as DowntimeActivityKind)}
            >
              {DOWNTIME_ACTIVITY_KINDS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="tiny muted">
            {DOWNTIME_ACTIVITY_KINDS.find((entry) => entry.id === kind)?.description}
          </p>

          {kind === "earn-income" ? (
            <>
              <div className="downtime-form-row">
                <Field
                  label="Skill"
                  hint={incomeSkills.length ? undefined : "No trained skills available."}
                >
                  <Select
                    value={skill}
                    aria-label="Earn Income skill"
                    disabled={!canEdit || !incomeSkills.length}
                    onChange={(event) => setSkill(event.target.value)}
                  >
                    {incomeSkills.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.name} ({PROFICIENCY_NAMES[entry.rank]}, {signedMod(entry.mod)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Task level">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={taskLevel}
                    aria-label="Task level"
                    disabled={!canEdit}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTaskLevel(value);
                      setDc(String(dcForLevel(Math.max(0, Math.min(20, Number(value) || 0)))));
                    }}
                  />
                </Field>
                <Field label="DC">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={dc}
                    aria-label="Earn Income DC"
                    disabled={!canEdit}
                    onChange={(event) => setDc(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Job label" hint="Optional. For example, “Harbor stevedore”.">
                <Input
                  value={label}
                  maxLength={120}
                  placeholder="Earn Income job"
                  disabled={!canEdit}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {kind === "subsist" ? (
            <div className="downtime-form-row">
              <Field label="Skill" hint="Society in a settlement, Survival in the wild.">
                <Select
                  value={skill}
                  aria-label="Subsist skill"
                  disabled={!canEdit}
                  onChange={(event) => setSkill(event.target.value)}
                >
                  {subsistSkills.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.name} ({signedMod(entry.mod)})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="DC">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={dc}
                  aria-label="Subsist DC"
                  disabled={!canEdit}
                  onChange={(event) => setDc(event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {kind === "craft" || kind === "retrain" ? (
            <div className="downtime-form-row">
              <Field label={kind === "craft" ? "Project" : "Retraining"}>
                <Input
                  value={label}
                  maxLength={120}
                  placeholder={kind === "craft" ? "Craft a striking rune" : "Retrain a skill feat"}
                  disabled={!canEdit}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              <Field label="Days required">
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={daysRequired}
                  aria-label="Days required"
                  disabled={!canEdit}
                  onChange={(event) => setDaysRequired(event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {kind === "other" ? (
            <Field label="Label">
              <Input
                value={label}
                maxLength={120}
                placeholder="Research, carouse, or perform a ritual"
                disabled={!canEdit}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
          ) : null}

          <Field
            label="Notes"
            hint="Kept on the activity log; the table still resolves materials and story requirements."
          >
            <Textarea
              rows={2}
              value={notes}
              maxLength={4000}
              disabled={!canEdit}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          <div className="row-between">
            <span className="tiny muted">
              {daysLeft > 0
                ? `This charges ${formatCp(upkeepCp)} upkeep unless Subsist succeeds.`
                : "The GM must grant more downtime days."}
            </span>
            <Button
              variant="primary"
              icon={<CalendarClock size={14} />}
              loading={busy === "new"}
              disabled={!canStart}
              onClick={startActivity}
            >
              Spend a day
            </Button>
          </div>
        </div>

        <div className="downtime-section">
          <PageEyebrow>Recent log</PageEyebrow>
          {recentActivities.length ? (
            <div className="stack-sm">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="row-between downtime-log-row">
                  <div>
                    <strong>{activity.label}</strong>
                    <div className="tiny muted">
                      {downtimeKindLabel(activity.kind)} · {activity.daysSpent} day
                      {activity.daysSpent === 1 ? "" : "s"} · earned {formatCp(activity.earnedCp)} ·
                      paid {formatCp(activity.paidCp)}
                    </div>
                  </div>
                  {activity.lastDegree ? (
                    <Tag tone={degreeTone(activity.lastDegree)}>
                      {DEGREE_LABELS[activity.lastDegree]}
                    </Tag>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">No completed downtime days yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
