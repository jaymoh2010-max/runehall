import { useEffect, useState } from "react";
import { CircleAlert, Moon } from "lucide-react";
import type { CharacterDraft, DerivedCharacter } from "../../shared/types";
import { applyLongRest, type LongRestResult } from "../../shared/rest";
import { Button, Modal, Toggle } from "./ui";

interface LongRestModalProps {
  open: boolean;
  onClose: () => void;
  draft: CharacterDraft | null;
  derived: DerivedCharacter | null;
  preparedCaster: boolean;
  onRest: (result: LongRestResult) => void;
}

export function LongRestModal({
  open,
  onClose,
  draft,
  derived,
  preparedCaster,
  onRest,
}: LongRestModalProps) {
  const [rough, setRough] = useState(false);

  useEffect(() => {
    if (open) setRough(false);
  }, [open]);

  if (!draft || !derived) return null;
  const preview = applyLongRest(draft, derived, { rough, preparedCaster });
  const remainingAfflictions = preview.draft.play.afflictions;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take a long rest"
      subtitle="Eight hours of rest followed by daily preparations."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Moon size={14} />} onClick={() => onRest(preview)}>
            Take long rest
          </Button>
        </>
      }
    >
      <div className="stack">
        <ul className="rest-preview">
          <li>
            <span>Hit Points</span>
            <strong>
              {preview.summary.hpBefore} → {preview.summary.hpAfter}
              {preview.summary.healed > 0 ? ` (+${preview.summary.healed})` : " (already full)"}
            </strong>
          </li>
          {preview.summary.tempHpCleared > 0 ? (
            <li>
              <span>Temporary HP</span>
              <strong>{preview.summary.tempHpCleared} cleared</strong>
            </li>
          ) : null}
          {preview.summary.slotsRestored > 0 ? (
            <li>
              <span>Spell slots</span>
              <strong>{preview.summary.slotsRestored} restored</strong>
            </li>
          ) : null}
          {preview.summary.divineFontRestored > 0 ? (
            <li>
              <span>Divine font</span>
              <strong>{preview.summary.divineFontRestored} restored</strong>
            </li>
          ) : null}
          {preview.summary.focusMax > 0 ? (
            <li>
              <span>Focus points</span>
              <strong>
                {preview.summary.focusBefore} → {preview.summary.focusAfter}
              </strong>
            </li>
          ) : null}
          {preview.summary.removedConditions.length ? (
            <li>
              <span>Conditions ending</span>
              <strong>{preview.summary.removedConditions.join(", ")}</strong>
            </li>
          ) : null}
          {preview.summary.reducedConditions.length ? (
            <li>
              <span>Conditions reduced</span>
              <strong>
                {preview.summary.reducedConditions
                  .map((entry) => `${entry.name} ${entry.from} → ${entry.to}`)
                  .join(", ")}
              </strong>
            </li>
          ) : null}
          {preview.summary.afflictionsEnded.length ? (
            <li>
              <span>Afflictions ending</span>
              <strong>{preview.summary.afflictionsEnded.join(", ")}</strong>
            </li>
          ) : null}
          {preview.summary.shieldLowered ? (
            <li>
              <span>Stance</span>
              <strong>Shield lowered</strong>
            </li>
          ) : null}
        </ul>
        <Toggle
          checked={rough}
          onChange={setRough}
          label="Rough rest (half healing)"
          title="Use this when the night was uncomfortable, interrupted, or spent without shelter."
        />
        <p className="tiny muted">
          {preparedCaster
            ? "Prepared casters choose today's spells after the rest; their current prepared list stays selected as the starting point."
            : "Spell slots, focus points, and per-day item uses reset. Hero points and XP are unchanged."}{" "}
          Companion HP is not touched, and other conditions are left for the GM to adjudicate.
        </p>
        {draft.play.afflictions.length ? (
          <p className="tiny muted">
            {remainingAfflictions.length
              ? `Afflictions still active and due their own stage saves: ${remainingAfflictions
                  .map((entry) => entry.name)
                  .join(", ")}.`
              : "Every timed affliction ends with this rest."}
            {remainingAfflictions.length && preview.summary.afflictionsEnded.length
              ? ` Afflictions ending: ${preview.summary.afflictionsEnded.join(", ")}.`
              : ""}
          </p>
        ) : null}
        {preview.summary.hpBefore === 0 ? (
          <div className="settings-note">
            <CircleAlert size={16} />
            <span>
              This character is at 0 HP. The rest will heal them and clear dying or unconscious once
              they are above 0 HP.
            </span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
