import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import type { CharacterDraft, RunesmithRune } from "../../../shared/types";
import {
  newRunesmithEtchedId,
  runesmithEtchedLimit,
  runesmithRepertoireLimit,
} from "../../../shared/runesmith";
import { Card, Field, Input, RichText, Select, Tag } from "../ui";

function defaultTarget(rune: RunesmithRune): string {
  const usage = rune.usage.toLowerCase();
  if (usage.includes("creature")) return "Self";
  if (usage.includes("weapon")) return "Weapon";
  if (usage.includes("armor")) return "Armor";
  if (usage.includes("shield")) return "Shield";
  if (usage.includes("square")) return "Square";
  return "";
}

export function RunesmithRunesCard({
  draft,
  update,
  runes,
}: {
  draft: CharacterDraft;
  update: (updater: (draft: CharacterDraft) => CharacterDraft) => void;
  runes: RunesmithRune[];
}) {
  const runeById = useMemo(() => new Map(runes.map((rune) => [rune.id, rune])), [runes]);
  const repertoireLimit = runesmithRepertoireLimit(draft.level);
  const etchedLimit = runesmithEtchedLimit(draft.level);
  const repertoire = draft.runesmith.repertoire
    .map((id) => runeById.get(id))
    .filter((rune): rune is RunesmithRune => Boolean(rune));
  const available = runes.filter(
    (rune) => rune.level <= draft.level && !draft.runesmith.repertoire.includes(rune.id)
  );
  const baseRunes = repertoire.filter((rune) => !rune.diacritic);
  const diacritics = repertoire.filter((rune) => rune.diacritic);

  const addRune = (runeId: string) =>
    update((current) => {
      if (
        !runeId ||
        current.runesmith.repertoire.includes(runeId) ||
        current.runesmith.repertoire.length >= runesmithRepertoireLimit(current.level)
      ) {
        return current;
      }
      return {
        ...current,
        runesmith: {
          ...current.runesmith,
          repertoire: [...current.runesmith.repertoire, runeId],
        },
      };
    });

  const removeRune = (runeId: string) =>
    update((current) => ({
      ...current,
      runesmith: {
        repertoire: current.runesmith.repertoire.filter((id) => id !== runeId),
        etched: current.runesmith.etched
          .filter((entry) => entry.runeId !== runeId)
          .map((entry) => (entry.diacriticId === runeId ? { ...entry, diacriticId: null } : entry)),
      },
    }));

  const addEtched = (runeId: string) =>
    update((current) => {
      const rune = runeById.get(runeId);
      if (
        !rune ||
        rune.diacritic ||
        current.runesmith.etched.length >= runesmithEtchedLimit(current.level)
      ) {
        return current;
      }
      return {
        ...current,
        runesmith: {
          ...current.runesmith,
          etched: [
            ...current.runesmith.etched,
            {
              id: newRunesmithEtchedId(),
              runeId,
              target: defaultTarget(rune),
              diacriticId: null,
            },
          ],
        },
      };
    });

  const updateEtched = (
    id: string,
    patch: Partial<{ target: string; diacriticId: string | null }>
  ) =>
    update((current) => ({
      ...current,
      runesmith: {
        ...current.runesmith,
        etched: current.runesmith.etched.map((entry) =>
          entry.id === id ? { ...entry, ...patch } : entry
        ),
      },
    }));

  const removeEtched = (id: string) =>
    update((current) => ({
      ...current,
      runesmith: {
        ...current.runesmith,
        etched: current.runesmith.etched.filter((entry) => entry.id !== id),
      },
    }));

  return (
    <Card className="runesmith-runes">
      <div className="row-between">
        <div>
          <h3>Runic repertoire</h3>
          <p className="muted small">
            Learn {repertoireLimit} runes at this level, then etch up to {etchedLimit} of them on
            creatures or objects. Etched runes last until invoked or replaced.
          </p>
        </div>
        <Tag tone={repertoire.length >= repertoireLimit ? "green" : "gold"}>
          {repertoire.length}/{repertoireLimit} known
        </Tag>
      </div>
      <div className="prepared-adder">
        <Select
          aria-label="Add rune to repertoire"
          value=""
          disabled={repertoire.length >= repertoireLimit}
          onChange={(event) => addRune(event.target.value)}
        >
          <option value="">Add a rune…</option>
          {available.map((rune) => (
            <option key={rune.id} value={rune.id}>
              {rune.name} (level {rune.level})
            </option>
          ))}
        </Select>
      </div>
      <div className="chip-row">
        {repertoire.map((rune) => (
          <Tag key={rune.id} tone={rune.diacritic ? "violet" : "gold"}>
            {rune.name}
            <button
              type="button"
              className="tag-remove"
              aria-label={`Remove ${rune.name} from repertoire`}
              onClick={() => removeRune(rune.id)}
            >
              ×
            </button>
          </Tag>
        ))}
        {!repertoire.length ? <span className="muted small">No runes known yet.</span> : null}
      </div>
      {!available.length && repertoire.length < repertoireLimit ? (
        <p className="tiny muted">No higher-level runes are available for this character yet.</p>
      ) : null}

      <div className="row-between" style={{ marginTop: 18 }}>
        <div>
          <h3>Etched runes</h3>
          <p className="muted small">
            Etching takes 10 minutes or happens during daily preparations. Invoking a rune removes
            it.
          </p>
        </div>
        <Tag tone={draft.runesmith.etched.length >= etchedLimit ? "red" : "blue"}>
          {draft.runesmith.etched.length}/{etchedLimit} etched
        </Tag>
      </div>
      <div className="prepared-adder">
        <Select
          aria-label="Etch a rune"
          value=""
          disabled={!baseRunes.length || draft.runesmith.etched.length >= etchedLimit}
          onChange={(event) => addEtched(event.target.value)}
        >
          <option value="">Etch a rune…</option>
          {baseRunes.map((rune) => (
            <option key={rune.id} value={rune.id}>
              {rune.name}
            </option>
          ))}
        </Select>
      </div>
      {draft.runesmith.etched.length ? (
        <div className="runesmith-etched-list">
          {draft.runesmith.etched.map((entry) => {
            const base = runeById.get(entry.runeId);
            const diacritic = entry.diacriticId ? runeById.get(entry.diacriticId) : null;
            return (
              <div className="runesmith-etched" key={entry.id}>
                <div className="row-between">
                  <div>
                    <strong>{base?.name ?? "Unknown rune"}</strong>
                    <span className="tiny muted"> {base ? `· level ${base.level}` : ""}</span>
                    {diacritic ? <span className="tiny"> · {diacritic.name}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${base?.name ?? "rune"} etching`}
                    onClick={() => removeEtched(entry.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="runesmith-etched-fields">
                  <Field label="Target">
                    <Input
                      value={entry.target}
                      onChange={(event) => updateEtched(entry.id, { target: event.target.value })}
                      placeholder="Self, ally, weapon, armor, shield, or object"
                    />
                  </Field>
                  <Field label="Diacritic">
                    <Select
                      aria-label={`Diacritic for ${base?.name ?? "etched rune"}`}
                      value={entry.diacriticId ?? ""}
                      disabled={!diacritics.length}
                      onChange={(event) =>
                        updateEtched(entry.id, { diacriticId: event.target.value || null })
                      }
                    >
                      <option value="">No diacritic</option>
                      {diacritics.map((rune) => (
                        <option key={rune.id} value={rune.id}>
                          {rune.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {base ? (
                  <details className="runesmith-rune-text">
                    <summary>Rune text</summary>
                    <RichText html={base.description} />
                    {base.invocation ? (
                      <>
                        <h4>Invocation</h4>
                        <RichText html={base.invocation} />
                      </>
                    ) : null}
                    {diacritic ? (
                      <>
                        <h4>{diacritic.name}</h4>
                        <RichText html={diacritic.description} />
                        {diacritic.invocation ? <RichText html={diacritic.invocation} /> : null}
                      </>
                    ) : null}
                    {base.heightening ? <RichText html={base.heightening} /> : null}
                    {base.special ? (
                      <>
                        <h4>Special</h4>
                        <RichText html={base.special} />
                      </>
                    ) : null}
                    {diacritic?.special ? (
                      <>
                        <h4>Special</h4>
                        <RichText html={diacritic.special} />
                      </>
                    ) : null}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted small">No runes etched yet.</p>
      )}
      {!baseRunes.length && repertoire.length ? (
        <p className="tiny muted">
          Add a base rune to the repertoire before etching. Diacritics must be attached to a base
          rune.
        </p>
      ) : null}
      <p className="tiny muted">
        Runes use your runesmith class DC. Invocation needs a clear voice and the rune within 30
        feet. Diacritics modify a base rune and count as part of it.
      </p>
    </Card>
  );
}
