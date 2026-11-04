import type { ContentMode } from "../../../shared/types";
import { isCoreSource } from "../../../shared/content";
import { Tag, Toggle } from "../ui";

export function ContentSourceToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ContentMode;
  onChange: (mode: ContentMode) => void;
  disabled?: boolean;
}) {
  return (
    <Toggle
      checked={mode === "expanded"}
      onChange={(checked) => onChange(checked ? "expanded" : "core")}
      label="Expanded sources"
      disabled={disabled}
      title={disabled ? "Set by the campaign GM" : undefined}
    />
  );
}

export function ContentTierTag({
  source,
  kind = "character",
}: {
  source: string;
  kind?: "character" | "deity";
}) {
  return (
    <Tag tone={isCoreSource(source, kind) ? "gold" : "violet"}>
      {isCoreSource(source, kind) ? "Core" : "Expanded"}
    </Tag>
  );
}
