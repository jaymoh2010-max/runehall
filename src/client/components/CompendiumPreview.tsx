import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COMPENDIUM_KIND_LABELS,
  compendiumEntryPath,
  compendiumKindFromId,
  isCompendiumEntryKind,
  type CompendiumEntryKind,
} from "../../shared/compendium";
import { api } from "../api";
import { errorMessage } from "../stores";
import { CompendiumDetail, type CompendiumEntry } from "./CompendiumDetail";
import { Button, ErrorState, Modal, Spinner } from "./ui";

export interface CompendiumPreviewTarget {
  kind: CompendiumEntryKind;
  id: string;
  path: string;
}

type PreviewState = {
  id: string;
  status: "loading" | "ready" | "error";
  entry: CompendiumEntry | null;
  error: string;
};

// The compendium is static between server starts, so entries can be reused
// when a player opens the same feat, item, or spell more than once.
const previewCache = new Map<string, CompendiumEntry>();

const KIND_ALIASES: Record<string, CompendiumEntryKind> = {
  // Older sheet links use /library/item/:id while the compendium calls the
  // category "equipment".
  item: "equipment",
};

export function parseCompendiumPreviewHref(
  href: string | null | undefined
): CompendiumPreviewTarget | null {
  if (!href) return null;
  const match = /^(?:[a-z][a-z\d+.-]*:\/\/[^/]+)?\/library\/([^/?#]+)\/([^/?#]+)\/?$/i.exec(
    href.trim()
  );
  if (!match) return null;

  try {
    const kindSegment = decodeURIComponent(match[1]);
    const id = decodeURIComponent(match[2]);
    const kind =
      KIND_ALIASES[kindSegment] ?? (isCompendiumEntryKind(kindSegment) ? kindSegment : null);
    if (!kind) return null;
    const idKind = compendiumKindFromId(id);
    if (idKind && idKind !== kind) return null;
    return { kind, id, path: compendiumEntryPath(kind, id) };
  } catch {
    return null;
  }
}

function initialState(target: CompendiumPreviewTarget | null): PreviewState | null {
  if (!target) return null;
  const cached = previewCache.get(target.id);
  return cached
    ? { id: target.id, status: "ready", entry: cached, error: "" }
    : { id: target.id, status: "loading", entry: null, error: "" };
}

export function CompendiumPreviewModal({
  href,
  onClose,
  elevated = false,
}: {
  href: string | null;
  onClose: () => void;
  elevated?: boolean;
}) {
  const target = useMemo(() => parseCompendiumPreviewHref(href), [href]);
  const [state, setState] = useState<PreviewState | null>(() => initialState(target));
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!target) return;
    const cached = previewCache.get(target.id);
    if (cached) {
      setState({ id: target.id, status: "ready", entry: cached, error: "" });
      return;
    }

    let cancelled = false;
    setState({ id: target.id, status: "loading", entry: null, error: "" });
    api<{ item: CompendiumEntry }>(`/api/compendium/entries/${encodeURIComponent(target.id)}`)
      .then((result) => {
        if (cancelled) return;
        previewCache.set(target.id, result.item);
        setState({ id: target.id, status: "ready", entry: result.item, error: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ id: target.id, status: "error", entry: null, error: errorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [target, retryToken]);

  if (!target) return null;

  const view = state?.id === target.id ? state : null;
  const loading = !view || view.status === "loading";
  const error = view?.status === "error" ? view.error : "";
  const entry = view?.status === "ready" ? view.entry : null;
  const kindLabel = COMPENDIUM_KIND_LABELS[target.kind];

  return (
    <Modal
      open
      onClose={onClose}
      title={kindLabel}
      subtitle="Rules reference"
      wide
      elevated={elevated}
      footer={
        <>
          <Link className="btn btn-ghost btn-sm" to={target.path} onClick={onClose}>
            Open full page
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {loading ? <Spinner label={`Opening the ${kindLabel.toLowerCase()}…`} /> : null}
      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />
      ) : null}
      {!loading && entry ? (
        <div className="compendium-preview">
          <CompendiumDetail kind={target.kind} entry={entry} />
        </div>
      ) : null}
    </Modal>
  );
}
