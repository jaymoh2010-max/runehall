import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  GripVertical,
  ImagePlus,
  Map,
  Plus,
  Search,
  Shield,
  Swords,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { CharacterRecord, Monster, Scene, Token } from "../../../shared/types";
import { stripHtml } from "../../../shared/compendium";
import { HoverCard } from "../HoverCard";
import { api, uploadImage } from "../../api";
import { createThumbnailFile } from "../../thumbnail";
import { errorMessage } from "../../stores";
import { useToasts } from "../../stores";
import {
  Avatar,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  RarityTag,
  RichText,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
  Toggle,
} from "../ui";

// ---------------------------------------------------------------------------
// Add token
// ---------------------------------------------------------------------------
export function AddTokenModal({
  open,
  onClose,
  characters,
  onCreate,
  onCreateMany,
  defaultPosition,
  gridSize = 70,
}: {
  open: boolean;
  onClose: () => void;
  characters: CharacterRecord[];
  onCreate: (token: Partial<Token>) => void;
  onCreateMany?: (tokens: Partial<Token>[]) => void;
  defaultPosition: { x: number; y: number };
  gridSize?: number;
}) {
  const [tab, setTab] = useState<"party" | "monster" | "custom">("party");
  const [monsterQuery, setMonsterQuery] = useState("");
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterCount, setMonsterCount] = useState("1");
  const [monsterLoading, setMonsterLoading] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHp, setCustomHp] = useState("10");
  const [customAc, setCustomAc] = useState("15");
  const [customSize, setCustomSize] = useState("1");
  const [customColor, setCustomColor] = useState("#c8a96b");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(characters.length ? "party" : "monster");
    setMonsterQuery("");
    setSelectedMonster(null);
    setMonsterCount("1");
    setError("");
  }, [open, characters.length]);

  useEffect(() => {
    if (!open || tab !== "monster") return;
    let cancelled = false;
    const controller = new AbortController();
    setMonsterLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ items: Monster[] }>(
          `/api/compendium/monsters?q=${encodeURIComponent(monsterQuery)}&limit=40`,
          { signal: controller.signal }
        );
        if (cancelled) return;
        setMonsters(result.items);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        setError(errorMessage(err));
      } finally {
        if (!cancelled) setMonsterLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, tab, monsterQuery]);

  const custom = () => {
    const hp = Number(customHp) || 0;
    const ac = Number(customAc) || 0;
    if (!customName.trim()) {
      setError("Give the token a name.");
      return;
    }
    onCreate({
      name: customName.trim(),
      x: defaultPosition.x,
      y: defaultPosition.y,
      size: Number(customSize) || 1,
      color: customColor,
      hpCurrent: hp || null,
      hpMax: hp || null,
      ac: ac || null,
      conditions: [],
      hidden: false,
      locked: false,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a token"
      subtitle="Place a party member, a monster, or a custom marker."
      wide
    >
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={tab === "party" ? "is-active" : ""}
          onClick={() => setTab("party")}
        >
          <Users size={13} /> Party
        </button>
        <button
          type="button"
          className={tab === "monster" ? "is-active" : ""}
          onClick={() => setTab("monster")}
        >
          <Swords size={13} /> Bestiary
        </button>
        <button
          type="button"
          className={tab === "custom" ? "is-active" : ""}
          onClick={() => setTab("custom")}
        >
          <Plus size={13} /> Custom
        </button>
      </div>
      {error ? (
        <div className="auth-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {tab === "party" ? (
        <div className="token-add-list">
          {characters.map((character) => (
            <div key={character.id} className="token-add-row">
              <Avatar name={character.name} src={character.summary?.portraitUrl} size={42} />
              <div className="grow">
                <strong>{character.name}</strong>
                <p className="tiny muted">
                  {character.summary
                    ? `Level ${character.summary.level} ${character.summary.className} · ${character.summary.hp} HP · AC ${character.summary.ac}`
                    : "Unfinished character"}
                  {character.ownerName ? ` · ${character.ownerName}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={13} />}
                onClick={() => {
                  onCreate({
                    name: character.name,
                    characterId: character.id,
                    ownerId: character.userId,
                    imageUrl: character.summary?.portraitUrl ?? null,
                    x: defaultPosition.x,
                    y: defaultPosition.y,
                    size: 1,
                    color: "#c8a96b",
                    hpCurrent: character.summary?.hp ?? null,
                    hpMax: character.summary?.hp ?? null,
                    ac: character.summary?.ac ?? null,
                    conditions: [],
                    hidden: false,
                    locked: false,
                  });
                  onClose();
                }}
              >
                Place
              </Button>
            </div>
          ))}
          {!characters.length ? (
            <p className="muted small">
              No characters in this campaign yet. Create one from the Party tab.
            </p>
          ) : null}
        </div>
      ) : tab === "monster" ? (
        <div className="token-monster-layout">
          <div className="token-monster-list">
            <div className="search-box">
              <Search size={15} />
              <Input
                autoFocus
                value={monsterQuery}
                onChange={(event) => setMonsterQuery(event.target.value)}
                placeholder="Search the bestiary…"
              />
            </div>
            <div className="token-monster-results">
              {monsterLoading ? <Spinner label="Searching…" /> : null}
              {monsters.map((monster) => (
                <HoverCard
                  key={monster.id}
                  title={monster.name}
                  subtitle={`Level ${monster.level} · ${monster.source}`}
                  meta={
                    <span>
                      {monster.hp} HP · AC {monster.ac} · {monster.size}
                    </span>
                  }
                  body={stripHtml(monster.description || monster.blurb, 220) || undefined}
                >
                  <button
                    type="button"
                    className={`picker-item ${selectedMonster?.id === monster.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedMonster(monster)}
                  >
                    <div className="picker-item-main">
                      <span className="picker-item-name">{monster.name}</span>
                      <span className="picker-item-sub">
                        Level {monster.level} · {monster.hp} HP · AC {monster.ac}
                      </span>
                    </div>
                    {monster.rarity !== "common" ? <RarityTag rarity={monster.rarity} /> : null}
                  </button>
                </HoverCard>
              ))}
              {!monsterLoading && !monsters.length ? (
                <p className="muted small">No creatures match that search.</p>
              ) : null}
            </div>
          </div>
          <div className="token-monster-detail">
            {selectedMonster ? (
              <>
                <div className="row-between">
                  <div>
                    <h3>{selectedMonster.name}</h3>
                    <p className="tiny muted">
                      Level {selectedMonster.level} · {selectedMonster.source}
                    </p>
                  </div>
                  <RarityTag rarity={selectedMonster.rarity} />
                </div>
                <div className="chip-row" style={{ marginTop: 9 }}>
                  {selectedMonster.traits.map((trait) => (
                    <Tag key={trait}>{trait}</Tag>
                  ))}
                </div>
                <div className="spell-meta-grid" style={{ marginTop: 12 }}>
                  <div>
                    <span>HP</span>
                    <strong>{selectedMonster.hp}</strong>
                  </div>
                  <div>
                    <span>AC</span>
                    <strong>{selectedMonster.ac}</strong>
                  </div>
                  <div>
                    <span>Fort</span>
                    <strong>{selectedMonster.fortitude}</strong>
                  </div>
                  <div>
                    <span>Ref</span>
                    <strong>{selectedMonster.reflex}</strong>
                  </div>
                  <div>
                    <span>Will</span>
                    <strong>{selectedMonster.will}</strong>
                  </div>
                  <div>
                    <span>Perception</span>
                    <strong>{selectedMonster.perception}</strong>
                  </div>
                </div>
                <RichText
                  html={selectedMonster.description || selectedMonster.blurb}
                  className="monster-blurb"
                />
                <div className="token-monster-add">
                  <Field label="Count" hint="Groups move and roll initiative together.">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={monsterCount}
                      onChange={(event) => setMonsterCount(event.target.value)}
                    />
                  </Field>
                  <Button
                    variant="primary"
                    icon={<Plus size={15} />}
                    onClick={() => {
                      const count = Math.max(1, Math.min(20, Number(monsterCount) || 1));
                      const groupId =
                        count > 1
                          ? `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
                          : null;
                      const columns = Math.ceil(Math.sqrt(count));
                      const rows = Math.ceil(count / columns);
                      const spacing = Math.max(40, gridSize);
                      const partials = Array.from({ length: count }, (_, index) => {
                        const column = index % columns;
                        const row = Math.floor(index / columns);
                        return {
                          name:
                            count > 1
                              ? `${selectedMonster.name} ${index + 1}`.slice(0, 80)
                              : selectedMonster.name,
                          x: defaultPosition.x + (column - (columns - 1) / 2) * spacing,
                          y: defaultPosition.y + (row - (rows - 1) / 2) * spacing,
                          size: selectedMonster.sizeCells,
                          color: "#b06767",
                          hpCurrent: selectedMonster.hp,
                          hpMax: selectedMonster.hp,
                          ac: selectedMonster.ac,
                          initiativeBonus: selectedMonster.perception,
                          groupId,
                          groupName: groupId ? selectedMonster.name : null,
                          conditions: [],
                          hidden: false,
                          locked: false,
                        };
                      });
                      if (count > 1 && onCreateMany) onCreateMany(partials);
                      else onCreate(partials[0]);
                      onClose();
                    }}
                  >
                    Add{" "}
                    {Number(monsterCount) > 1
                      ? `${Math.max(1, Math.min(20, Number(monsterCount) || 1))} × ${selectedMonster.name}`
                      : selectedMonster.name}
                  </Button>
                </div>
              </>
            ) : (
              <div className="picker-detail-empty">
                <Swords size={26} />
                <p>Select a creature to inspect its stats.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="stack">
          <Field label="Token name">
            <Input
              autoFocus
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="e.g. Strange Statue"
            />
          </Field>
          <div className="form-grid">
            <Field label="Hit points">
              <Input
                type="number"
                value={customHp}
                onChange={(event) => setCustomHp(event.target.value)}
              />
            </Field>
            <Field label="Armor class">
              <Input
                type="number"
                value={customAc}
                onChange={(event) => setCustomAc(event.target.value)}
              />
            </Field>
            <Field label="Size">
              <Select value={customSize} onChange={(event) => setCustomSize(event.target.value)}>
                <option value="1">1 square (Medium)</option>
                <option value="2">2 squares (Large)</option>
                <option value="3">3 squares (Huge)</option>
                <option value="4">4 squares (Gargantuan)</option>
              </Select>
            </Field>
            <Field label="Color">
              <Input
                type="color"
                value={customColor}
                onChange={(event) => setCustomColor(event.target.value)}
                style={{ padding: 4, height: 42 }}
              />
            </Field>
          </div>
          <Button variant="primary" icon={<Plus size={15} />} onClick={custom}>
            Place token
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Scene manager
// ---------------------------------------------------------------------------
export function SceneManagerModal({
  open,
  onClose,
  campaignId,
  scenes,
  activeSceneId,
  previewSceneId,
  onActivate,
  onDelete,
  onDuplicate,
  onReorder,
  onPreview,
  onCreated,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  scenes: Scene[];
  activeSceneId: string | null;
  previewSceneId: string | null;
  onActivate: (sceneId: string) => void;
  onDelete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
  onReorder: (sceneIds: string[]) => void;
  onPreview: (sceneId: string) => void;
  onCreated: (scene: Scene) => void;
  onEdit: (scene: Scene) => void;
}) {
  const toast = useToasts((state) => state.push);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [gridSize, setGridSize] = useState("70");
  const [activateOnCreate, setActivateOnCreate] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 1000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setName("");
      setActivateOnCreate(true);
      setFile(null);
      setPreview(null);
      setError("");
    }
  }, [open]);

  const pickFile = (picked: File | null) => {
    setFile(picked);
    if (!picked) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(picked);
    setPreview(url);
    const image = new Image();
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      const ratio = image.naturalWidth / image.naturalHeight;
      setGridSize(String(Math.max(20, Math.round(image.naturalWidth / 24))));
      if (ratio > 2.4) setGridSize(String(Math.max(20, Math.round(image.naturalHeight / 14))));
    };
    image.src = url;
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let imageUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      if (file) {
        const thumbnailFile = await createThumbnailFile(file);
        const uploaded = await uploadImage(file, campaignId);
        imageUrl = uploaded.url;
        if (thumbnailFile) {
          const thumbnail = await uploadImage(thumbnailFile, campaignId);
          thumbnailUrl = thumbnail.url;
        }
      }
      const result = await api<{ scene: Scene }>(`/api/campaigns/${campaignId}/scenes`, {
        method: "POST",
        body: {
          name: name.trim() || "New Scene",
          imageUrl,
          thumbnailUrl,
          width: dimensions.width,
          height: dimensions.height,
          gridSize: Number(gridSize) || 70,
          activate: activateOnCreate,
        },
      });
      onCreated(result.scene);
      onClose();
      toast("Scene created.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scenes"
      subtitle="Maps, grid settings, and the active scene."
      wide
    >
      {!creating ? (
        <>
          <div className="scene-manager-list">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={`scene-manager-row ${scene.id === activeSceneId ? "is-active" : ""} ${scene.id === draggingSceneId ? "is-dragging" : ""}`}
                draggable
                onDragStart={(event) => {
                  setDraggingSceneId(scene.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", scene.id);
                }}
                onDragOver={(event) => {
                  if (draggingSceneId && draggingSceneId !== scene.id) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggingSceneId || draggingSceneId === scene.id) return;
                  const ids = scenes.map((entry) => entry.id);
                  const from = ids.indexOf(draggingSceneId);
                  const to = ids.indexOf(scene.id);
                  if (from < 0 || to < 0) return;
                  const [moved] = ids.splice(from, 1);
                  ids.splice(to, 0, moved);
                  onReorder(ids);
                  setDraggingSceneId(null);
                }}
                onDragEnd={() => setDraggingSceneId(null)}
              >
                <span className="scene-drag-handle" title="Drag to reorder">
                  <GripVertical size={14} />
                </span>
                <div className="scene-manager-thumb">
                  {scene.thumbnailUrl || scene.imageUrl ? (
                    <img
                      src={scene.thumbnailUrl ?? scene.imageUrl ?? ""}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <Map size={20} />
                  )}
                </div>
                <div className="grow">
                  <div className="row" style={{ gap: 7 }}>
                    <strong>{scene.name}</strong>
                    {scene.id === activeSceneId ? <Badge tone="gold">Active</Badge> : null}
                    {scene.id === previewSceneId ? <Badge tone="blue">Previewing</Badge> : null}
                  </div>
                  <p className="tiny muted">
                    {scene.width} × {scene.height} · {scene.gridSize}px grid ·{" "}
                    {scene.fogEnabled ? "Fog on" : "Fog off"}
                  </p>
                </div>
                <div className="row" style={{ gap: 5 }}>
                  <IconButton
                    label="Move scene up"
                    disabled={index === 0}
                    onClick={() => {
                      if (index === 0) return;
                      const ids = scenes.map((entry) => entry.id);
                      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                      onReorder(ids);
                    }}
                  >
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton
                    label="Move scene down"
                    disabled={index === scenes.length - 1}
                    onClick={() => {
                      if (index >= scenes.length - 1) return;
                      const ids = scenes.map((entry) => entry.id);
                      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                      onReorder(ids);
                    }}
                  >
                    <ArrowDown size={13} />
                  </IconButton>
                  {scene.id !== activeSceneId ? (
                    <Button size="sm" onClick={() => onActivate(scene.id)}>
                      Activate
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye size={13} />}
                    onClick={() => onPreview(scene.id)}
                  >
                    Preview
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(scene)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDuplicate(scene.id)}>
                    Duplicate
                  </Button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Delete scene"
                    onClick={() => {
                      if (window.confirm(`Delete scene “${scene.name}” and all its tokens?`))
                        onDelete(scene.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {!scenes.length ? (
              <p className="muted small">No scenes yet. Create one to open the map.</p>
            ) : null}
          </div>
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => setCreating(true)}
            style={{ marginTop: 14 }}
          >
            New scene
          </Button>
        </>
      ) : (
        <form className="stack" onSubmit={create}>
          {error ? <div className="auth-error">{error}</div> : null}
          <Field label="Scene name">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. The Sunken Crypt"
            />
          </Field>
          <div className="map-upload-zone" onClick={() => fileRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <>
                <ImagePlus size={30} />
                <strong>Upload a map</strong>
                <span className="tiny muted">PNG, JPG, WebP, GIF, or AVIF · up to 15 MB</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </div>
          {file ? (
            <div className="row-between">
              <span className="tiny muted">
                {file.name} · {dimensions.width} × {dimensions.height}
              </span>
              <Button size="sm" type="button" variant="ghost" onClick={() => pickFile(null)}>
                Remove
              </Button>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="Grid size (px)" hint="Leave room for drag and measurement.">
              <Input
                type="number"
                value={gridSize}
                min={20}
                max={300}
                onChange={(event) => setGridSize(event.target.value)}
              />
            </Field>
            <Field label="Dimensions" hint="Auto-detected from the map; editable for alignment.">
              <div className="row" style={{ gap: 6 }}>
                <Input
                  type="number"
                  value={dimensions.width}
                  onChange={(event) =>
                    setDimensions((d) => ({ ...d, width: Number(event.target.value) || 1600 }))
                  }
                />
                <span className="muted">×</span>
                <Input
                  type="number"
                  value={dimensions.height}
                  onChange={(event) =>
                    setDimensions((d) => ({ ...d, height: Number(event.target.value) || 1000 }))
                  }
                />
              </div>
            </Field>
          </div>
          <Toggle
            checked={activateOnCreate}
            onChange={setActivateOnCreate}
            label="Activate this scene after creating it"
          />
          <div className="modal-foot" style={{ margin: "4px -22px -20px", paddingTop: 14 }}>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Back
            </Button>
            <Button type="submit" variant="primary" loading={busy} icon={<Upload size={15} />}>
              Create scene
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Scene editor
// ---------------------------------------------------------------------------
export function SceneEditModal({
  open,
  onClose,
  scene,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  scene: Scene | null;
  onSave: (scene: Scene) => void;
  onDelete: (sceneId: string) => void;
}) {
  const toast = useToasts((state) => state.push);
  const [name, setName] = useState("");
  const [gridSize, setGridSize] = useState("70");
  const [offsetX, setOffsetX] = useState("0");
  const [offsetY, setOffsetY] = useState("0");
  const [fogEnabled, setFogEnabled] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 1000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!scene || !open) return;
    setName(scene.name);
    setGridSize(String(scene.gridSize));
    setOffsetX(String(scene.gridOffsetX));
    setOffsetY(String(scene.gridOffsetY));
    setFogEnabled(scene.fogEnabled);
    setFile(null);
    setPreview(null);
    setDimensions({ width: scene.width, height: scene.height });
    setError("");
  }, [scene, open]);

  if (!scene) return null;

  const pickFile = (picked: File | null) => {
    setFile(picked);
    if (!picked) return setPreview(null);
    const url = URL.createObjectURL(picked);
    setPreview(url);
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let imageUrl = scene.imageUrl;
      let thumbnailUrl = scene.thumbnailUrl;
      if (file) {
        const thumbnailFile = await createThumbnailFile(file);
        const uploaded = await uploadImage(file, scene.campaignId);
        imageUrl = uploaded.url;
        thumbnailUrl = null;
        if (thumbnailFile) {
          const thumbnail = await uploadImage(thumbnailFile, scene.campaignId);
          thumbnailUrl = thumbnail.url;
        }
      }
      const result = await api<{ scene: Scene }>(`/api/scenes/${scene.id}`, {
        method: "PATCH",
        body: {
          name: name.trim() || scene.name,
          gridSize: Number(gridSize) || scene.gridSize,
          gridOffsetX: Number(offsetX) || 0,
          gridOffsetY: Number(offsetY) || 0,
          fogEnabled,
          imageUrl,
          thumbnailUrl,
          width: dimensions.width,
          height: dimensions.height,
        },
      });
      onSave(result.scene);
      onClose();
      toast("Scene updated.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit “${scene.name}”`}
      subtitle="Grid alignment, fog, and map image."
      wide
    >
      <form className="stack" onSubmit={save}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Scene name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="map-upload-zone compact" onClick={() => fileRef.current?.click()}>
          {preview || scene.imageUrl ? (
            <img src={preview ?? scene.imageUrl ?? ""} alt="" />
          ) : (
            <>
              <ImagePlus size={24} />
              <span>Replace map</span>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="grid-calibration">
          <div
            className="grid-calibration-canvas"
            style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
          >
            {preview || scene.imageUrl ? (
              <img src={preview ?? scene.imageUrl ?? ""} alt="" />
            ) : (
              <div className="grid-calibration-blank" />
            )}
            <svg
              className="grid-calibration-lines"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {(() => {
                const grid = Math.max(20, Number(gridSize) || scene.gridSize);
                const ox = Number(offsetX) || 0;
                const oy = Number(offsetY) || 0;
                const vertical: number[] = [];
                const horizontal: number[] = [];
                for (let x = ox; x <= dimensions.width && vertical.length < 200; x += grid)
                  if (x >= 0) vertical.push(x);
                for (let y = oy; y <= dimensions.height && horizontal.length < 200; y += grid)
                  if (y >= 0) horizontal.push(y);
                return (
                  <>
                    {vertical.map((x) => (
                      <line
                        key={`v-${x}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={dimensions.height}
                        stroke="rgba(229,202,145,0.55)"
                        strokeWidth={Math.max(1, dimensions.width / 900)}
                      />
                    ))}
                    {horizontal.map((y) => (
                      <line
                        key={`h-${y}`}
                        x1={0}
                        y1={y}
                        x2={dimensions.width}
                        y2={y}
                        stroke="rgba(229,202,145,0.55)"
                        strokeWidth={Math.max(1, dimensions.height / 900)}
                      />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
          <p className="tiny muted">
            Live grid preview — adjust size and offsets to align with the map.
          </p>
        </div>
        <div className="form-grid">
          <Field label="Grid size (px)">
            <Input
              type="number"
              value={gridSize}
              min={20}
              max={300}
              onChange={(event) => setGridSize(event.target.value)}
            />
          </Field>
          <Field label="Fog of war">
            <Toggle
              checked={fogEnabled}
              onChange={setFogEnabled}
              label={fogEnabled ? "Enabled" : "Disabled"}
            />
          </Field>
          <Field label="Grid offset X">
            <Input
              type="number"
              value={offsetX}
              onChange={(event) => setOffsetX(event.target.value)}
            />
          </Field>
          <Field label="Grid offset Y">
            <Input
              type="number"
              value={offsetY}
              onChange={(event) => setOffsetY(event.target.value)}
            />
          </Field>
          <Field label="Width">
            <Input
              type="number"
              value={dimensions.width}
              onChange={(event) =>
                setDimensions((d) => ({ ...d, width: Number(event.target.value) || 1600 }))
              }
            />
          </Field>
          <Field label="Height">
            <Input
              type="number"
              value={dimensions.height}
              onChange={(event) =>
                setDimensions((d) => ({ ...d, height: Number(event.target.value) || 1000 }))
              }
            />
          </Field>
        </div>
        <div className="modal-foot" style={{ margin: "4px -22px -20px", paddingTop: 14 }}>
          <Button
            type="button"
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => {
              if (window.confirm(`Delete scene “${scene.name}”?`)) {
                onDelete(scene.id);
                onClose();
              }
            }}
          >
            Delete scene
          </Button>
          <span className="grow" />
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} icon={<Check size={15} />}>
            Save scene
          </Button>
        </div>
      </form>
    </Modal>
  );
}
