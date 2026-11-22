import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Copy,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { api, copyText } from "../api";
import { useSession, useToasts, errorMessage } from "../stores";
import type {
  AuditEntry,
  RegistrationInvite,
  RegistrationMode,
  RegistrationStatus,
} from "../../shared/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  PageEyebrow,
  SectionTitle,
  Select,
  Stat,
} from "../components/ui";

interface AuditOverview {
  total: number;
  oldestAt: number | null;
  retentionDays: number;
}

interface Overview {
  registration: RegistrationStatus;
  users: number;
  invites: number;
  audit: AuditOverview;
}

const MODE_COPY: Record<RegistrationMode, { label: string; hint: string }> = {
  open: {
    label: "Open",
    hint: "Anyone who reaches this hall can create an account.",
  },
  invite: {
    label: "Invite only",
    hint: "New accounts need a single-use invite code from an administrator.",
  },
  closed: {
    label: "Closed",
    hint: "No new accounts. Existing accounts still sign in normally.",
  },
};

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminPage() {
  const user = useSession((state) => state.user);
  const toast = useToasts((state) => state.push);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invites, setInvites] = useState<RegistrationInvite[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const appliedFilterRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingMode, setSavingMode] = useState(false);
  const [inviteNote, setInviteNote] = useState("");
  const [inviteDays, setInviteDays] = useState("14");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [retentionDays, setRetentionDays] = useState("0");
  const [savingRetention, setSavingRetention] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);

  const loadAudit = useCallback(
    async (offset = 0, append = false, filter = appliedFilterRef.current) => {
      const params = new URLSearchParams({ limit: "50", offset: String(offset) });
      if (filter.trim()) params.set("action", filter.trim());
      const result = await api<{ entries: AuditEntry[]; total: number }>(
        `/api/admin/audit?${params.toString()}`
      );
      setAudit((current) => (append ? [...current, ...result.entries] : result.entries));
      setAuditTotal(result.total);
    },
    []
  );

  const applyFilter = (filter: string) => {
    appliedFilterRef.current = filter;
    setAppliedFilter(filter);
    void loadAudit(0, false, filter);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewResult, inviteResult] = await Promise.all([
        api<Overview>("/api/admin/overview"),
        api<{ invites: RegistrationInvite[] }>("/api/admin/invites"),
      ]);
      setOverview(overviewResult);
      setInvites(inviteResult.invites);
      setRetentionDays(String(overviewResult.audit.retentionDays));
      await loadAudit(0, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadAudit]);

  useEffect(() => {
    document.title = "Admin · Runehall";
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void load();
  }, [user?.isAdmin, load]);

  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <div className="page">
        <ErrorState message="This area is only available to instance administrators." />
      </div>
    );
  }
  if (loading && !overview) return <LoadingScreen label="Opening the ledger…" />;

  const setMode = async (mode: RegistrationMode) => {
    setSavingMode(true);
    try {
      const result = await api<{ registration: RegistrationStatus }>("/api/admin/registration", {
        method: "PUT",
        body: { mode },
      });
      setOverview((current) =>
        current ? { ...current, registration: result.registration } : current
      );
      toast(`Registration mode set to ${MODE_COPY[mode].label.toLowerCase()}.`, "success");
      await loadAudit(0, false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingMode(false);
    }
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    setCreatingInvite(true);
    setLastCode("");
    try {
      const result = await api<{ invite: RegistrationInvite }>("/api/admin/invites", {
        method: "POST",
        body: {
          note: inviteNote,
          expiresInDays: inviteDays === "never" ? null : Number(inviteDays),
        },
      });
      setInvites((current) => [result.invite, ...current]);
      setInviteNote("");
      setLastCode(result.invite.code);
      setOverview((current) => (current ? { ...current, invites: current.invites + 1 } : current));
      toast("Invite code created.", "success");
      await loadAudit(0, false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCreatingInvite(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/api/admin/invites/${id}`, { method: "DELETE" });
      setInvites((current) => current.filter((invite) => invite.id !== id));
      setOverview((current) =>
        current ? { ...current, invites: Math.max(0, current.invites - 1) } : current
      );
      toast("Invite revoked.", "success");
      await loadAudit(0, false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const saveRetention = async () => {
    const days = Number(retentionDays);
    if (!Number.isFinite(days)) {
      toast("Choose a valid retention period.", "error");
      return;
    }
    setSavingRetention(true);
    try {
      const result = await api<{
        audit: AuditOverview;
        pruned: { deleted: number };
      }>("/api/admin/audit/retention", {
        method: "PUT",
        body: { days },
      });
      setOverview((current) => (current ? { ...current, audit: result.audit } : current));
      setRetentionDays(String(result.audit.retentionDays));
      toast(
        result.pruned.deleted
          ? `Audit retention saved; removed ${result.pruned.deleted} expired entries.`
          : "Audit retention saved.",
        "success"
      );
      await loadAudit(0, false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingRetention(false);
    }
  };

  const exportAudit = async () => {
    setExportingAudit(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilterRef.current.trim()) params.set("action", appliedFilterRef.current.trim());
      const query = params.toString();
      const response = await fetch(`/api/admin/audit/export${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Audit export failed (${response.status}).`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="?([^"]+)"?/)?.[1] ??
        `runehall-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Audit CSV exported.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setExportingAudit(false);
    }
  };

  const copyCode = async (code: string) => {
    const ok = await copyText(code);
    toast(ok ? `Copied ${code}.` : `Invite code: ${code}`, ok ? "success" : "info");
  };

  const mode = overview?.registration.mode ?? "open";
  const openInvites = invites.filter((invite) => !invite.usedAt && !invite.usedBy);
  const retainedEntries = overview?.audit.total ?? auditTotal;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <PageEyebrow>Instance administration</PageEyebrow>
          <h1 style={{ marginTop: 7 }}>Hall controls</h1>
          <p className="sub">
            Registration, invite codes, and a local record of sign-ins and destructive actions.
          </p>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="admin-stats">
        <Stat label="Accounts" value={overview?.users ?? "—"} hint="All local users" />
        <Stat
          label="Open invites"
          value={openInvites.length}
          hint="Unused registration codes"
          tone="gold"
        />
        <Stat
          label="Audit entries"
          value={retainedEntries}
          hint={
            overview?.audit.retentionDays
              ? `${overview.audit.retentionDays}-day retention`
              : "Kept forever"
          }
          tone="blue"
        />
      </div>

      <div className="admin-grid">
        <Card className="admin-card">
          <SectionTitle
            title="Registration"
            subtitle="Choose how new accounts may join this hall."
            action={
              <Badge tone={mode === "open" ? "green" : mode === "invite" ? "gold" : "red"}>
                {MODE_COPY[mode].label}
              </Badge>
            }
          />
          <div className="admin-mode-list">
            {(Object.keys(MODE_COPY) as RegistrationMode[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`admin-mode ${mode === candidate ? "is-active" : ""}`}
                onClick={() => void setMode(candidate)}
                disabled={savingMode || mode === candidate}
              >
                <span className="admin-mode-icon">
                  {candidate === "open" ? (
                    <Users size={16} />
                  ) : candidate === "invite" ? (
                    <KeyRound size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                </span>
                <span>
                  <strong>{MODE_COPY[candidate].label}</strong>
                  <small>{MODE_COPY[candidate].hint}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 12 }}>
            The first account on a fresh install is always allowed and becomes the instance
            administrator.
          </p>
        </Card>

        <Card className="admin-card">
          <SectionTitle
            title="Invite codes"
            subtitle="Single-use codes for invite-only registration."
            action={<Badge tone="gold">{openInvites.length} open</Badge>}
          />
          <form className="admin-invite-form" onSubmit={createInvite}>
            <Field label="Note" hint="Optional — who is this for?">
              <Input
                value={inviteNote}
                onChange={(event) => setInviteNote(event.target.value)}
                placeholder="e.g. Rowan's Ranger"
                maxLength={120}
              />
            </Field>
            <Field label="Expires">
              <Select value={inviteDays} onChange={(event) => setInviteDays(event.target.value)}>
                <option value="1">In 1 day</option>
                <option value="7">In 7 days</option>
                <option value="14">In 14 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="never">Never</option>
              </Select>
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={<Plus size={15} />}
              loading={creatingInvite}
            >
              Create code
            </Button>
          </form>

          {lastCode ? (
            <div className="admin-new-code">
              <span className="tiny muted">New code — copy it now</span>
              <button type="button" onClick={() => void copyCode(lastCode)}>
                <code>{lastCode}</code>
                <Copy size={14} />
              </button>
            </div>
          ) : null}

          <div className="admin-invite-list">
            {invites.length === 0 ? (
              <EmptyState
                icon={<KeyRound size={20} />}
                title="No invite codes yet"
                description="Create one when a player is ready to join."
              />
            ) : (
              invites.map((invite) => {
                const used = Boolean(invite.usedAt || invite.usedBy);
                const expired = invite.expiresAt !== null && invite.expiresAt <= Date.now();
                return (
                  <div
                    key={invite.id}
                    className={`admin-invite ${used ? "is-used" : expired ? "is-expired" : ""}`}
                  >
                    <div>
                      <div className="admin-invite-code">
                        <code>{invite.code}</code>
                        {used ? (
                          <Badge tone="neutral">Used</Badge>
                        ) : expired ? (
                          <Badge tone="red">Expired</Badge>
                        ) : (
                          <Badge tone="green">Open</Badge>
                        )}
                      </div>
                      <div className="tiny muted">
                        {invite.note || "No note"} ·{" "}
                        {used
                          ? `used by ${invite.usedByName ?? "a user"} ${invite.usedAt ? when(invite.usedAt) : ""}`
                          : invite.expiresAt
                            ? `expires ${when(invite.expiresAt)}`
                            : "no expiry"}
                      </div>
                    </div>
                    <div className="admin-invite-actions">
                      {!used ? (
                        <Button
                          size="sm"
                          icon={<Copy size={13} />}
                          onClick={() => void copyCode(invite.code)}
                        >
                          Copy
                        </Button>
                      ) : null}
                      {!used ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={13} />}
                          onClick={() => void revoke(invite.id)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <Card className="admin-card admin-retention">
        <SectionTitle
          title="Audit retention"
          subtitle="Automatically prune security and administrative log entries. Set 0 to keep them forever."
          action={
            <Badge tone="blue">
              {retentionDays === "0"
                ? "Keep forever"
                : `${retentionDays} ${retentionDays === "1" ? "day" : "days"}`}
            </Badge>
          }
        />
        <div className="admin-retention-row">
          <Field label="Keep entries for (days)" hint="Pruning runs on save and at server startup.">
            <Input
              type="number"
              min={0}
              max={3650}
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
          </Field>
          <Button variant="primary" loading={savingRetention} onClick={() => void saveRetention()}>
            Save retention
          </Button>
        </div>
        <p className="tiny muted">
          {retainedEntries} {retainedEntries === 1 ? "entry" : "entries"}
          {overview?.audit.oldestAt
            ? ` · oldest ${when(overview.audit.oldestAt)}`
            : " · no entries yet"}
          . Export the current filter as CSV from the audit log.
        </p>
      </Card>

      <Card className="admin-card">
        <SectionTitle
          title="Audit log"
          subtitle="Sign-ins, account changes, campaign changes, and administrative actions."
          action={
            <div className="admin-audit-actions">
              <form
                className="admin-audit-filter"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyFilter(auditFilter);
                }}
              >
                <Input
                  value={auditFilter}
                  onChange={(event) => setAuditFilter(event.target.value)}
                  placeholder="Filter action, e.g. auth.login"
                />
                <Button type="submit" size="sm">
                  Filter
                </Button>
                {appliedFilter ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAuditFilter("");
                      applyFilter("");
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </form>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<Download size={13} />}
                loading={exportingAudit}
                onClick={() => void exportAudit()}
              >
                Export CSV
              </Button>
            </div>
          }
        />
        {audit.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={20} />}
            title="No audit entries"
            description="Activity will appear here as people use the hall."
          />
        ) : (
          <>
            <div className="admin-audit-list">
              {audit.map((entry) => (
                <div key={entry.id} className="admin-audit-row">
                  <span className="admin-audit-time">{when(entry.createdAt)}</span>
                  <span className="admin-audit-action">{entry.action}</span>
                  <span className="admin-audit-actor">{entry.actorName || "—"}</span>
                  <span className="admin-audit-detail" title={entry.detail}>
                    {entry.detail || entry.targetId || ""}
                  </span>
                  <span className="admin-audit-ip">{entry.ip || ""}</span>
                </div>
              ))}
            </div>
            {audit.length < auditTotal ? (
              <div style={{ marginTop: 12 }}>
                <Button size="sm" onClick={() => void loadAudit(audit.length, true)}>
                  Load more ({auditTotal - audit.length} remaining)
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
