import { Eraser, MousePointer2, Pencil, Trash2 } from "lucide-react";
import { DRAWING_COLORS, DRAWING_WIDTHS } from "../../../shared/drawings";
import { IconButton } from "../ui";

export type DrawingTool = "pen" | "eraser";

const COLOR_NAMES = ["amber", "ivory", "blue", "green", "rose", "violet"];

export function DrawingToolbar({
  isGm,
  tool,
  color,
  width,
  hasMine,
  hasAny,
  onTool,
  onColor,
  onWidth,
  onClearMine,
  onClearAll,
}: {
  isGm: boolean;
  tool: DrawingTool | null;
  color: string;
  width: number;
  hasMine: boolean;
  hasAny: boolean;
  onTool: (tool: DrawingTool | null) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onClearMine: () => void;
  onClearAll: () => void;
}) {
  return (
    <div
      className="scene-draw-tools"
      role="toolbar"
      aria-label="Drawing tools"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div className="scene-draw-group">
        <IconButton
          label="Select and pan"
          className={tool === null ? "is-active" : ""}
          aria-pressed={tool === null}
          onClick={() => onTool(null)}
        >
          <MousePointer2 size={15} />
        </IconButton>
        <IconButton
          label="Draw on the map (D)"
          className={tool === "pen" ? "is-active" : ""}
          aria-pressed={tool === "pen"}
          onClick={() => onTool(tool === "pen" ? null : "pen")}
        >
          <Pencil size={15} />
        </IconButton>
        <IconButton
          label="Erase drawings (E)"
          className={tool === "eraser" ? "is-active" : ""}
          aria-pressed={tool === "eraser"}
          onClick={() => onTool(tool === "eraser" ? null : "eraser")}
        >
          <Eraser size={15} />
        </IconButton>
      </div>

      {tool ? (
        <div className="scene-draw-settings">
          <div className="scene-draw-colors" role="group" aria-label="Drawing color">
            {DRAWING_COLORS.map((value, index) => (
              <button
                key={value}
                type="button"
                className={`scene-draw-color ${color === value ? "is-active" : ""}`}
                style={{ background: value }}
                aria-label={`${COLOR_NAMES[index] ?? "drawing"} color`}
                aria-pressed={color === value}
                onClick={() => onColor(value)}
              />
            ))}
          </div>
          <div className="scene-draw-widths" role="group" aria-label="Drawing width">
            {DRAWING_WIDTHS.map((value, index) => (
              <button
                key={value}
                type="button"
                className={`scene-draw-width ${width === value ? "is-active" : ""}`}
                aria-label={`Drawing width ${index + 1}`}
                aria-pressed={width === value}
                onClick={() => onWidth(value)}
              >
                <span style={{ width: value + 2, height: value + 2 }} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="scene-draw-actions">
        <IconButton label="Clear my drawings" disabled={!hasMine} onClick={onClearMine}>
          <Trash2 size={14} />
        </IconButton>
        {isGm ? (
          <IconButton
            label="GM: clear all drawings"
            className="scene-draw-clear-all"
            disabled={!hasAny}
            onClick={onClearAll}
          >
            <Trash2 size={14} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
