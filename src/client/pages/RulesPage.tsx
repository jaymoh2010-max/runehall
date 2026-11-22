import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { BookOpen, Dices, Search, Shield, Sword } from "lucide-react";
import type { ActionRef, ConditionRef } from "../../shared/types";
import { titleCase } from "../../shared/rules";
import { SKILLS } from "../../shared/types";
import { api } from "../api";
import { errorMessage } from "../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageEyebrow,
  RichText,
  Spinner,
  Tag,
} from "../components/ui";

type Tab = "basics" | "actions" | "conditions";

export function RulesPage() {
  const [tab, setTab] = useState<Tab>("basics");
  const [query, setQuery] = useState("");
  const [actions, setActions] = useState<ActionRef[]>([]);
  const [conditions, setConditions] = useState<ConditionRef[]>([]);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [activeConditionId, setActiveConditionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    document.title = "Rules · Runehall";
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [actionResult, conditionResult] = await Promise.all([
          api<{ items: ActionRef[] }>("/api/compendium/actions"),
          api<{ items: ConditionRef[] }>("/api/compendium/conditions"),
        ]);
        setActions(actionResult.items);
        setConditions(conditionResult.items);
        setActiveActionId((current) =>
          actionResult.items.some((item) => item.id === current)
            ? current
            : (actionResult.items[0]?.id ?? null)
        );
        setActiveConditionId((current) =>
          conditionResult.items.some((item) => item.id === current)
            ? current
            : (conditionResult.items[0]?.id ?? null)
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [retryToken]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) =>
      `${action.name} ${action.traits.join(" ")} ${action.category}`.toLowerCase().includes(q)
    );
  }, [actions, query]);
  const filteredConditions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conditions;
    return conditions.filter((condition) =>
      `${condition.name} ${condition.description}`.toLowerCase().includes(q)
    );
  }, [conditions, query]);

  const activeAction =
    filteredActions.find((action) => action.id === activeActionId) ?? filteredActions[0] ?? null;
  const activeCondition =
    filteredConditions.find((condition) => condition.id === activeConditionId) ??
    filteredConditions[0] ??
    null;

  useEffect(() => {
    document.getElementById("rules-detail")?.scrollTo({ top: 0 });
  }, [activeAction?.id, activeCondition?.id]);

  const ruleTabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "basics", label: "Basics", icon: <Shield size={15} /> },
    { id: "actions", label: "Actions", icon: <Sword size={15} /> },
    { id: "conditions", label: "Conditions", icon: <Dices size={15} /> },
  ];

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = ruleTabs.findIndex((entry) => entry.id === tab);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % ruleTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + ruleTabs.length) % ruleTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = ruleTabs.length - 1;
    else return;
    event.preventDefault();
    const next = ruleTabs[nextIndex].id;
    setTab(next);
    document.getElementById(`rules-tab-${next}`)?.focus();
  };

  const clearSearch = () => setQuery("");

  return (
    <div className="page rules-page">
      <div className="page-head">
        <div>
          <PageEyebrow>Quick reference</PageEyebrow>
          <h1>Rules at the table</h1>
          <p className="sub">
            The common actions, conditions, and skill reminders you reach for mid-session.
          </p>
        </div>
        <div className="library-count">
          <BookOpen size={15} /> Pathfinder 2e
        </div>
      </div>

      <div className="library-toolbar">
        <div
          className="library-tabs"
          role="tablist"
          aria-label="Rules sections"
          onKeyDown={onTabKeyDown}
        >
          {ruleTabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`rules-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls="rules-panel"
              tabIndex={tab === entry.id ? 0 : -1}
              className={tab === entry.id ? "is-active" : ""}
              onClick={() => setTab(entry.id)}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
        {tab !== "basics" ? (
          <div className="search-box library-search">
            <Search size={16} aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${tab}…`}
              aria-label={`Search ${tab}`}
              autoComplete="off"
            />
          </div>
        ) : null}
      </div>

      {error && tab !== "basics" ? (
        <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />
      ) : (
        <div id="rules-panel" role="tabpanel" aria-labelledby={`rules-tab-${tab}`}>
          {tab === "basics" ? (
            <div className="rules-basics">
              <Card className="rules-card">
                <h2>Degrees of success</h2>
                <p>
                  Compare the result to the DC. Beating it by 10 or more is a critical success;
                  missing by 10 or more is a critical failure. A natural 20 improves the degree by
                  one; a natural 1 worsens it by one.
                </p>
                <div className="degree-row">
                  <div className="degree crit-success">
                    <strong>Critical success</strong>
                    <span>Result ≥ DC + 10</span>
                  </div>
                  <div className="degree success">
                    <strong>Success</strong>
                    <span>Result ≥ DC</span>
                  </div>
                  <div className="degree failure">
                    <strong>Failure</strong>
                    <span>Result &lt; DC</span>
                  </div>
                  <div className="degree crit-failure">
                    <strong>Critical failure</strong>
                    <span>Result ≤ DC − 10</span>
                  </div>
                </div>
              </Card>
              <Card className="rules-card">
                <h2>Proficiency</h2>
                <p>
                  Your proficiency bonus is your level plus a rank bonus: trained +2, expert +4,
                  master +6, legendary +8. Untrained checks add only the ability modifier. Armor
                  check penalties apply to Strength- and Dexterity-based skills like Acrobatics and
                  Stealth.
                </p>
                <div className="chip-row">
                  <Tag tone="green">Trained +2</Tag>
                  <Tag tone="blue">Expert +4</Tag>
                  <Tag tone="violet">Master +6</Tag>
                  <Tag tone="gold">Legendary +8</Tag>
                </div>
              </Card>
              <Card className="rules-card">
                <h2>Skills</h2>
                <div className="rules-skill-grid">
                  {SKILLS.map((skill) => (
                    <div key={skill.id} className="rules-skill-row">
                      <strong>{skill.name}</strong>
                      <span className="tiny muted">{skill.ability.toUpperCase()}</span>
                      <span className="tiny muted">
                        {skill.armorPenalty ? "Armor penalty" : "No armor penalty"}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="rules-card">
                <h2>Table rhythm</h2>
                <ol className="rules-list">
                  <li>
                    <strong>Roll initiative.</strong> The GM rolls Perception for the combatants and
                    sorts the order.
                  </li>
                  <li>
                    <strong>Take turns.</strong> On your turn you get three actions, one reaction
                    between turns, and free actions as allowed.
                  </li>
                  <li>
                    <strong>Strike.</strong> Roll d20 + attack modifier against AC. A hit deals
                    damage; a critical hit doubles the damage.
                  </li>
                  <li>
                    <strong>Track conditions.</strong> Frightened, sickened, and similar conditions
                    have values that tick down at the end of your turn.
                  </li>
                </ol>
              </Card>
            </div>
          ) : tab === "actions" ? (
            <div className="library-layout">
              <div className="library-list" id="rules-results" aria-busy={loading}>
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`library-row ${activeAction?.id === action.id ? "is-selected" : ""}`}
                    aria-current={activeAction?.id === action.id ? "true" : undefined}
                    aria-controls="rules-detail"
                    onClick={() => setActiveActionId(action.id)}
                  >
                    <div className="grow">
                      <span className="library-row-name">{action.name}</span>
                      <span className="library-row-sub">
                        {action.category || "Action"} ·{" "}
                        {action.actions
                          ? `${action.actions} action${action.actions === 1 ? "" : "s"}`
                          : action.actionType || "—"}
                      </span>
                    </div>
                  </button>
                ))}
                {loading ? <Spinner label="Loading actions…" /> : null}
                {!loading && !filteredActions.length ? (
                  <EmptyState
                    icon={<Search size={22} />}
                    title={query ? `No actions match “${query}”` : "No actions available"}
                    description={query ? "Try a different term or clear the search." : undefined}
                    action={
                      query ? (
                        <Button variant="secondary" size="sm" onClick={clearSearch}>
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                ) : null}
              </div>
              <div
                className="library-detail card"
                id="rules-detail"
                role="region"
                aria-label="Rules detail"
              >
                {activeAction ? (
                  <div className="library-detail-body">
                    <div className="library-detail-head">
                      <div>
                        <PageEyebrow>{activeAction.category || "Action"}</PageEyebrow>
                        <h2>{activeAction.name}</h2>
                        <p className="muted small">
                          {activeAction.actionType || ""}{" "}
                          {activeAction.actions
                            ? `· ${activeAction.actions} action${activeAction.actions === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                      {activeAction.rarity !== "common" ? (
                        <Badge tone="violet">{activeAction.rarity}</Badge>
                      ) : null}
                    </div>
                    <div className="chip-row" style={{ marginBottom: 12 }}>
                      {activeAction.traits.map((trait) => (
                        <Tag key={trait}>{titleCase(trait)}</Tag>
                      ))}
                    </div>
                    <RichText html={activeAction.description} />
                  </div>
                ) : (
                  <EmptyState icon={<BookOpen size={24} />} title="Select an action" />
                )}
              </div>
            </div>
          ) : (
            <div className="library-layout">
              <div className="library-list" id="rules-results" aria-busy={loading}>
                {filteredConditions.map((condition) => (
                  <button
                    key={condition.id}
                    type="button"
                    className={`library-row ${activeCondition?.id === condition.id ? "is-selected" : ""}`}
                    aria-current={activeCondition?.id === condition.id ? "true" : undefined}
                    aria-controls="rules-detail"
                    onClick={() => setActiveConditionId(condition.id)}
                  >
                    <div className="grow">
                      <span className="library-row-name">{condition.name}</span>
                      <span className="library-row-sub">
                        {condition.description.replace(/<[^>]+>/g, " ").slice(0, 90)}…
                      </span>
                    </div>
                  </button>
                ))}
                {loading ? <Spinner label="Loading conditions…" /> : null}
                {!loading && !filteredConditions.length ? (
                  <EmptyState
                    icon={<Search size={22} />}
                    title={query ? `No conditions match “${query}”` : "No conditions available"}
                    description={query ? "Try a different term or clear the search." : undefined}
                    action={
                      query ? (
                        <Button variant="secondary" size="sm" onClick={clearSearch}>
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                ) : null}
              </div>
              <div
                className="library-detail card"
                id="rules-detail"
                role="region"
                aria-label="Rules detail"
              >
                {activeCondition ? (
                  <div className="library-detail-body">
                    <div className="library-detail-head">
                      <div>
                        <PageEyebrow>Condition</PageEyebrow>
                        <h2>{activeCondition.name}</h2>
                      </div>
                    </div>
                    <RichText html={activeCondition.description} />
                  </div>
                ) : (
                  <EmptyState icon={<BookOpen size={24} />} title="Select a condition" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
