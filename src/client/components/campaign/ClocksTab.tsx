import { useEffect, useState } from "react";
import { Check, EyeOff, Minus, Pencil, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import type { CampaignClock } from "../../../shared/types";
import { CLOCK_SEGMENT_OPTIONS, clockIsComplete } from "../../../shared/clocks";
import { api } from "../../api";
import { getSocket } from "../../socket";
import { errorMessage, useToasts } from "../../stores";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageEyebrow,
  Select,
  Spinner,
  Textarea,
} from "../ui";

interface ClockForm {
  id: string | null;
  name: string;
  description: string;
  segments: string;
  visible: boolean;
  playerEditable: boolean;
}

function emptyForm(): ClockForm {
  return {
    id: null,
    name: "",
    description: "",
    segments: "6",
    visible: true,
    playerEditable: false,
  };
}

export function ClocksTab({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const toast = useToasts((state) => state.push);
  const [clocks, setClocks] = useState<CampaignClock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ClockForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await api<{ clocks: CampaignClock[] }>(`/api/campaigns/${campaignId}/clocks`);
      setClocks(result.clocks);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = (payload: { campaignId: string }) => {
      if (payload.campaignId === campaignId) void load();
    };
    socket.on("clocks:changed", refresh);
    return () => {
      socket.off("clocks:changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const openCreate = () => setEditor(emptyForm());

  const openEdit = (clock: CampaignClock) =>
    setEditor({
      id: clock.id,
      name: clock.name,
      description: clock.description,
      segments: String(clock.segments),
      visible: clock.visible,
      playerEditable: clock.playerEditable,
    });

  const save = async () => {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast("Give the clock a name.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: editor.name,
        description: editor.description,
        segments: Number(editor.segments),
        visible: editor.visible,
        playerEditable: editor.playerEditable,
      };
      const result = await api<{ clock: CampaignClock }>(
        editor.id
          ? `/api/campaigns/${campaignId}/clocks/${editor.id}`
          : `/api/campaigns/${campaignId}/clocks`,
        { method: editor.id ? "PUT" : "POST", body }
      );
      setClocks((current) =>
        editor.id
          ? current.map((clock) => (clock.id === result.clock.id ? result.clock : clock))
          : [...current, result.clock]
      );
      setEditor(null);
      toast(editor.id ? "Clock updated." : "Clock created.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const tick = async (clock: CampaignClock, delta: number) => {
    setBusyId(clock.id);
    try {
      const result = await api<{ clock: CampaignClock; complete: boolean }>(
        `/api/campaigns/${campaignId}/clocks/${clock.id}/tick`,
        { method: "POST", body: { delta } }
      );
      setClocks((current) =>
        current.map((entry) => (entry.id === result.clock.id ? result.clock : entry))
      );
      if (result.complete && !clockIsComplete(clock.filled, clock.segments)) {
        toast(`${result.clock.name} is complete.`, "success");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (clock: CampaignClock) => {
    if (!window.confirm(`Delete the clock "${clock.name}"?`)) return;
    setBusyId(clock.id);
    try {
      await api(`/api/campaigns/${campaignId}/clocks/${clock.id}`, { method: "DELETE" });
      setClocks((current) => current.filter((entry) => entry.id !== clock.id));
      toast("Clock deleted.", "info");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-inner clocks-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Victory points</PageEyebrow>
          <h2>Clocks &amp; progress tracks</h2>
          <p>
            Shared countdowns for rituals, pursuits, investigations, and faction progress. Filled
            segments are visible to everyone who can see the clock.
          </p>
        </div>
        {isGm ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
            Add clock
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Spinner label="Reading the clocks." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : clocks.length ? (
        <div className="clock-grid">
          {clocks.map((clock) => {
            const complete = clockIsComplete(clock.filled, clock.segments);
            const canTick = isGm || (clock.visible && clock.playerEditable);
            return (
              <Card className={`clock-card ${complete ? "is-complete" : ""}`} key={clock.id}>
                <div className="row-between clock-head">
                  <div>
                    <div className="row wrap" style={{ gap: 7 }}>
                      <h3>{clock.name}</h3>
                      {clock.visible ? null : (
                        <Badge tone="neutral">
                          <EyeOff size={11} /> GM only
                        </Badge>
                      )}
                      {complete ? (
                        <Badge tone="green">
                          <Check size={11} /> Complete
                        </Badge>
                      ) : null}
                    </div>
                    {clock.description ? <p className="small muted">{clock.description}</p> : null}
                  </div>
                  {isGm ? (
                    <div className="clock-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={13} />}
                        onClick={() => openEdit(clock)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={13} />}
                        loading={busyId === clock.id}
                        onClick={() => void remove(clock)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div
                  className="clock-segments"
                  role="img"
                  aria-label={`${clock.name}: ${clock.filled} of ${clock.segments} segments filled`}
                >
                  {Array.from({ length: clock.segments }, (_, index) => (
                    <span
                      key={index}
                      className={`clock-segment ${index < clock.filled ? "is-filled" : ""}`}
                    />
                  ))}
                </div>
                <div className="row-between clock-foot">
                  <span className="tiny muted">
                    {clock.filled} / {clock.segments} filled ·{" "}
                    {isGm
                      ? "GM control"
                      : clock.playerEditable
                        ? "Players can advance"
                        : "GM advances"}
                  </span>
                  {canTick ? (
                    <div className="row" style={{ gap: 5 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove one segment from ${clock.name}`}
                        disabled={clock.filled === 0}
                        loading={busyId === clock.id}
                        onClick={() => void tick(clock, -1)}
                      >
                        <Minus size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Reset ${clock.name}`}
                        disabled={clock.filled === 0}
                        loading={busyId === clock.id}
                        onClick={() => void tick(clock, -clock.filled)}
                      >
                        <RotateCcw size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        aria-label={`Add one segment to ${clock.name}`}
                        disabled={complete}
                        loading={busyId === clock.id}
                        onClick={() => void tick(clock, 1)}
                      >
                        <Plus size={13} />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Timer size={30} />}
          title="No clocks yet"
          description={
            isGm
              ? "Create a clock for a ritual, chase, investigation, or faction goal."
              : "The GM hasn't shared any progress clocks yet."
          }
          action={
            isGm ? (
              <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                Add clock
              </Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.id ? "Edit clock" : "Add clock"}
        subtitle="A clock fills from left to right. Hidden clocks stay GM-only."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editor?.id ? "Save clock" : "Create clock"}
            </Button>
          </>
        }
      >
        {editor ? (
          <div className="stack">
            <Field label="Clock name">
              <Input
                value={editor.name}
                maxLength={80}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
                placeholder="Ritual of the Ashen Crown"
              />
            </Field>
            <Field label="Description (optional)">
              <Textarea
                value={editor.description}
                rows={3}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, description: event.target.value } : current
                  )
                }
                placeholder="What fills this clock, and what happens when it completes?"
              />
            </Field>
            <Field label="Segments">
              <Select
                value={editor.segments}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, segments: event.target.value } : current
                  )
                }
              >
                {CLOCK_SEGMENT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} segments
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox
              label="Show this clock to players"
              checked={editor.visible}
              onChange={(checked) =>
                setEditor((current) => (current ? { ...current, visible: checked } : current))
              }
            />
            <Checkbox
              label="Players can add or remove segments"
              checked={editor.playerEditable}
              onChange={(checked) =>
                setEditor((current) =>
                  current ? { ...current, playerEditable: checked } : current
                )
              }
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
