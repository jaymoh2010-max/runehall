import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { CompendiumEntry } from "../components/CompendiumDetail";
import { CompendiumDetail } from "../components/CompendiumDetail";
import { EmptyState, ErrorState, Spinner } from "../components/ui";
import {
  COMPENDIUM_KIND_LABELS,
  COMPENDIUM_KIND_PLURALS,
  compendiumKindFromId,
  isCompendiumEntryKind,
} from "../../shared/compendium";
import { api } from "../api";

export function CompendiumEntryPage() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const backTo = from && /^\/library(\?|$)/.test(from) ? from : "/library";
  const { kind: rawKind, id } = useParams<{ kind: string; id: string }>();
  const kind = isCompendiumEntryKind(rawKind) ? rawKind : null;
  const [entry, setEntry] = useState<CompendiumEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!kind || !id) {
      setLoading(false);
      setError("That compendium link is not valid.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setEntry(null);
    api<{ item: CompendiumEntry }>(`/api/compendium/entries/${encodeURIComponent(id)}`)
      .then((result) => {
        if (cancelled) return;
        const actualKind = compendiumKindFromId(result.item.id);
        if (actualKind && actualKind !== kind) {
          setError(
            `That entry belongs to ${COMPENDIUM_KIND_PLURALS[actualKind]}, not ${COMPENDIUM_KIND_PLURALS[kind]}.`
          );
          return;
        }
        setEntry(result.item);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load that entry.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  useEffect(() => {
    document.title = entry ? `${entry.name} · Runehall` : "Compendium · Runehall";
  }, [entry]);

  return (
    <div className="page library-page compendium-entry-page">
      <div className="page-head">
        <div>
          <Link to={backTo} className="back-link">
            <ArrowLeft size={14} /> Back to the library
          </Link>
          <h1>{entry?.name ?? (kind ? COMPENDIUM_KIND_LABELS[kind] : "Compendium entry")}</h1>
          <p className="sub">
            Full rules text, traits, and statistics from the local Pathfinder Second Edition
            compendium.
          </p>
        </div>
      </div>

      <div className="card library-detail compendium-entry-card">
        {loading ? <Spinner label="Opening the archive…" /> : null}
        {!loading && error ? <ErrorState message={error} /> : null}
        {!loading && !error && !entry ? (
          <EmptyState
            icon={<BookOpen size={28} />}
            title="Entry not found"
            description="The archive may have been regenerated since this link was saved."
          />
        ) : null}
        {!loading && !error && entry && kind ? (
          <CompendiumDetail kind={kind} entry={entry} />
        ) : null}
      </div>
    </div>
  );
}
