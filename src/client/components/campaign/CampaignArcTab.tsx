import { useEffect, useState, type FormEvent } from "react";
import { Milestone, Pencil, Plus, Trash2 } from "lucide-react";
import type { CampaignChapter, ChapterStatus } from "../../../shared/types";
import {
  CHAPTER_STATUSES,
  normalizeChapterLevel,
  normalizeChapterStatus,
} from "../../../shared/chapters";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageEyebrow,
  Select,
  Tag,
  Textarea,
} from "../ui";

function statusTone(status: ChapterStatus): "gold" | "blue" | "green" {
  if (status === "active") return "blue";
  if (status === "complete") return "green";
  return "gold";
}

export function CampaignArcTab({
  campaignId,
  isGm,
  refreshKey,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  refreshKey: number;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [chapters, setChapters] = useState<CampaignChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CampaignChapter | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ chapters: CampaignChapter[] }>(`/api/campaigns/${campaignId}/chapters`)
      .then((result) => {
        if (!cancelled) {
          setChapters(result.chapters);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshKey]);

  const replaceAll = (next: CampaignChapter[]) => setChapters(next);

  const markActive = async (chapter: CampaignChapter) => {
    setBusyId(chapter.id);
    setError("");
    try {
      const result = await api<{ chapters: CampaignChapter[] }>(
        `/api/campaigns/${campaignId}/chapters/${chapter.id}`,
        { method: "PATCH", body: { status: "active" } }
      );
      replaceAll(result.chapters);
      toast(`“${chapter.title}” is now the active chapter.`, "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const deleteChapter = async (chapter: CampaignChapter) => {
    if (!window.confirm(`Delete “${chapter.title}” from the adventure arc?`)) return;
    setBusyId(chapter.id);
    setError("");
    try {
      const result = await api<{ chapters: CampaignChapter[] }>(
        `/api/campaigns/${campaignId}/chapters/${chapter.id}`,
        { method: "DELETE" }
      );
      replaceAll(result.chapters);
      toast("Chapter deleted.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="muted small">Opening the adventure arc…</p>;
  if (error && !chapters.length) return <div className="auth-error">{error}</div>;

  const active = chapters.find((chapter) => chapter.status === "active");
  const completed = chapters.filter((chapter) => chapter.status === "complete").length;

  return (
    <div className="page-inner arc-page">
      <div className="section-title">
        <div>
          <PageEyebrow>AP scaffolding</PageEyebrow>
          <h2>Adventure arc</h2>
          <p>
            Break the adventure path into chapters with level ranges, keep one chapter active, and
            show the party where they are in the story.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Badge tone="violet">
            {completed}/{chapters.length} chapters complete
          </Badge>
          {isGm ? (
            <Button icon={<Plus size={15} />} onClick={() => setEditor("new")}>
              Add chapter
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}

      {active ? (
        <Card className="arc-active-card">
          <PageEyebrow>Now playing</PageEyebrow>
          <h3>{active.title}</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <Tag tone="blue">Active</Tag>
            <Badge tone="gold">
              Levels {active.levelStart}–{active.levelEnd}
            </Badge>
          </div>
          {active.summary ? <p className="small">{active.summary}</p> : null}
        </Card>
      ) : null}

      {chapters.length ? (
        <div className="arc-list">
          {chapters.map((chapter, index) => (
            <Card key={chapter.id} className={`arc-chapter arc-${chapter.status}`}>
              <div className="arc-chapter-head">
                <span className="arc-index">{index + 1}</span>
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <h3>{chapter.title}</h3>
                    <Tag tone={statusTone(chapter.status)}>
                      {CHAPTER_STATUSES.find((entry) => entry.id === chapter.status)?.label}
                    </Tag>
                    <Badge tone="neutral">
                      Levels {chapter.levelStart}–{chapter.levelEnd}
                    </Badge>
                  </div>
                  {chapter.summary ? <p className="small muted">{chapter.summary}</p> : null}
                </div>
                {isGm ? (
                  <div className="row wrap" style={{ gap: 4 }}>
                    {chapter.status !== "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Milestone size={13} />}
                        loading={busyId === chapter.id}
                        onClick={() => void markActive(chapter)}
                      >
                        Make active
                      </Button>
                    ) : null}
                    <IconButton label={`Edit ${chapter.title}`} onClick={() => setEditor(chapter)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${chapter.title}`}
                      onClick={() => void deleteChapter(chapter)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Milestone size={28} />}
          title="No chapters yet"
          description={
            isGm
              ? "Add the first chapter to give the campaign a visible shape."
              : "The GM has not outlined the adventure path yet."
          }
        />
      )}

      <ChapterEditor
        open={Boolean(editor)}
        chapter={editor}
        campaignId={campaignId}
        onClose={() => setEditor(null)}
        onSaved={(chapters) => {
          replaceAll(chapters);
          setEditor(null);
          toast(editor === "new" ? "Chapter added." : "Chapter saved.", "success");
        }}
        onError={(message) => toast(message, "error")}
      />
    </div>
  );
}

function ChapterEditor({
  open,
  chapter,
  campaignId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  chapter: CampaignChapter | "new" | null;
  campaignId: string;
  onClose: () => void;
  onSaved: (chapters: CampaignChapter[]) => void;
  onError: (message: string) => void;
}) {
  const editing = chapter && chapter !== "new" ? chapter : null;
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [levelStart, setLevelStart] = useState("1");
  const [levelEnd, setLevelEnd] = useState("1");
  const [status, setStatus] = useState<ChapterStatus>("planned");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setSummary(editing?.summary ?? "");
    setLevelStart(String(editing?.levelStart ?? 1));
    setLevelEnd(String(editing?.levelEnd ?? 1));
    setStatus(editing?.status ?? "planned");
    setError("");
  }, [open, editing?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the chapter a title.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        summary,
        levelStart: normalizeChapterLevel(levelStart),
        levelEnd: normalizeChapterLevel(levelEnd, normalizeChapterLevel(levelStart)),
        status: normalizeChapterStatus(status),
      };
      const result = editing
        ? await api<{ chapters: CampaignChapter[] }>(
            `/api/campaigns/${campaignId}/chapters/${editing.id}`,
            { method: "PATCH", body: payload }
          )
        : await api<{ chapters: CampaignChapter[] }>(`/api/campaigns/${campaignId}/chapters`, {
            method: "POST",
            body: payload,
          });
      onSaved(result.chapters);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.title}` : "New chapter"}
      subtitle="Map the adventure path into chapters with clear level ranges and summaries."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save chapter" : "Add chapter"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Chapter title">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="The Ashen Crown"
          />
        </Field>
        <div className="form-grid three">
          <Field label="Starting level">
            <Input
              type="number"
              min={1}
              max={20}
              value={levelStart}
              onChange={(event) => setLevelStart(event.target.value)}
            />
          </Field>
          <Field label="Ending level">
            <Input
              type="number"
              min={1}
              max={20}
              value={levelEnd}
              onChange={(event) => setLevelEnd(event.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(normalizeChapterStatus(event.target.value))}
            >
              {CHAPTER_STATUSES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Chapter summary"
          hint="Spoiler-light enough to show the party where they are."
        >
          <Textarea
            rows={4}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What this chapter is about and what the party is trying to do."
          />
        </Field>
      </form>
    </Modal>
  );
}
