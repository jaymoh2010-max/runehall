import {
  BookOpen,
  BrickWall,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Grid3X3,
  Keyboard,
  Layers,
  Map,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Ruler,
  Users,
  X,
} from "lucide-react";
import type { PresenceUser, WallKind } from "../../../shared/types";
import { TEMPLATE_LABELS, TEMPLATE_SIZES, type TemplateKind } from "../../../shared/templates";
import { Avatar, Button, IconButton, Select } from "../ui";

export function VttToolbar({
  isGm,
  activeSceneName,
  onPreviousScene,
  onNextScene,
  setSceneManagerOpen,
  fogBrush,
  setFogBrush,
  brushSize,
  setBrushSize,
  measureMode,
  setMeasureMode,
  wallMode,
  setWallMode,
  wallKind,
  setWallKind,
  onClearWalls,
  propMode,
  setPropMode,
  setAddTokenOpen,
  bestiaryOpen,
  setBestiaryOpen,
  templateKind,
  setTemplateKind,
  templateSize,
  setTemplateSize,
  hasTemplate,
  onClearTemplate,
  connectionStatus,
  presence,
  leftOpen,
  setLeftOpen,
  rightOpen,
  setRightOpen,
  expanded,
  toggleFullscreen,
  toast,
}: {
  isGm: boolean;
  activeSceneName: string;
  onPreviousScene?: () => void;
  onNextScene?: () => void;
  setSceneManagerOpen: (open: boolean) => void;
  fogBrush: "reveal" | "hide" | null;
  setFogBrush: (
    brush:
      "reveal" | "hide" | null | ((current: "reveal" | "hide" | null) => "reveal" | "hide" | null)
  ) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  measureMode: boolean;
  setMeasureMode: (value: boolean | ((current: boolean) => boolean)) => void;
  wallMode: boolean;
  setWallMode: (value: boolean) => void;
  wallKind: WallKind;
  setWallKind: (kind: WallKind) => void;
  onClearWalls: () => void;
  propMode: boolean;
  setPropMode: (value: boolean) => void;
  setAddTokenOpen: (open: boolean) => void;
  bestiaryOpen: boolean;
  setBestiaryOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  templateKind: TemplateKind | null;
  setTemplateKind: (kind: TemplateKind | null) => void;
  templateSize: number;
  setTemplateSize: (size: number) => void;
  hasTemplate: boolean;
  onClearTemplate: () => void;
  connectionStatus: "connecting" | "online" | "offline";
  presence: PresenceUser[];
  leftOpen: boolean;
  setLeftOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  rightOpen: boolean;
  setRightOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  expanded: boolean;
  toggleFullscreen: () => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  return (
    <div className="vtt-toolbar">
      <div className="vtt-toolbar-left">
        {isGm ? (
          <>
            <IconButton
              label="Previous scene"
              onClick={onPreviousScene}
              disabled={!onPreviousScene}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <IconButton label="Next scene" onClick={onNextScene} disabled={!onNextScene}>
              <ChevronRight size={14} />
            </IconButton>
            <Button
              size="sm"
              variant="ghost"
              icon={<Grid3X3 size={14} />}
              onClick={() => setSceneManagerOpen(true)}
            >
              Scenes
            </Button>
          </>
        ) : (
          <div className="vtt-scene-label">
            <Map size={14} /> {activeSceneName}
          </div>
        )}
        {isGm ? (
          <>
            <div className="toolbar-sep" />
            <Button
              size="sm"
              variant="ghost"
              className={fogBrush === "reveal" ? "is-active" : ""}
              icon={<Eye size={14} />}
              onClick={() => setFogBrush((current) => (current === "reveal" ? null : "reveal"))}
              title="Reveal fog (R)"
            >
              Reveal
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={fogBrush === "hide" ? "is-active" : ""}
              icon={<EyeOff size={14} />}
              onClick={() => setFogBrush((current) => (current === "hide" ? null : "hide"))}
              title="Hide fog (H)"
            >
              Hide
            </Button>
            <Select
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="brush-select"
              aria-label="Fog brush size"
              title="Fog brush size"
            >
              <option value={1}>1×1</option>
              <option value={3}>3×3</option>
              <option value={5}>5×5</option>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className={wallMode ? "is-active" : ""}
              icon={<BrickWall size={14} />}
              onClick={() => setWallMode(!wallMode)}
              title="Draw walls and doors (W)"
            >
              Walls
            </Button>
            {wallMode ? (
              <>
                <Select
                  value={wallKind}
                  onChange={(event) => setWallKind(event.target.value as WallKind)}
                  className="brush-select"
                  aria-label="Wall or door"
                  title="Wall or door"
                >
                  <option value="wall">Wall</option>
                  <option value="door">Door</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} />}
                  onClick={onClearWalls}
                  title="Remove all walls and doors"
                >
                  Clear
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className={propMode ? "is-active" : ""}
              icon={<Layers size={14} />}
              onClick={() => setPropMode(!propMode)}
              title="Place scene props (G)"
            >
              Props
            </Button>
            <div className="toolbar-sep" />
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setAddTokenOpen(true)}
              title="Add token (T)"
            >
              Token
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={bestiaryOpen ? "is-active" : ""}
              icon={<BookOpen size={14} />}
              onClick={() => setBestiaryOpen((current) => !current)}
              title="Open the bestiary palette"
            >
              Bestiary
            </Button>
            <Select
              value={templateKind ?? ""}
              onChange={(event) =>
                setTemplateKind((event.target.value || null) as TemplateKind | null)
              }
              className="template-select"
              aria-label="Area template"
              title="Area template"
            >
              <option value="">Template</option>
              {(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {TEMPLATE_LABELS[kind]}
                </option>
              ))}
            </Select>
            {templateKind ? (
              <Select
                value={templateSize}
                onChange={(event) => setTemplateSize(Number(event.target.value))}
                className="brush-select"
                aria-label="Template size"
                title="Template size"
              >
                {TEMPLATE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} ft.
                  </option>
                ))}
              </Select>
            ) : null}
            {hasTemplate ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<X size={14} />}
                onClick={onClearTemplate}
                title="Clear area template"
              >
                Clear
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={measureMode ? "is-active" : ""}
          icon={<Ruler size={14} />}
          onClick={() => {
            setMeasureMode((current) => !current);
            setFogBrush(null);
          }}
          title="Measure distance (M)"
        >
          Measure
        </Button>
      </div>
      <div className="vtt-toolbar-right">
        <span
          className={`vtt-connection is-${connectionStatus}`}
          title={
            connectionStatus === "online"
              ? "Live table connection"
              : connectionStatus === "connecting"
                ? "Reconnecting to the live table…"
                : "Offline. Changes made in another tab will sync when the connection returns."
          }
        >
          <span className="vtt-connection-dot" />
          {connectionStatus === "online"
            ? "Live"
            : connectionStatus === "connecting"
              ? "Reconnecting…"
              : "Offline"}
        </span>
        <div className="vtt-presence">
          {presence.slice(0, 6).map((person) => (
            <span
              key={person.socketId}
              className="vtt-presence-user"
              title={`${person.displayName} · ${person.role === "gm" ? "GM" : "Player"}`}
            >
              <Avatar name={person.displayName} src={person.avatarUrl} size={26} />
              <span className={`presence-dot ${person.role}`} />
            </span>
          ))}
          {presence.length > 6 ? <span className="tiny muted">+{presence.length - 6}</span> : null}
        </div>
        <IconButton
          label={leftOpen ? "Hide token panel (P)" : "Show token panel (P)"}
          onClick={() => setLeftOpen((open) => !open)}
          className={leftOpen ? "is-active" : ""}
        >
          <Users size={16} />
        </IconButton>
        <IconButton
          label={rightOpen ? "Hide chat (C)" : "Show chat (C)"}
          onClick={() => setRightOpen((open) => !open)}
          className={rightOpen ? "is-active" : ""}
        >
          <MessageSquare size={16} />
        </IconButton>
        <IconButton
          label={expanded ? "Exit full screen (F)" : "Full screen (F)"}
          onClick={toggleFullscreen}
          className={expanded ? "is-active" : ""}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </IconButton>
        <IconButton
          label="Keyboard shortcuts"
          onClick={() =>
            toast(
              "Shortcuts: R reveal · H hide · M measure · W walls · G props · A area · T token · E edit · I initiative · ←/→ turn · F full screen · C chat · P party · Esc clear",
              "info"
            )
          }
        >
          <Keyboard size={16} />
        </IconButton>
      </div>
    </div>
  );
}
