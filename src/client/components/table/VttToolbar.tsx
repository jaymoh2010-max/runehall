import {
  BookOpen,
  Eye,
  EyeOff,
  Grid3X3,
  Keyboard,
  Map,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Ruler,
  Users,
} from "lucide-react";
import type { PresenceUser, Scene } from "../../../shared/types";
import { Avatar, Button, IconButton, Select } from "../ui";

export function VttToolbar({
  isGm,
  scenes,
  activeSceneId,
  activateScene,
  activeSceneName,
  setSceneManagerOpen,
  fogBrush,
  setFogBrush,
  brushSize,
  setBrushSize,
  measureMode,
  setMeasureMode,
  setAddTokenOpen,
  bestiaryOpen,
  setBestiaryOpen,
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
  scenes: Scene[];
  activeSceneId: string | null;
  activateScene: (sceneId: string) => void;
  activeSceneName: string;
  setSceneManagerOpen: (open: boolean) => void;
  fogBrush: "reveal" | "hide" | null;
  setFogBrush: (brush: "reveal" | "hide" | null | ((current: "reveal" | "hide" | null) => "reveal" | "hide" | null)) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  measureMode: boolean;
  setMeasureMode: (value: boolean | ((current: boolean) => boolean)) => void;
  setAddTokenOpen: (open: boolean) => void;
  bestiaryOpen: boolean;
  setBestiaryOpen: (open: boolean | ((current: boolean) => boolean)) => void;
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
            <Select value={activeSceneId ?? ""} onChange={(event) => activateScene(event.target.value)} className="scene-select">
              {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
            </Select>
            <Button size="sm" variant="ghost" icon={<Grid3X3 size={14} />} onClick={() => setSceneManagerOpen(true)}>Scenes</Button>
          </>
        ) : (
          <div className="vtt-scene-label"><Map size={14} /> {activeSceneName}</div>
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
            <Select value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="brush-select" title="Fog brush size">
              <option value={1}>1×1</option>
              <option value={3}>3×3</option>
              <option value={5}>5×5</option>
            </Select>
            <div className="toolbar-sep" />
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setAddTokenOpen(true)} title="Add token (T)">Token</Button>
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
          {connectionStatus === "online" ? "Live" : connectionStatus === "connecting" ? "Reconnecting…" : "Offline"}
        </span>
        <div className="vtt-presence">
          {presence.slice(0, 6).map((person) => (
            <span key={person.socketId} className="vtt-presence-user" title={`${person.displayName} · ${person.role === "gm" ? "GM" : "Player"}`}>
              <Avatar name={person.displayName} src={person.avatarUrl} size={26} />
              <span className={`presence-dot ${person.role}`} />
            </span>
          ))}
          {presence.length > 6 ? <span className="tiny muted">+{presence.length - 6}</span> : null}
        </div>
        <IconButton label={leftOpen ? "Hide token panel (P)" : "Show token panel (P)"} onClick={() => setLeftOpen((open) => !open)} className={leftOpen ? "is-active" : ""}>
          <Users size={16} />
        </IconButton>
        <IconButton label={rightOpen ? "Hide chat (C)" : "Show chat (C)"} onClick={() => setRightOpen((open) => !open)} className={rightOpen ? "is-active" : ""}>
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
              "Shortcuts: R reveal · H hide · M measure · T token · E edit · I initiative · ←/→ turn · F full screen · C chat · P party · Esc clear",
              "info",
            )
          }
        >
          <Keyboard size={16} />
        </IconButton>
      </div>
    </div>
  );
}
