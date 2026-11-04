import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ImagePlus,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import type { CampaignNpc, Scene, Token } from "../../../shared/types";
import { api, uploadImage } from "../../api";
import { errorMessage } from "../../stores";
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
  Select,
  Spinner,
  Textarea,
} from "../ui";

export function NpcLibrary({
  campaignId,
  isGm,
  scenes,
  activeSceneId,
  onTokenCreated,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  scenes: Scene[];
  activeSceneId: string | null;
  onTokenCreated: (token: Token, sceneId: string) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [npcs, setNpcs] = useState<CampaignNpc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sceneId, setSceneId] = useState(activeSceneId ?? scenes[0]?.id ?? "");
  const [editor, setEditor] = useState<CampaignNpc | "new" | null>(null);

  useEffect(() => {
    if (!isGm) return;
    let cancelled = false;
    setLoading(true);
    api<{ npcs: CampaignNpc[] }>(`/api/campaigns/${campaignId}/npcs`)
      .then((result) => {
        if (!cancelled) setNpcs(result.npcs);
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
  }, [campaignId, isGm]);

  useEffect(() => {
    if (!sceneId && (activeSceneId || scenes[0]?.id)) {
      setSceneId(activeSceneId ?? scenes[0]?.id ?? "");
    }
  }, [activeSceneId, scenes, sceneId]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return npcs;
    return npcs.filter(
      (npc) =>
        npc.name.toLowerCase().includes(value) ||
        npc.description.toLowerCase().includes(value),
    );
  }, [npcs, query]);

  const replaceNpc = (npc: CampaignNpc) => {
    setNpcs((current) => {
      const exists = current.some((entry) => entry.id === npc.id);
      return exists
        ? current.map((entry) => (entry.id === npc.id ? npc : entry))
        : [...current, npc];
    });
  };

  const placeToken = async (npc: CampaignNpc) => {
    if (!sceneId) {
      toast("Create a scene before placing an NPC token.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ token: Token; sceneId: string }>(
        `/api/campaigns/${campaignId}/npcs/${npc.id}/token`,
        { method: "POST", body: { sceneId } },
      );
      onTokenCreated(result.token, result.sceneId);
      const sceneName = scenes.find((scene) => scene.id === result.sceneId)?.name ?? "the scene";
      toast(`${npc.name} placed on ${sceneName}.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteNpc = async (npc: CampaignNpc) => {
    if (!window.confirm(`Delete “${npc.name}” from the NPC library?`)) return;
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/npcs/${npc.id}`, { method: "DELETE" });
      setNpcs((current) => current.filter((entry) => entry.id !== npc.id));
      toast("NPC deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!isGm) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={<UserRound size={28} />}
          title="The GM's cast"
          description="NPC statblocks are only visible to the Game Master."
        />
      </div>
    );
  }

  return (
    <div className="page-inner npc-page">
      <div className="section-title">
        <div>
          <PageEyebrow>GM preparation</PageEyebrow>
          <h2>NPCs</h2>
          <p>Save recurring allies, villains, and monsters, then place their tokens on any scene.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditor("new")}>
          New NPC
        </Button>
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="npc-toolbar">
        <div className="search-box">
          <Search size={15} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search NPCs…"
          />
        </div>
        <Field label="Place tokens on">
          <Select value={sceneId} onChange={(event) => setSceneId(event.target.value)}>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>{scene.name}</option>
            ))}
          </Select>
        </Field>
        <Badge tone="violet">{filtered.length} saved</Badge>
      </div>

      {loading ? (
        <Spinner label="Opening the NPC library…" />
      ) : !npcs.length ? (
        <EmptyState
          icon={<UserRound size={30} />}
          title="No NPCs saved"
          description="Create a statblock for a recurring NPC, villain, or custom creature."
          action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditor("new")}>Create the first NPC</Button>}
        />
      ) : !filtered.length ? (
        <EmptyState icon={<Search size={28} />} title="No matches" description="Try a different name or description." />
      ) : (
        <div className="npc-grid">
          {filtered.map((npc) => (
            <Card key={npc.id} className="npc-card">
              <div className="npc-card-head">
                <Avatar name={npc.name} src={npc.imageUrl} size={48} />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 7 }}>
                    <h3>{npc.name}</h3>
                    <Badge tone="gold">Level {npc.level}</Badge>
                  </div>
                  <p className="tiny muted">
                    {npc.hp !== null ? `${npc.hp} HP` : "No HP"} · {npc.ac !== null ? `AC ${npc.ac}` : "No AC"}
                    {npc.perception !== null ? ` · Perception ${npc.perception}` : ""}
                  </p>
                </div>
              </div>
              {npc.description ? <p className="npc-description">{npc.description}</p> : null}
              <div className="npc-card-actions">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<MapPin size={13} />}
                  loading={busy}
                  disabled={!scenes.length}
                  onClick={() => void placeToken(npc)}
                >
                  Place token
                </Button>
                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditor(npc)}>
                  Edit
                </Button>
                <IconButton label={`Delete ${npc.name}`} onClick={() => void deleteNpc(npc)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NpcEditor
        open={Boolean(editor)}
        npc={editor}
        campaignId={campaignId}
        onClose={() => setEditor(null)}
        onSaved={(npc) => {
          replaceNpc(npc);
          setEditor(null);
          toast(editor === "new" ? "NPC created." : "NPC saved.", "success");
        }}
        onError={(message) => toast(message, "error")}
      />
    </div>
  );
}

function NpcEditor({
  open,
  npc,
  campaignId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  npc: CampaignNpc | "new" | null;
  campaignId: string;
  onClose: () => void;
  onSaved: (npc: CampaignNpc) => void;
  onError: (message: string) => void;
}) {
  const editing = npc && npc !== "new" ? npc : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("1");
  const [hp, setHp] = useState("");
  const [ac, setAc] = useState("");
  const [perception, setPerception] = useState("");
  const [size, setSize] = useState("1");
  const [color, setColor] = useState("#b06767");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setLevel(String(editing?.level ?? 1));
    setHp(editing?.hp === null || editing?.hp === undefined ? "" : String(editing.hp));
    setAc(editing?.ac === null || editing?.ac === undefined ? "" : String(editing.ac));
    setPerception(
      editing?.perception === null || editing?.perception === undefined
        ? ""
        : String(editing.perception),
    );
    setSize(String(editing?.size ?? 1));
    setColor(editing?.color ?? "#b06767");
    setImageUrl(editing?.imageUrl ?? null);
    setDescription(editing?.description ?? "");
    setError("");
  }, [open, editing?.id]);

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const result = await uploadImage(file, campaignId);
      setImageUrl(result.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the NPC a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        level: Number(level) || 1,
        hp: hp === "" ? null : Number(hp),
        ac: ac === "" ? null : Number(ac),
        perception: perception === "" ? null : Number(perception),
        size: Number(size) || 1,
        color,
        imageUrl,
        description,
      };
      const result = editing
        ? await api<{ npc: CampaignNpc }>(`/api/campaigns/${campaignId}/npcs/${editing.id}`, {
            method: "PATCH",
            body: payload,
          })
        : await api<{ npc: CampaignNpc }>(`/api/campaigns/${campaignId}/npcs`, {
            method: "POST",
            body: payload,
          });
      onSaved(result.npc);
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
      title={editing ? `Edit ${editing.name}` : "New NPC"}
      subtitle="A saved statblock with token art and combat basics."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save NPC" : "Create NPC"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="npc-editor-layout">
          <div className="npc-editor-art">
            <div className="npc-editor-preview">
              {imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" /> : <span>{(name || "NPC").slice(0, 2).toUpperCase()}</span>}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={14} />}
              loading={uploading}
              onClick={() => fileRef.current?.click()}
              block
            >
              Upload art
            </Button>
            {imageUrl ? (
              <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)} block>
                Use initials
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <p className="tiny muted">Token art is optional. Initials are used when no image is set.</p>
          </div>
          <div className="npc-editor-fields">
            <Field label="Name">
              <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Ferryman" />
            </Field>
            <div className="form-grid three">
              <Field label="Level">
                <Input type="number" min={-1} max={30} value={level} onChange={(event) => setLevel(event.target.value)} />
              </Field>
              <Field label="HP">
                <Input type="number" min={0} value={hp} onChange={(event) => setHp(event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="AC">
                <Input type="number" value={ac} onChange={(event) => setAc(event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Perception">
                <Input type="number" value={perception} onChange={(event) => setPerception(event.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Size">
                <Select value={size} onChange={(event) => setSize(event.target.value)}>
                  <option value="1">Medium</option>
                  <option value="2">Large</option>
                  <option value="3">Huge</option>
                  <option value="4">Gargantuan</option>
                </Select>
              </Field>
              <Field label="Token color">
                <input className="token-color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              </Field>
            </div>
            <Field label="Statblock notes" hint="Attacks, abilities, tactics, or reminders.">
              <Textarea
                rows={8}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={"Melee: +12 to hit, 2d8+5 slashing\nReaction: Parry\nTactics: Opens with Intimidation, then targets the healer."}
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
