import { useEffect, useMemo, useState } from "react";
import { Dices, EyeOff, Search, Shield, Sparkles } from "lucide-react";
import type { CharacterRecord, ConditionRef } from "../../../shared/types";
import {
  DC_ADJUSTMENTS,
  SIMPLE_DCS,
  adjustDc,
  dcForLevel,
  type DcAdjustment,
} from "../../../shared/gmScreen";
import { api } from "../../api";
import { connectSocket } from "../../socket";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageEyebrow,
  RichText,
  Spinner,
  Tag,
  Toggle,
} from "../ui";

function partyLevel(characters: CharacterRecord[]): number {
  const levels = characters
    .map((character) => character.summary?.level)
    .filter((level): level is number => typeof level === "number");
  if (!levels.length) return 1;
  return Math.round(levels.reduce((total, level) => total + level, 0) / levels.length);
}

export function GmScreen({
  campaignId,
  characters,
  toast,
}: {
  campaignId: string;
  characters: CharacterRecord[];
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [conditions, setConditions] = useState<ConditionRef[]>([]);
  const [conditionQuery, setConditionQuery] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<ConditionRef | null>(null);
  const [conditionsLoading, setConditionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(() => partyLevel(characters));
  const [adjustment, setAdjustment] = useState<DcAdjustment>("normal");
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("Secret check");
  const [dc, setDc] = useState("");
  const [rollBusy, setRollBusy] = useState(false);
  const [groupCheck, setGroupCheck] = useState(false);
  const [lastRoll, setLastRoll] = useState<{ label: string; total: number; degree: string | null } | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConditionsLoading(true);
    api<{ items: ConditionRef[] }>("/api/compendium/conditions")
      .then((result) => {
        setConditions(result.items);
        setSelectedCondition((current) => current ?? result.items[0] ?? null);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setConditionsLoading(false));
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const join = () => {
      socket.emit("campaign:join", { campaignId }, (ack) => {
        const result = ack as { ok?: boolean } | undefined;
        setConnected(Boolean(result?.ok));
      });
    };
    if (socket.connected) join();
    else socket.on("connect", join);
    return () => {
      socket.off("connect", join);
    };
  }, [campaignId]);

  const filteredConditions = useMemo(() => {
    const value = conditionQuery.trim().toLowerCase();
    if (!value) return conditions;
    return conditions.filter(
      (condition) =>
        condition.name.toLowerCase().includes(value) ||
        condition.description.toLowerCase().includes(value),
    );
  }, [conditions, conditionQuery]);

  const baseDc = dcForLevel(level);
  const finalDc = adjustDc(baseDc, adjustment);
  const parsedDc = dc.trim() === "" ? null : Number(dc);

  const useDc = (value: number, source: string) => {
    setDc(String(value));
    setLabel(source);
    toast(`Roll DC set to ${value}.`, "success");
  };

  const secretRoll = () => {
    if (!connected) {
      toast("The live table connection is not ready yet.", "error");
      return;
    }
    if (!formula.trim()) {
      toast("Enter a roll formula.", "error");
      return;
    }
    setRollBusy(true);
    connectSocket().emit(
      "dice:roll",
      {
        campaignId,
        formula: formula.trim(),
        label: label.trim() || "Secret check",
        dc: parsedDc !== null && Number.isFinite(parsedDc) ? parsedDc : null,
        visibility: "gm",
      },
      (message) => {
        setRollBusy(false);
        if (!message) {
          toast("That secret roll could not be made. Check the formula.", "error");
          return;
        }
        const data = message.data as { total?: number; degree?: string } | null;
        const total = typeof data?.total === "number" ? data.total : null;
        setLastRoll({
          label: message.content,
          total: total ?? 0,
          degree: data?.degree ?? null,
        });
        toast(total !== null ? `Secret roll: ${total}` : "Secret roll made.", "success");
      },
    );
  };

  const requestRoll = () => {
    if (!connected) {
      toast("The live table connection is not ready yet.", "error");
      return;
    }
    if (!formula.trim()) {
      toast("Enter a roll formula.", "error");
      return;
    }
    connectSocket().emit(
      "dice:request",
      {
        campaignId,
        formula: formula.trim(),
        label: label.trim() || "Roll request",
        dc: parsedDc !== null && Number.isFinite(parsedDc) ? parsedDc : null,
        group: groupCheck,
      },
      (message) => {
        toast(message ? "Roll request sent to the table." : "Could not send the roll request.", message ? "success" : "error");
      },
    );
  };

  return (
    <div className="page-inner gm-screen-page">
      <div className="section-title">
        <div>
          <PageEyebrow>GM screen</PageEyebrow>
          <h2>Run the table</h2>
          <p>DCs, conditions, secret rolls, and player roll requests without leaving the campaign.</p>
        </div>
        <div className="row" style={{ gap: 7 }}>
          <Badge tone={connected ? "green" : "neutral"}>{connected ? "Live" : "Connecting…"}</Badge>
          <Tag tone="violet">GM only</Tag>
        </div>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="gm-screen-grid">
        <Card className="gm-roll-card">
          <div className="row-between">
            <div>
              <PageEyebrow>Quick roll</PageEyebrow>
              <h3>Secret check or player request</h3>
            </div>
            <EyeOff size={19} />
          </div>
          <Field label="Formula">
            <Input value={formula} onChange={(event) => setFormula(event.target.value)} placeholder="1d20+12" />
          </Field>
          <div className="form-grid two">
            <Field label="Label">
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Secret Perception" />
            </Field>
            <Field label="DC">
              <Input
                type="number"
                value={dc}
                onChange={(event) => setDc(event.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
          <div className="gm-roll-actions">
            <Toggle
              checked={groupCheck}
              onChange={setGroupCheck}
              label="Group check"
              title="Ask every player for the same check."
            />
            <Button variant="primary" icon={<Dices size={15} />} loading={rollBusy} onClick={secretRoll}>
              Secret roll
            </Button>
            <Button variant="secondary" icon={<Sparkles size={15} />} onClick={requestRoll}>
              {groupCheck ? "Request group check" : "Request from players"}
            </Button>
          </div>
          <p className="tiny muted">
            Secret rolls are posted only to the GM chat. Requests appear in the shared chat with a prefilled dice tray.
            Group checks are marked as a table-wide request.
          </p>
          {lastRoll ? (
            <div className="gm-last-roll">
              <span className="tiny muted">Last secret roll</span>
              <strong>{lastRoll.total}</strong>
              <span>{lastRoll.label}</span>
              {lastRoll.degree ? <Tag tone="gold">{lastRoll.degree.replace("-", " ")}</Tag> : null}
            </div>
          ) : null}
        </Card>

        <Card className="gm-dc-card">
          <div className="row-between">
            <div>
              <PageEyebrow>DC reference</PageEyebrow>
              <h3>Level-based and simple DCs</h3>
            </div>
            <Shield size={19} />
          </div>
          <div className="gm-dc-controls">
            <Field label="Level">
              <Input
                type="number"
                min={0}
                max={25}
                value={level}
                onChange={(event) => setLevel(Math.max(0, Math.min(25, Number(event.target.value) || 0)))}
              />
            </Field>
            <div className="gm-adjustments">
              {DC_ADJUSTMENTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`gm-adjustment ${adjustment === option.id ? "is-active" : ""}`}
                  onClick={() => setAdjustment(option.id)}
                >
                  {option.label}
                  <span>{option.value >= 0 ? `+${option.value}` : option.value}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="gm-dc-result">
            <div>
              <span className="tiny muted">Level {level} · {DC_ADJUSTMENTS.find((entry) => entry.id === adjustment)?.label}</span>
              <strong>{finalDc}</strong>
              {finalDc !== baseDc ? <span className="tiny muted">base {baseDc}</span> : null}
            </div>
            <Button size="sm" variant="secondary" onClick={() => useDc(finalDc, `Level ${level} check`)}>
              Use for roll
            </Button>
          </div>
          <div className="gm-simple-dcs">
            {SIMPLE_DCS.map((entry) => (
              <button key={entry.id} type="button" className="gm-simple-dc" onClick={() => useDc(entry.dc, `${entry.label} check`)}>
                <span>{entry.label}</span>
                <strong>{entry.dc}</strong>
              </button>
            ))}
          </div>
        </Card>

        <Card className="gm-conditions-card">
          <div className="row-between">
            <div>
              <PageEyebrow>Conditions</PageEyebrow>
              <h3>Rules at a glance</h3>
            </div>
            <Tag tone="neutral">{conditions.length} conditions</Tag>
          </div>
          {conditionsLoading ? (
            <Spinner label="Loading conditions…" />
          ) : !conditions.length ? (
            <EmptyState icon={<Search size={26} />} title="No conditions loaded" description="The compendium may still be importing." />
          ) : (
            <div className="gm-condition-layout">
              <div className="gm-condition-list">
                <div className="search-box">
                  <Search size={15} />
                  <Input
                    value={conditionQuery}
                    onChange={(event) => setConditionQuery(event.target.value)}
                    placeholder="Search conditions…"
                  />
                </div>
                {filteredConditions.map((condition) => (
                  <button
                    key={condition.id}
                    type="button"
                    className={`gm-condition-row ${selectedCondition?.id === condition.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedCondition(condition)}
                  >
                    <strong>{condition.name}</strong>
                    <span className="tiny muted">{condition.source}</span>
                  </button>
                ))}
                {!filteredConditions.length ? <p className="muted small">No conditions match that search.</p> : null}
              </div>
              <div className="gm-condition-detail">
                {selectedCondition ? (
                  <>
                    <div className="row-between">
                      <h3>{selectedCondition.name}</h3>
                      <Tag>{selectedCondition.remaster ? "Remastered" : "Legacy"}</Tag>
                    </div>
                    <p className="tiny muted">{selectedCondition.source}</p>
                    <RichText html={selectedCondition.description} />
                  </>
                ) : (
                  <p className="muted small">Select a condition to read it.</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
