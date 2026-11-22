import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, LockKeyhole, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  CampaignKnowledgeEntry,
  CampaignNotesView,
  CampaignPlayerNote,
} from "../../../shared/types";
import { api, formatDate } from "../../api";
import { errorMessage } from "../../stores";
import { JournalBody } from "../JournalBody";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageEyebrow,
  Tag,
  Textarea,
} from "../ui";

export function NotesTab({
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
  const [view, setView] = useState<CampaignNotesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteEditor, setNoteEditor] = useState<CampaignPlayerNote | "new" | null>(null);
  const [knowledgeEditor, setKnowledgeEditor] = useState<CampaignKnowledgeEntry | "new" | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<CampaignNotesView>(`/api/campaigns/${campaignId}/notes`)
      .then((result) => {
        if (!cancelled) {
          setView(result);
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

  const deleteNote = async (note: CampaignPlayerNote) => {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/campaigns/${campaignId}/notes/${note.id}`, { method: "DELETE" });
      setView((current) =>
        current
          ? { ...current, notes: current.notes.filter((entry) => entry.id !== note.id) }
          : current
      );
      toast("Private note deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deleteKnowledge = async (entry: CampaignKnowledgeEntry) => {
    if (!window.confirm(`Delete “${entry.title}” from campaign knowledge?`)) return;
    try {
      await api(`/api/campaigns/${campaignId}/knowledge/${entry.id}`, { method: "DELETE" });
      setView((current) =>
        current
          ? {
              ...current,
              knowledge: current.knowledge.filter((item) => item.id !== entry.id),
            }
          : current
      );
      toast("Knowledge entry deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (loading) return <p className="muted small">Opening your notes…</p>;
  if (error) return <div className="auth-error">{error}</div>;

  return (
    <div className="page-inner notes-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Session journal</PageEyebrow>
          <h2>Notes &amp; knowledge</h2>
          <p>
            Keep private session notes, and read the lore the GM has shared with the whole table.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setNoteEditor("new")}>
          New note
        </Button>
      </div>

      <div className="notes-layout">
        <Card className="notes-private">
          <div className="notes-card-head">
            <div>
              <PageEyebrow>Private</PageEyebrow>
              <h3>
                <LockKeyhole size={17} /> My notes
              </h3>
            </div>
            <Tag tone="violet">{view?.notes.length ?? 0}</Tag>
          </div>
          <p className="tiny muted">
            Only you can read these. Your GM, other players, and campaign exports never see them.
          </p>

          {view?.notes.length ? (
            <div className="notes-list">
              {view.notes.map((note) => (
                <article key={note.id} className="notes-item">
                  <div className="notes-item-head">
                    <div>
                      <h4>{note.title}</h4>
                      <p className="tiny muted">Updated {formatDate(note.updatedAt)}</p>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <IconButton label={`Edit ${note.title}`} onClick={() => setNoteEditor(note)}>
                        <Pencil size={13} />
                      </IconButton>
                      <IconButton
                        label={`Delete ${note.title}`}
                        onClick={() => void deleteNote(note)}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                  {note.content ? (
                    <p className="notes-excerpt">{note.content.slice(0, 220)}</p>
                  ) : (
                    <p className="tiny muted">Empty note</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<NotebookPen size={24} />}
              title="No private notes yet"
              description="Write down suspicions, clues, and plans for the next session."
            />
          )}
        </Card>

        <Card className="notes-knowledge">
          <div className="notes-card-head">
            <div>
              <PageEyebrow>Shared</PageEyebrow>
              <h3>
                <BookOpen size={17} /> Campaign knowledge
              </h3>
            </div>
            {isGm ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={() => setKnowledgeEditor("new")}
              >
                Add knowledge
              </Button>
            ) : null}
          </div>
          <p className="tiny muted">
            Lore, discoveries, and answers the party has earned. The GM controls what is shared.
          </p>

          {view?.knowledge.length ? (
            <div className="notes-list">
              {view.knowledge.map((entry) => (
                <article key={entry.id} className="notes-item">
                  <div className="notes-item-head">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <h4>{entry.title}</h4>
                      {isGm ? (
                        <Tag tone={entry.visible ? "green" : "gold"}>
                          {entry.visible ? "Shared" : "Hidden"}
                        </Tag>
                      ) : null}
                    </div>
                    {isGm ? (
                      <div className="row" style={{ gap: 4 }}>
                        <IconButton
                          label={`Edit ${entry.title}`}
                          onClick={() => setKnowledgeEditor(entry)}
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${entry.title}`}
                          onClick={() => void deleteKnowledge(entry)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                  {entry.content ? (
                    <JournalBody content={entry.content} className="journal-body notes-content" />
                  ) : (
                    <p className="tiny muted">No details recorded yet.</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<BookOpen size={24} />}
              title="Nothing shared yet"
              description="Shared lore and discoveries will appear here."
            />
          )}
        </Card>
      </div>

      <NoteEditor
        open={Boolean(noteEditor)}
        note={noteEditor}
        campaignId={campaignId}
        onClose={() => setNoteEditor(null)}
        onSaved={(note) => {
          setView((current) => {
            if (!current) return current;
            const exists = current.notes.some((entry) => entry.id === note.id);
            const notes = exists
              ? current.notes.map((entry) => (entry.id === note.id ? note : entry))
              : [note, ...current.notes];
            return { ...current, notes: notes.sort((a, b) => b.updatedAt - a.updatedAt) };
          });
          setNoteEditor(null);
          toast(noteEditor === "new" ? "Private note saved." : "Private note updated.", "success");
        }}
        onError={(message) => toast(message, "error")}
      />

      <KnowledgeEditor
        open={Boolean(knowledgeEditor)}
        entry={knowledgeEditor}
        campaignId={campaignId}
        onClose={() => setKnowledgeEditor(null)}
        onSaved={(entry) => {
          setView((current) => {
            if (!current) return current;
            const exists = current.knowledge.some((item) => item.id === entry.id);
            return {
              ...current,
              knowledge: exists
                ? current.knowledge.map((item) => (item.id === entry.id ? entry : item))
                : [...current.knowledge, entry],
            };
          });
          setKnowledgeEditor(null);
          toast(
            knowledgeEditor === "new" ? "Knowledge entry created." : "Knowledge entry saved.",
            "success"
          );
        }}
        onError={(message) => toast(message, "error")}
      />
    </div>
  );
}

function NoteEditor({
  open,
  note,
  campaignId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  note: CampaignPlayerNote | "new" | null;
  campaignId: string;
  onClose: () => void;
  onSaved: (note: CampaignPlayerNote) => void;
  onError: (message: string) => void;
}) {
  const editing = note && note !== "new" ? note : null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setContent(editing?.content ?? "");
    setError("");
  }, [open, editing?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { title: title.trim() || "Untitled note", content };
      const result = editing
        ? await api<{ note: CampaignPlayerNote }>(
            `/api/campaigns/${campaignId}/notes/${editing.id}`,
            { method: "PATCH", body: payload }
          )
        : await api<{ note: CampaignPlayerNote }>(`/api/campaigns/${campaignId}/notes`, {
            method: "POST",
            body: payload,
          });
      onSaved(result.note);
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
      title={editing ? `Edit ${editing.title}` : "New private note"}
      subtitle="Only you can read this note. It is never shared with the GM or exported."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save note" : "Create note"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Note title">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Session 4, the Ashen Vault…"
          />
        </Field>
        <Field label="Note" hint="Clues, suspicions, plans, and questions for next time.">
          <Textarea
            rows={12}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What do you want to remember?"
          />
        </Field>
      </form>
    </Modal>
  );
}

function KnowledgeEditor({
  open,
  entry,
  campaignId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  entry: CampaignKnowledgeEntry | "new" | null;
  campaignId: string;
  onClose: () => void;
  onSaved: (entry: CampaignKnowledgeEntry) => void;
  onError: (message: string) => void;
}) {
  const editing = entry && entry !== "new" ? entry : null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setContent(editing?.content ?? "");
    setVisible(Boolean(editing?.visible));
    setError("");
  }, [open, editing?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the knowledge entry a title.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = { title: title.trim(), content, visible };
      const result = editing
        ? await api<{ entry: CampaignKnowledgeEntry }>(
            `/api/campaigns/${campaignId}/knowledge/${editing.id}`,
            { method: "PATCH", body: payload }
          )
        : await api<{ entry: CampaignKnowledgeEntry }>(`/api/campaigns/${campaignId}/knowledge`, {
            method: "POST",
            body: payload,
          });
      onSaved(result.entry);
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
      title={editing ? `Edit ${editing.title}` : "New knowledge"}
      subtitle="Shared lore is visible to every member. Hidden lore stays GM-only."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save entry" : "Create entry"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="The Ashen Crown"
          />
        </Field>
        <Field label="Knowledge" hint="Markdown headings, bold text, and bullet lists work.">
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What the party has learned."
          />
        </Field>
        <Checkbox label="Show this knowledge to players" checked={visible} onChange={setVisible} />
      </form>
    </Modal>
  );
}
