import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import type {
  AmbientLight,
  CharacterRecord,
  Monster,
  PartyVisionScope,
  Scene,
  Token,
} from "../../../shared/types";
import {
  BUILTIN_MAP_CATEGORIES,
  BUILTIN_MAPS,
  builtinMapCategoryLabel,
  builtinMapSquares,
  type BuiltinMap,
  type BuiltinMapCategory,
} from "../../../shared/builtinMaps";
import { AMBIENT_LIGHT_OPTIONS, PARTY_VISION_OPTIONS } from "../../../shared/lighting";
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
                    hpCurrent: character.summary?.currentHp ?? character.summary?.hp ?? null,
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
              <input
                className="token-color-input"
                type="color"
                value={customColor}
                aria-label="Token color"
                onChange={(event) => setCustomColor(event.target.value)}
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
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [selectedBuiltinId, setSelectedBuiltinId] = useState<string | null>(null);
  const [mapCategory, setMapCategory] = useState<"all" | BuiltinMapCategory>("all");
  const [dimensions, setDimensions] = useState({ width: 1600, height: 1000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedBuiltin = selectedBuiltinId
    ? (BUILTIN_MAPS.find((map) => map.id === selectedBuiltinId) ?? null)
    : null;
  const visibleBuiltinMaps =
    mapCategory === "all"
      ? BUILTIN_MAPS
      : BUILTIN_MAPS.filter((map) => map.category === mapCategory);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setName("");
      setActivateOnCreate(true);
      setFile(null);
      setUploadPreview(null);
      setSelectedBuiltinId(null);
      setMapCategory("all");
      setError("");
    }
  }, [open]);

  const selectBuiltin = (map: BuiltinMap | null) => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setFile(null);
    setUploadPreview(null);
    setSelectedBuiltinId(map?.id ?? null);
    if (!map) {
      setDimensions({ width: 1600, height: 1000 });
      setGridSize("70");
      return;
    }
    setDimensions({ width: map.width, height: map.height });
    setGridSize(String(map.gridSize));
    setName((current) => {
      const trimmed = current.trim();
      return !trimmed || BUILTIN_MAPS.some((entry) => entry.name === trimmed) ? map.name : current;
    });
  };

  const pickFile = (picked: File | null) => {
    setFile(picked);
    setSelectedBuiltinId(null);
    if (!picked) {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);
      return;
    }
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    const url = URL.createObjectURL(picked);
    setUploadPreview(url);
    const image = new Image();
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setGridSize(String(estimateGridSize(image.naturalWidth, image.naturalHeight)));
    };
    image.src = url;
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let imageUrl = selectedBuiltin?.imageUrl ?? null;
      let thumbnailUrl = selectedBuiltin?.thumbnailUrl ?? null;
      if (file) {
        const thumbnailFile = await createThumbnailFile(file);
        const uploaded = await uploadImage(file, campaignId);
        imageUrl = uploaded.url;
        thumbnailUrl = null;
        if (thumbnailFile) {
          const thumbnail = await uploadImage(thumbnailFile, campaignId);
          thumbnailUrl = thumbnail.url;
        }
      }
      const result = await api<{ scene: Scene }>(`/api/campaigns/${campaignId}/scenes`, {
        method: "POST",
        body: {
          name: name.trim() || selectedBuiltin?.name || "New Scene",
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
          <div className="map-library">
            <div className="row-between">
              <div>
                <strong>Map library</strong>
                <p className="tiny muted">Grid-aligned tactical maps. Click one to use it.</p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => selectBuiltin(null)}>
                Blank canvas
              </Button>
            </div>
            <div className="map-library-categories">
              {BUILTIN_MAP_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={mapCategory === category.id ? "is-active" : ""}
                  onClick={() => setMapCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="map-library-grid">
              {visibleBuiltinMaps.map((map) => {
                const squares = builtinMapSquares(map);
                const selected = map.id === selectedBuiltinId;
                return (
                  <button
                    key={map.id}
                    type="button"
                    className={`map-library-card ${selected ? "is-selected" : ""}`}
                    title={map.description}
                    onClick={() => selectBuiltin(selected ? null : map)}
                  >
                    <img src={map.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                    <span className="map-library-copy">
                      <strong>{map.name}</strong>
                      <span className="tiny muted">
                        {builtinMapCategoryLabel(map.category)} · {squares.cols}×{squares.rows}{" "}
                        squares
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="map-upload-zone compact" onClick={() => fileRef.current?.click()}>
            {uploadPreview ? (
              <img src={uploadPreview} alt="" />
            ) : (
              <>
                <ImagePlus size={24} />
                <strong>Upload a custom map</strong>
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
          {selectedBuiltin ? (
            <p className="tiny muted">
              Selected: <strong>{selectedBuiltin.name}</strong> — {selectedBuiltin.description}
            </p>
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
type CalibrationDrag = {
  /** Image-space position where the drag started. */
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Screen-space starting point, used to ignore accidental clicks. */
  clientX: number;
  clientY: number;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keep an offset centered around zero without changing which grid lines it describes. */
function normalizeGridOffset(value: number, gridSize: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize <= 0) return 0;
  const remainder = ((value % gridSize) + gridSize) % gridSize;
  const centered = remainder > gridSize / 2 ? remainder - gridSize : remainder;
  return Math.round(centered * 10) / 10;
}

/** Rough starting guess for a map; the GM can calibrate it precisely. */
function estimateGridSize(width: number, height: number): number {
  const ratio = width / Math.max(1, height);
  const estimate = ratio > 2.4 ? Math.round(height / 14) : Math.round(width / 24);
  return clampNumber(estimate, 20, 300);
}

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
  const [losEnabled, setLosEnabled] = useState(false);
  const [wallCollision, setWallCollision] = useState(false);
  const [ambientLight, setAmbientLight] = useState<AmbientLight>("bright");
  const [visionScope, setVisionScope] = useState<PartyVisionScope>("shared");
  const [propCollision, setPropCollision] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 1000 });
  const [calibration, setCalibration] = useState<CalibrationDrag | null>(null);
  const [calibrationSquares, setCalibrationSquares] = useState("4");
  const [scalePercent, setScalePercent] = useState("100");
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
    setLosEnabled(Boolean(scene.losEnabled));
    setWallCollision(Boolean(scene.wallCollision));
    setAmbientLight(scene.ambientLight ?? "bright");
    setVisionScope(scene.visionScope ?? "shared");
    setPropCollision(Boolean(scene.propCollision));
    setFile(null);
    setPreview(null);
    setDimensions({ width: scene.width, height: scene.height });
    setCalibration(null);
    setCalibrationSquares("4");
    setScalePercent("100");
    setError("");
  }, [scene, open]);

  if (!scene) return null;

  const pickFile = (picked: File | null) => {
    setFile(picked);
    setCalibration(null);
    if (!picked) return setPreview(null);
    const url = URL.createObjectURL(picked);
    setPreview(url);
    const image = new Image();
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setGridSize(String(estimateGridSize(image.naturalWidth, image.naturalHeight)));
      setOffsetX("0");
      setOffsetY("0");
    };
    image.src = url;
  };

  const calibrationPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clampNumber(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * dimensions.width,
        0,
        dimensions.width
      ),
      y: clampNumber(
        ((event.clientY - rect.top) / Math.max(1, rect.height)) * dimensions.height,
        0,
        dimensions.height
      ),
    };
  };

  const startCalibration = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const point = calibrationPoint(event);
    setCalibration({
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCalibration = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calibration) return;
    const point = calibrationPoint(event);
    setCalibration((current) => (current ? { ...current, x: point.x, y: point.y } : current));
  };

  const cancelCalibration = () => setCalibration(null);

  const finishCalibration = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calibration) return;
    const drag = calibration;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCalibration(null);
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 6) return;
    const squares = clampNumber(Math.round(Number(calibrationSquares) || 4), 1, 50);
    const end = calibrationPoint(event);
    const distance = Math.hypot(end.x - drag.startX, end.y - drag.startY);
    if (distance < 1) return;
    const nextGridSize = clampNumber(Math.round(distance / squares), 20, 300);
    setGridSize(String(nextGridSize));
    setOffsetX(String(normalizeGridOffset(drag.startX, nextGridSize)));
    setOffsetY(String(normalizeGridOffset(drag.startY, nextGridSize)));
    toast(
      `Calibrated ${nextGridSize}px grid from ${squares} square${squares === 1 ? "" : "s"}.`,
      "success"
    );
  };

  const applyScale = () => {
    const requested = clampNumber(Number(scalePercent) || 100, 10, 400) / 100;
    const currentGridSize = clampNumber(Number(gridSize) || scene.gridSize, 20, 300);
    const nextGridSize = clampNumber(Math.round(currentGridSize * requested), 20, 300);
    const factor = nextGridSize / currentGridSize;
    setCalibration(null);
    setScalePercent("100");
    if (Math.abs(factor - 1) < 0.001) return;
    setGridSize(String(nextGridSize));
    setDimensions((current) => ({
      width: clampNumber(Math.round(current.width * factor), 100, 10_000),
      height: clampNumber(Math.round(current.height * factor), 100, 10_000),
    }));
    setOffsetX((current) =>
      String(normalizeGridOffset((Number(current) || 0) * factor, nextGridSize))
    );
    setOffsetY((current) =>
      String(normalizeGridOffset((Number(current) || 0) * factor, nextGridSize))
    );
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
          losEnabled,
          wallCollision,
          ambientLight,
          visionScope,
          propCollision,
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
          <div className="grid-calibration-head">
            <strong>Grid calibration</strong>
            <label className="grid-calibration-squares">
              <span className="tiny muted">Squares in drag</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={calibrationSquares}
                onChange={(event) => setCalibrationSquares(event.target.value)}
                aria-label="Squares in calibration drag"
              />
            </label>
          </div>
          <div
            className={`grid-calibration-canvas ${calibration ? "is-calibrating" : ""}`}
            style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
            onPointerDown={startCalibration}
            onPointerMove={moveCalibration}
            onPointerUp={finishCalibration}
            onPointerCancel={cancelCalibration}
            aria-label="Grid calibration preview. Drag across map squares to set grid size and offset."
            title="Drag across map squares to calibrate the grid."
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
            {calibration ? (
              <>
                <svg
                  className="grid-calibration-drag"
                  viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <line
                    x1={calibration.startX}
                    y1={calibration.startY}
                    x2={calibration.x}
                    y2={calibration.y}
                    stroke="#e5ca91"
                    strokeWidth={2}
                    strokeDasharray="7 5"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span
                  className="grid-calibration-point"
                  style={{
                    left: `${(calibration.startX / dimensions.width) * 100}%`,
                    top: `${(calibration.startY / dimensions.height) * 100}%`,
                  }}
                />
                <span
                  className="grid-calibration-point"
                  style={{
                    left: `${(calibration.x / dimensions.width) * 100}%`,
                    top: `${(calibration.y / dimensions.height) * 100}%`,
                  }}
                />
              </>
            ) : null}
          </div>
          <p className="tiny muted">
            Drag across {calibrationSquares || "4"} squares, starting on a grid intersection, to set
            the grid size and offsets. Fine-tune with the numeric fields below.
          </p>
        </div>
        <div className="form-grid">
          <Field label="Grid size (px)" hint="One square is 5 feet.">
            <Input
              type="number"
              value={gridSize}
              min={20}
              max={300}
              aria-label="Grid size in pixels"
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
          <Field
            label="Line-of-sight fog"
            hint="Players see from character tokens using each token's vision radius (default 60 ft). Walls and closed doors block sight."
          >
            <Toggle
              checked={losEnabled}
              onChange={setLosEnabled}
              label={losEnabled ? "Dynamic" : "Manual reveal"}
            />
          </Field>
          <Field
            label="Wall collision"
            hint="On: walls and closed doors block token movement. Open doors still pass."
          >
            <Toggle
              checked={wallCollision}
              onChange={setWallCollision}
              label={wallCollision ? "Walls block" : "Off"}
            />
          </Field>
          <Field label="Ambient light" hint="Used by token light sources and vision senses.">
            <Select
              value={ambientLight}
              onChange={(event) => setAmbientLight(event.target.value as AmbientLight)}
            >
              {AMBIENT_LIGHT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Vision scope"
            hint="Shared lets the party see through any friendly token. Per-player uses each player's own tokens."
          >
            <Select
              value={visionScope}
              onChange={(event) => setVisionScope(event.target.value as PartyVisionScope)}
            >
              {PARTY_VISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Prop collision"
            hint="On: every prop blocks token movement. Off: props are purely decorative."
          >
            <Toggle
              checked={propCollision}
              onChange={setPropCollision}
              label={propCollision ? "All props block" : "Off"}
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
          <Field
            label="Scale map (%)"
            hint="Resizes canvas, grid, and offsets together. Placed tokens keep their positions."
          >
            <div className="row" style={{ gap: 6 }}>
              <Input
                type="number"
                min={10}
                max={400}
                step={5}
                value={scalePercent}
                aria-label="Scale map percent"
                onChange={(event) => setScalePercent(event.target.value)}
              />
              <Button type="button" variant="ghost" onClick={applyScale}>
                Apply
              </Button>
            </div>
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
