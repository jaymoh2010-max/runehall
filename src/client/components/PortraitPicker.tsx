import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Crop, ImagePlus, RotateCcw, Trash2, Upload, UserRound } from "lucide-react";
import { uploadImage } from "../api";
import { errorMessage } from "../stores";
import { BUILTIN_PORTRAITS, type BuiltinPortrait } from "../../shared/portraits";
import { Button, Modal, Select } from "./ui";
import { clampPortraitOffset, portraitDrawRect, type PortraitOffset } from "../portraitCrop";

const CROP_SIZE = 320;
const EXPORT_SIZE = 512;

export function PortraitPicker({
  open,
  onClose,
  name,
  value,
  campaignId,
  onSelect,
  title = "Choose a portrait",
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  value?: string | null;
  campaignId?: string | null;
  onSelect: (url: string | null) => Promise<void> | void;
  title?: string;
}) {
  const [tab, setTab] = useState<"library" | "crop">("library");
  const [ancestry, setAncestry] = useState("all");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<PortraitOffset>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const clearUpload = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setSourceUrl(null);
    setSourceName("");
    setImage(null);
  }, []);

  useEffect(() => {
    if (open) return;
    setTab("library");
    setAncestry("all");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
    setBusy(false);
    dragRef.current = null;
    clearUpload();
  }, [open, clearUpload]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  useEffect(() => {
    if (!sourceUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setImage(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => {
      if (!cancelled) setError("That image could not be read. Try another file.");
    };
    img.src = sourceUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    context.fillStyle = "#0b1017";
    context.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
    if (!image) return;
    const rect = portraitDrawRect(image.naturalWidth, image.naturalHeight, CROP_SIZE, zoom, offset);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }, [image, zoom, offset]);

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, WebP, GIF, or AVIF image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Keep the image under 15 MB.");
      return;
    }
    clearUpload();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setSourceUrl(url);
    setSourceName(file.name);
    setTab("crop");
    setError("");
  };

  const choose = async (portrait: BuiltinPortrait) => {
    setBusy(true);
    setError("");
    try {
      await onSelect(portrait.url);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await onSelect(null);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const updateOffset = (next: PortraitOffset) => {
    if (!image) return;
    setOffset(clampPortraitOffset(image.naturalWidth, image.naturalHeight, CROP_SIZE, zoom, next));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateOffset({
      x: drag.offsetX + event.clientX - drag.startX,
      y: drag.offsetY + event.clientY - drag.startY,
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const changeZoom = (next: number) => {
    if (!image) {
      setZoom(next);
      return;
    }
    const clamped = clampPortraitOffset(
      image.naturalWidth,
      image.naturalHeight,
      CROP_SIZE,
      next,
      offset
    );
    setZoom(next);
    setOffset(clamped);
  };

  const exportCrop = async () => {
    if (!image) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not crop that portrait.");
      const scale = EXPORT_SIZE / CROP_SIZE;
      const rect = portraitDrawRect(
        image.naturalWidth,
        image.naturalHeight,
        CROP_SIZE,
        zoom,
        offset
      );
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        rect.x * scale,
        rect.y * scale,
        rect.width * scale,
        rect.height * scale
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9)
      );
      if (!blob) throw new Error("Could not crop that portrait.");
      const uploaded = await uploadImage(
        new File([blob], "portrait.webp", { type: "image/webp" }),
        campaignId
      );
      await onSelect(uploaded.url);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const visiblePortraits =
    ancestry === "all"
      ? BUILTIN_PORTRAITS
      : BUILTIN_PORTRAITS.filter((portrait) => portrait.ancestry === ancestry);

  const footer =
    tab === "crop" ? (
      <>
        <Button type="button" variant="ghost" onClick={() => setTab("library")}>
          Back to library
        </Button>
        <Button
          type="button"
          variant="primary"
          icon={<Crop size={15} />}
          loading={busy}
          disabled={!image}
          onClick={() => void exportCrop()}
        >
          Use this crop
        </Button>
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="ghost"
          icon={<Upload size={15} />}
          onClick={() => fileRef.current?.click()}
        >
          Upload & crop
        </Button>
        <div className="row" style={{ gap: 8 }}>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              icon={<Trash2 size={14} />}
              loading={busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`Choose a portrait for ${name || "this character"}, or upload an image and crop it to a square.`}
      wide
      footer={footer}
    >
      <div className="portrait-picker">
        <div className="portrait-picker-tabs">
          <button
            type="button"
            className={tab === "library" ? "is-active" : ""}
            onClick={() => setTab("library")}
          >
            <UserRound size={14} /> Portrait library
          </button>
          <button
            type="button"
            className={tab === "crop" ? "is-active" : ""}
            onClick={() => {
              setTab("crop");
              if (!image) fileRef.current?.click();
            }}
          >
            <Crop size={14} /> Upload & crop
          </button>
        </div>
        {error ? <div className="auth-error">{error}</div> : null}
        {tab === "library" ? (
          <>
            <div className="portrait-picker-toolbar">
              <span className="tiny muted">
                {visiblePortraits.length} painted portraits. Click one to use it.
              </span>
              <Select
                aria-label="Filter portraits by ancestry"
                value={ancestry}
                onChange={(event) => setAncestry(event.target.value)}
              >
                <option value="all">All ancestries</option>
                <option value="Human">Human</option>
                <option value="Elf">Elf</option>
                <option value="Dwarf">Dwarf</option>
                <option value="Orc">Orc</option>
              </Select>
            </div>
            <div className="portrait-library-grid">
              {visiblePortraits.map((portrait) => (
                <button
                  key={portrait.id}
                  type="button"
                  className={`portrait-library-card ${value === portrait.url ? "is-selected" : ""}`}
                  title={`${portrait.credit} · ${portrait.license}`}
                  disabled={busy}
                  onClick={() => void choose(portrait)}
                >
                  <img src={portrait.url} alt="" decoding="async" />
                  <span>
                    <strong>{portrait.name}</strong>
                    <small>
                      {portrait.ancestry} · {portrait.tags[0]}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <p className="portrait-picker-credit">
              Portraits by Joseph Hewitt (CC BY 4.0) and Justin Nichol / Flare (CC BY 3.0 and CC
              BY-SA 3.0). See <code>public/portraits/ATTRIBUTION.md</code>.
            </p>
          </>
        ) : (
          <div className="portrait-crop-layout">
            <div className="portrait-crop-stage">
              <canvas
                ref={canvasRef}
                width={CROP_SIZE}
                height={CROP_SIZE}
                aria-label="Portrait crop preview. Drag to reposition."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              {!image ? (
                <div className="portrait-crop-empty">
                  <ImagePlus size={28} />
                  <strong>Choose an image to crop</strong>
                  <span className="tiny muted">PNG, JPG, WebP, GIF, or AVIF · up to 15 MB</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choose file
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="portrait-crop-controls">
              <label className="portrait-zoom">
                <span>
                  Zoom <strong>{zoom.toFixed(1)}×</strong>
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  disabled={!image}
                  onChange={(event) => changeZoom(Number(event.target.value))}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={13} />}
                disabled={!image}
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                Reset crop
              </Button>
              <p className="tiny muted">
                Drag the image to position it. The square preview is exactly what your table sees,
                and it is exported at 512 × 512.
              </p>
              {sourceName ? <p className="tiny muted">Selected: {sourceName}</p> : null}
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        onChange={(event) => {
          pickFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </Modal>
  );
}
