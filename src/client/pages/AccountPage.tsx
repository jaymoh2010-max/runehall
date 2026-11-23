import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, Monitor, Save, ShieldAlert, UserRound } from "lucide-react";
import { api } from "../api";
import { PortraitPicker } from "../components/PortraitPicker";
import { errorMessage, useSession, useToasts } from "../stores";
import type { AuthSession, PublicUser } from "../../shared/types";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageEyebrow,
  SectionTitle,
} from "../components/ui";

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deviceLabel(userAgent: string): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const platform = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return platform ? `${browser} on ${platform}` : browser;
}

export function AccountPage() {
  const user = useSession((state) => state.user);
  const setUser = useSession((state) => state.setUser);
  const toast = useToasts((state) => state.push);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Account · Runehall";
  }, []);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user?.displayName, user?.avatarUrl]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const result = await api<{ sessions: AuthSession[] }>("/api/auth/sessions");
      setSessions(result.sessions);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadSessions();
    // Sessions only need to load when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  const revokeSession = async (session: AuthSession) => {
    setSessionBusy(session.id);
    try {
      const result = await api<{ ok: boolean; current: boolean }>(
        `/api/auth/sessions/${session.id}`,
        { method: "DELETE" }
      );
      if (result.current) {
        window.location.assign("/login");
        return;
      }
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      toast("Device signed out.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSessionBusy(null);
    }
  };

  const signOutOthers = async () => {
    setSessionBusy("others");
    try {
      const result = await api<{ removed: number; sessions: AuthSession[] }>(
        "/api/auth/sessions/revoke-others",
        { method: "POST" }
      );
      setSessions(result.sessions);
      toast(
        result.removed
          ? `Signed out ${result.removed} other ${result.removed === 1 ? "device" : "devices"}.`
          : "No other devices were signed in.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSessionBusy(null);
    }
  };

  const otherSessions = sessions.filter((session) => !session.current);

  const applyAvatar = async (url: string | null) => {
    const result = await api<{ user: PublicUser }>("/api/auth/me", {
      method: "PATCH",
      body: { displayName: displayName.trim() || user.displayName, avatarUrl: url },
    });
    setUser(result.user);
    setAvatarUrl(result.user.avatarUrl ?? null);
    toast(url ? "Portrait updated." : "Portrait removed.", "success");
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const result = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: { displayName: displayName.trim(), avatarUrl },
      });
      setUser(result.user);
      setAvatarUrl(result.user.avatarUrl ?? null);
      toast("Profile updated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast("Those new passwords don't match.", "error");
      return;
    }
    setSavingPassword(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await loadSessions();
      toast("Password changed. Other sessions were signed out.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <PageEyebrow>Your account</PageEyebrow>
          <h1 style={{ marginTop: 7 }}>Account and security</h1>
          <p className="sub">Your display name, sign-in password, and instance role.</p>
        </div>
      </div>

      <div className="account-grid">
        <Card className="admin-card">
          <SectionTitle
            title="Profile"
            subtitle="This is the name your table sees."
            action={
              <Badge tone={user.isAdmin ? "gold" : "neutral"}>
                {user.isAdmin ? "Administrator" : "Player"}
              </Badge>
            }
          />
          <div className="account-identity">
            <Avatar name={user.displayName} src={avatarUrl} size={52} />
            <div className="grow">
              <strong>{user.displayName}</strong>
              <div className="tiny muted">@{user.username}</div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<UserRound size={14} />}
              onClick={() => setPortraitOpen(true)}
            >
              Change portrait
            </Button>
          </div>
          <form className="stack" onSubmit={saveProfile}>
            <Field label="Display name">
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={40}
                required
              />
            </Field>
            <div>
              <Button type="submit" icon={<Save size={15} />} loading={savingProfile}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card className="admin-card">
          <SectionTitle
            title="Password"
            subtitle="Changing it signs out every other device."
            action={<KeyRound size={16} />}
          />
          <form className="stack" onSubmit={changePassword}>
            <Field label="Current password">
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </Field>
            <div>
              <Button
                type="submit"
                variant="primary"
                icon={<KeyRound size={15} />}
                loading={savingPassword}
              >
                Change password
              </Button>
            </div>
          </form>
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Locked out? A host with shell access can run{" "}
            <code>npm run reset-password -- --username {user.username}</code> to issue a temporary
            password.
          </p>
        </Card>
      </div>

      <Card className="admin-card account-sessions">
        <SectionTitle
          title="Active sessions"
          subtitle="Every device with a valid sign-in. Revoke anything you do not recognize."
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<LogOut size={14} />}
              loading={sessionBusy === "others"}
              disabled={!otherSessions.length}
              onClick={() => void signOutOthers()}
            >
              Sign out other devices
            </Button>
          }
        />
        {sessionsLoading ? (
          <p className="muted small">Checking active sessions.</p>
        ) : sessions.length ? (
          <div className="account-session-list">
            {sessions.map((session) => (
              <div
                className={`account-session ${session.current ? "is-current" : ""}`}
                key={session.id}
              >
                <span className="account-session-icon">
                  <Monitor size={16} />
                </span>
                <div className="grow">
                  <div className="row wrap" style={{ gap: 7 }}>
                    <strong>{deviceLabel(session.userAgent)}</strong>
                    {session.current ? <Badge tone="green">This device</Badge> : null}
                  </div>
                  <p className="tiny muted">
                    {session.ip || "unknown address"} · last active {when(session.lastSeenAt)} ·
                    signed in {when(session.createdAt)}
                  </p>
                </div>
                {!session.current ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<LogOut size={13} />}
                    loading={sessionBusy === session.id}
                    onClick={() => void revokeSession(session)}
                  >
                    Sign out
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">No active sessions were found.</p>
        )}
        <div className="settings-note">
          <ShieldAlert size={16} />
          <span>
            Passwords are stored with scrypt. Changing your password also signs out every other
            device.
          </span>
        </div>
      </Card>

      <Card className="admin-card account-note">
        <UserRound size={18} />
        <div>
          <strong>Local-first accounts</strong>
          <p className="small muted">
            Accounts live in this hall's SQLite database. Passwords are hashed with scrypt. There is
            no email reset: recovery is handled by the local reset command or another administrator
            on the machine.
          </p>
        </div>
      </Card>

      <PortraitPicker
        open={portraitOpen}
        onClose={() => setPortraitOpen(false)}
        name={user.displayName}
        value={avatarUrl}
        onSelect={applyAvatar}
      />
    </div>
  );
}
