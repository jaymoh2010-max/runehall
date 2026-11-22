import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Grid3X3,
  Map,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  Ruler,
  UserRound,
  Users,
} from "lucide-react";
import type { PresenceUser } from "../../../shared/types";
import { Avatar, Button, IconButton, Select } from "../ui";

export function CoreToolbar({
  isGm,
  activeSceneName,
  onPreviousScene,
  onNextScene,
  onOpenScenes,
  onAddToken,
  bestiaryOpen,
  onToggleBestiary,
  fogBrush,
  onFogBrush,
  brushSize,
  onBrushSize,
  measureMode,
  onMeasureMode,
  connectionStatus,
  presence,
  partyOpen,
  onPartyOpen,
  rightOpen,
  onRightOpen,
  expanded,
  onFullscreen,
  myCharacterId,
  onOpenMySheet,
}: {
  isGm: boolean;
  activeSceneName: string;
  onPreviousScene?: () => void;
  onNextScene?: () => void;
  onOpenScenes: () => void;
  onAddToken: () => void;
  bestiaryOpen: boolean;
  onToggleBestiary: () => void;
  fogBrush: "reveal" | "hide" | null;
  onFogBrush: (next: "reveal" | "hide" | null) => void;
  brushSize: number;
  onBrushSize: (size: number) => void;
  measureMode: boolean;
  onMeasureMode: (next: boolean) => void;
  connectionStatus: "connecting" | "online" | "offline";
  presence: PresenceUser[];
  partyOpen: boolean;
  onPartyOpen: (open: boolean) => void;
  rightOpen: boolean;
  onRightOpen: (open: boolean) => void;
  expanded: boolean;
  onFullscreen: () => void;
  myCharacterId: string | null;
  onOpenMySheet: () => void;
}) {
  return (
    <div className="vtt-toolbar core-toolbar">
      <div className="vtt-toolbar-left">
        <IconButton label="Previous scene" onClick={onPreviousScene} disabled={!onPreviousScene}>
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton label="Next scene" onClick={onNextScene} disabled={!onNextScene}>
          <ChevronRight size={14} />
        </IconButton>
        <div className="vtt-scene-label">
          <Map size={14} />
          <h2>{activeSceneName}</h2>
        </div>
        <Button size="sm" variant="ghost" icon={<Grid3X3 size={14} />} onClick={onOpenScenes}>
          Scenes
        </Button>
        {isGm ? (
          <>
            <div className="toolbar-sep" />
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={onAddToken}
              title="Place a token (T)"
            >
              Add token
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={bestiaryOpen ? "is-active" : ""}
              icon={<BookOpen size={14} />}
              onClick={onToggleBestiary}
              title="Open the bestiary"
            >
              Bestiary
            </Button>
          </>
        ) : null}
      </div>

      <div className="vtt-toolbar-center">
        {isGm ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className={fogBrush === "reveal" ? "is-active" : ""}
              icon={<Eye size={14} />}
              onClick={() => onFogBrush(fogBrush === "reveal" ? null : "reveal")}
              title="Reveal fog (R)"
            >
              Reveal
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={fogBrush === "hide" ? "is-active" : ""}
              icon={<EyeOff size={14} />}
              onClick={() => onFogBrush(fogBrush === "hide" ? null : "hide")}
              title="Hide fog (H)"
            >
              Hide
            </Button>
            <Select
              value={brushSize}
              onChange={(event) => onBrushSize(Number(event.target.value))}
              className="brush-select"
              aria-label="Fog brush size"
              title="Fog brush size"
            >
              <option value={1}>1×1</option>
              <option value={3}>3×3</option>
              <option value={5}>5×5</option>
            </Select>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={measureMode ? "is-active" : ""}
          icon={<Ruler size={14} />}
          onClick={() => onMeasureMode(!measureMode)}
          title="Measure distance (M)"
        >
          Measure
        </Button>
      </div>

      <div className="vtt-toolbar-right">
        <Button
          size="sm"
          variant="secondary"
          icon={<UserRound size={14} />}
          disabled={!myCharacterId}
          onClick={onOpenMySheet}
          title="Open your character sheet"
        >
          My sheet
        </Button>
        <div className="core-presence" aria-label="Players online">
          {presence.slice(0, 4).map((person) => (
            <Avatar key={person.userId} name={person.displayName} size={24} />
          ))}
          {presence.length > 4 ? <span className="avatar-more">+{presence.length - 4}</span> : null}
        </div>
        <span
          className={`core-connection is-${connectionStatus}`}
          title={`Live table: ${connectionStatus}`}
        >
          {connectionStatus === "online"
            ? "Live"
            : connectionStatus === "connecting"
              ? "Connecting"
              : "Offline"}
        </span>
        <IconButton
          label={partyOpen ? "Hide party" : "Show party"}
          onClick={() => onPartyOpen(!partyOpen)}
        >
          <Users size={14} />
        </IconButton>
        <IconButton
          label={rightOpen ? "Hide chat" : "Show chat"}
          onClick={() => onRightOpen(!rightOpen)}
        >
          <MessageSquare size={14} />
        </IconButton>
        <IconButton label={expanded ? "Exit full screen" : "Full screen"} onClick={onFullscreen}>
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </IconButton>
      </div>
    </div>
  );
}
