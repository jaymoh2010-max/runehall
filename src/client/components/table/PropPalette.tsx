import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Layers, Trash2, Upload, X } from "lucide-react";
import type { Scene, SceneProp, ScenePropLayer } from "../../../shared/types";
import {
  BUILTIN_PROP_CATEGORIES,
  BUILTIN_PROPS,
  builtinPropCategoryLabel,
  type BuiltinPropCategory,
} from "../../../shared/builtinProps";
import type { PropPreset } from "../../../shared/props";
import { uploadImage } from "../../api";
import { errorMessage } from "../../stores";
import { Button, Field, IconButton, Input, Select, Toggle } from "../ui";

export function PropPalette({
  scene,
  campaignId,
  selectedPropId,
  pendingProp,
  layer,
  setLayer,
  onSetCollision,
  onPick,
  onSelect,
  onUpdate,
  onDelete,
  onClose,
  toast,
}: {
  scene: Scene;
  campaignId: string;
  selectedPropId: string | null;
  pendingProp: PropPreset | null;
  layer: ScenePropLayer;
  setLayer: (layer: ScenePropLayer) => void;
  onSetCollision: (enabled: boolean) => void;
  onPick: (preset: PropPreset) => void;
  onSelect: (propId: string | null) => void;
  onUpdate: (propId: string, patch: Partial<SceneProp>) => void;
  onDelete: (propId: string) => void;
  onClose: () => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [category, setCategory] = useState<"all" | BuiltinPropCategory>("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [width, setWidth] = useState("64");
  const [height, setHeight] = useState("64");
  const [rotation, setRotation] = useState("0");
  const fileRef = useRef<HTMLInputElement>(null);
  const props = scene.props ?? [];
  const selectedProp = selectedPropId
    ? (props.find((prop) => prop.id === selectedPropId) ?? null)
    : null;
  const visibleBuiltinProps =
    category === "all" ? BUILTIN_PROPS : BUILTIN_PROPS.filter((prop) => prop.category === category);

  useEffect(() => {
    if (!selectedProp) return;
    setWidth(String(selectedProp.width));
    setHeight(String(selectedProp.height));
    setRotation(String(selectedProp.rotation));
  }, [selectedProp?.id, selectedProp?.width, selectedProp?.height, selectedProp?.rotation]);

  const commitSize = () => {
    if (!selectedProp) return;
    onUpdate(selectedProp.id, {
      width: Math.max(8, Math.min(2000, Math.round(Number(width) || selectedProp.width))),
      height: Math.max(8, Math.min(2000, Math.round(Number(height) || selectedProp.height))),
      rotation: Math.round(Number(rotation) || 0),
    });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadImage(file, campaignId);
      onPick({
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Custom prop",
        imageUrl: result.url,
        squaresW: 2,
        squaresH: 2,
      });
      toast("Prop uploaded. Click the map to place it.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="vtt-prop-palette">
      <div className="vtt-bestiary-head">
        <div>
          <span className="tiny muted">Scene decoration</span>
          <h3>
            <Layers size={14} /> Props
          </h3>
        </div>
        <IconButton label="Close props" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <Field label="Place on layer">
        <Select value={layer} onChange={(event) => setLayer(event.target.value as ScenePropLayer)}>
          <option value="ground">Ground — under tokens</option>
          <option value="overhead">Overhead — above tokens</option>
        </Select>
      </Field>
      <Field
        label="Prop collision"
        hint="On: every prop blocks token movement. Off: props are purely decorative."
      >
        <Toggle
          checked={scene.propCollision}
          onChange={onSetCollision}
          label={scene.propCollision ? "All props block" : "Off"}
        />
      </Field>

      <div className="prop-category-row">
        {BUILTIN_PROP_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={category === entry.id ? "is-active" : ""}
            onClick={() => setCategory(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="prop-library-grid">
        {visibleBuiltinProps.map((prop) => {
          const picked = pendingProp?.imageUrl === prop.imageUrl;
          return (
            <button
              key={prop.id}
              type="button"
              className={`prop-library-card ${picked ? "is-picked" : ""}`}
              title={prop.description}
              onClick={() =>
                onPick({
                  name: prop.name,
                  imageUrl: prop.imageUrl,
                  squaresW: prop.squaresW,
                  squaresH: prop.squaresH,
                })
              }
            >
              <img src={prop.imageUrl} alt="" loading="lazy" decoding="async" />
              <span>{prop.name}</span>
              <span className="tiny muted">
                {builtinPropCategoryLabel(prop.category)} · {prop.squaresW}×{prop.squaresH}
              </span>
            </button>
          );
        })}
      </div>

      <div className="prop-upload-row">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(event) => void upload(event)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Upload size={13} />}
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          Upload prop
        </Button>
        <span className="tiny muted">Custom images use a 2×2 default footprint.</span>
      </div>
      {error ? <div className="auth-error">{error}</div> : null}

      {pendingProp ? (
        <p className="prop-placement-hint">
          Click the map to place <strong>{pendingProp.name}</strong>.
        </p>
      ) : null}

      <div className="prop-placed-head">
        <strong>Placed props</strong>
        <span className="tiny muted">{props.length}</span>
      </div>
      <div className="prop-placed-list">
        {props.map((prop) => (
          <button
            key={prop.id}
            type="button"
            className={`prop-placed-row ${prop.id === selectedPropId ? "is-selected" : ""}`}
            onClick={() => onSelect(prop.id)}
          >
            <img src={prop.imageUrl} alt="" loading="lazy" decoding="async" />
            <span className="grow">
              <strong>{prop.name}</strong>
              <span className="tiny muted">
                {prop.layer === "overhead" ? "Overhead" : "Ground"}
                {prop.visible ? "" : " · hidden"}
                {prop.locked ? " · locked" : ""}
              </span>
            </span>
          </button>
        ))}
        {!props.length ? <p className="muted small">No props placed on this scene yet.</p> : null}
      </div>

      {selectedProp ? (
        <div className="prop-editor">
          <div className="row-between">
            <strong>{selectedProp.name}</strong>
            <Button
              type="button"
              size="sm"
              variant="danger"
              icon={<Trash2 size={12} />}
              onClick={() => {
                if (window.confirm(`Delete “${selectedProp.name}”?`)) onDelete(selectedProp.id);
              }}
            >
              Delete
            </Button>
          </div>
          <div className="form-grid two">
            <Field label="Width (px)">
              <Input
                type="number"
                min={8}
                max={2000}
                value={width}
                onChange={(event) => setWidth(event.target.value)}
                onBlur={commitSize}
              />
            </Field>
            <Field label="Height (px)">
              <Input
                type="number"
                min={8}
                max={2000}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                onBlur={commitSize}
              />
            </Field>
            <Field label="Rotation">
              <Input
                type="number"
                min={0}
                max={359}
                value={rotation}
                onChange={(event) => setRotation(event.target.value)}
                onBlur={commitSize}
              />
            </Field>
            <Field label="Layer">
              <Select
                value={selectedProp.layer}
                onChange={(event) =>
                  onUpdate(selectedProp.id, {
                    layer: event.target.value as ScenePropLayer,
                  })
                }
              >
                <option value="ground">Ground</option>
                <option value="overhead">Overhead</option>
              </Select>
            </Field>
          </div>
          <div className="token-toggles">
            <Toggle
              checked={selectedProp.visible}
              onChange={(visible) => onUpdate(selectedProp.id, { visible })}
              label="Visible to players"
            />
            <Toggle
              checked={selectedProp.locked}
              onChange={(locked) => onUpdate(selectedProp.id, { locked })}
              label="Locked in place"
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
