import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  COMPENDIUM_KIND_LABELS,
  compendiumEntryPath,
  type CompendiumSearchItem,
  type CompendiumSearchResponse,
} from "../../shared/compendium";
import { api } from "../api";

const EMPTY_RESPONSE: CompendiumSearchResponse = { items: [], total: 0, counts: {} };

export function GlobalSearch() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompendiumSearchResponse>(EMPTY_RESPONSE);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target
        ? target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        : false;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
        return;
      }
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setLoading(false);
      setError("");
      setResult(EMPTY_RESPONSE);
      return;
    }

    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await api<CompendiumSearchResponse>(
          `/api/compendium/search?q=${encodeURIComponent(trimmed)}&limit=60`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setResult(response);
        setActive(0);
      } catch (err) {
        if (controller.signal.aborted || (err as { name?: string }).name === "AbortError") return;
        setError("Could not reach the compendium. Try again.");
        setResult(EMPTY_RESPONSE);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const goTo = (item: CompendiumSearchItem) => {
    navigate(compendiumEntryPath(item.kind, item.id));
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (result.items.length ? (current + 1) % result.items.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        result.items.length ? (current - 1 + result.items.length) % result.items.length : 0
      );
      return;
    }
    if (event.key === "Enter" && result.items[active]) {
      event.preventDefault();
      goTo(result.items[active]);
    }
  };

  const showPanel = open && query.trim().length > 0;
  const activeItem = result.items[active];
  const kindCount = Object.keys(result.counts).length;

  return (
    <div className="global-search" ref={rootRef}>
      <div className={`global-search-field ${showPanel ? "is-open" : ""}`}>
        <Search size={15} className="global-search-icon" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search the compendium…"
          aria-label="Search the Pathfinder compendium"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-activedescendant={activeItem ? `global-search-${activeItem.id}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="global-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setError("");
              setResult(EMPTY_RESPONSE);
              inputRef.current?.focus();
            }}
          >
            <X size={13} />
          </button>
        ) : (
          <kbd className="global-search-kbd">Ctrl K</kbd>
        )}
      </div>

      {showPanel ? (
        <div className="global-search-panel">
          <div className="global-search-panel-head">
            <span>
              {error
                ? "Search unavailable"
                : loading
                  ? "Searching the archive…"
                  : query.trim().length < 2
                    ? "Type at least two letters"
                    : result.total
                      ? `${result.total.toLocaleString()} matches in ${kindCount} ${kindCount === 1 ? "category" : "categories"}`
                      : "No matches"}
            </span>
            {loading ? <Loader2 size={13} className="spin" /> : null}
          </div>

          <div id="global-search-results" className="global-search-results" role="listbox">
            {result.items.map((item, index) => (
              <button
                key={item.id}
                id={`global-search-${item.id}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`global-search-result ${index === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => goTo(item)}
              >
                <span className="global-search-result-main">
                  <span className="global-search-result-name">{item.name}</span>
                  <span className="global-search-result-meta">
                    {COMPENDIUM_KIND_LABELS[item.kind]}
                    {item.level === null
                      ? ""
                      : item.kind === "spell"
                        ? item.level === 0
                          ? " · cantrip"
                          : item.ritual
                            ? ` · ritual rank ${item.level}`
                            : ` · rank ${item.level}`
                        : item.kind === "feat" && item.level === 0
                          ? " · bonus"
                          : ` · level ${item.level}`}
                    {item.source ? ` · ${item.source}` : ""}
                    {item.gmDescription ? " · GM source" : ""}
                  </span>
                  {item.summary ? (
                    <span className="global-search-result-summary">{item.summary}</span>
                  ) : null}
                </span>
                <span className={`global-search-kind global-search-kind-${item.kind}`}>
                  {COMPENDIUM_KIND_LABELS[item.kind]}
                </span>
              </button>
            ))}
            {!loading && error ? <div className="global-search-empty">{error}</div> : null}
            {!loading && !error && query.trim().length >= 2 && !result.items.length ? (
              <div className="global-search-empty">
                Nothing in the compendium matches “{query.trim()}”.
              </div>
            ) : null}
          </div>

          <div className="global-search-panel-foot">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
            </span>
            <Link to="/library" onClick={() => setOpen(false)}>
              Browse library
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
