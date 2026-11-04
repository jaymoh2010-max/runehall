import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { useSession } from "../stores";
import { api } from "../api";
import { Button, Field, Input } from "../components/ui";
import type { RegistrationStatus } from "../../shared/types";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const user = useSession((state) => state.user);
  const ready = useSession((state) => state.ready);
  const busy = useSession((state) => state.busy);
  const login = useSession((state) => state.login);
  const register = useSession((state) => state.register);
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const from = (location.state as { from?: string } | null)?.from || "/campaigns";

  useEffect(() => {
    document.title = `${isRegister ? "Create account" : "Sign in"} · Runehall`;
  }, [isRegister]);

  useEffect(() => {
    let cancelled = false;
    api<{ registration: RegistrationStatus }>("/api/auth/config")
      .then((result) => {
        if (!cancelled) setRegistration(result.registration);
      })
      .catch(() => {
        // If the config cannot be read, let the form submit and surface the
        // server's answer instead of blocking sign-in.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready && user) return <Navigate to={from} replace />;

  const registrationClosed = isRegister && registration !== null && !registration.canRegister;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    try {
      if (isRegister) await register(username.trim(), displayName.trim(), password, inviteCode.trim());
      else await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Link to="/" className="brand">
          <img src="/rune.svg" alt="" />
          <span className="brand-word">
            Rune<span>hall</span>
          </span>
        </Link>
        <div className="auth-side-copy">
          <div className="page-eyebrow">
            <Sparkles size={12} /> Gather your table
          </div>
          <h1>{isRegister ? "Every legend starts with a name." : "The hall is warm. Your seat is waiting."}</h1>
          <p>
            Build a character that actually adds up, put it on a shared map, and let the dice fall where they may.
            Runehall keeps the whole table in one place.
          </p>
        </div>
        <div className="auth-side-quote">
          “The dice are not the story. They are the sound the story makes when it turns.”
          <strong>— a very lucky GM</strong>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="brand auth-brand">
            <img src="/rune.svg" alt="" />
            <span className="brand-word">
              Rune<span>hall</span>
            </span>
          </Link>
          <div className="page-eyebrow">{isRegister ? "Create your account" : "Welcome back"}</div>
          <h2 style={{ marginTop: 8 }}>{isRegister ? "Join the hall" : "Sign in to Runehall"}</h2>
          <p className="auth-sub">
            {isRegister
              ? registration?.bootstrap
                ? "This is the first account on this hall. It becomes the instance administrator."
                : registration && !registration.canRegister
                  ? "This hall is not accepting new accounts right now."
                  : registration?.inviteRequired
                    ? "Registration is invite-only. Enter the code the host gave you."
                    : "One account covers every campaign, character, and table you share."
              : "Pick up where your party left off."}
          </p>

          {registrationClosed ? (
            <div className="auth-closed">
              <div className="auth-error">Registration is closed on this hall.</div>
              <p className="muted small">
                Ask the host to reopen registration, or sign in with an existing account.
              </p>
              <Link to="/login" className="btn btn-secondary btn-md" style={{ marginTop: 12 }}>
                <span>Go to sign in</span>
              </Link>
            </div>
          ) : (
          <form className="auth-form" onSubmit={submit}>
            {error ? <div className="auth-error">{error}</div> : null}
            <Field label="Username">
              <Input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. rune_weaver"
                required
                autoFocus
              />
            </Field>
            {isRegister ? (
              <Field label="Display name" hint="This is what your table sees.">
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="e.g. Mara"
                  required
                />
              </Field>
            ) : null}
            <Field label="Password" hint={isRegister ? "At least 8 characters." : undefined}>
              <Input
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            {isRegister ? (
              <Field label="Confirm password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Field>
            ) : null}
            {isRegister && registration?.inviteRequired ? (
              <Field label="Invite code" hint="Codes are single-use and case-insensitive.">
                <Input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  placeholder="ABCDEFG"
                  autoComplete="one-time-code"
                  required
                />
              </Field>
            ) : null}
            <Button type="submit" variant="primary" size="lg" loading={busy} block>
              {isRegister ? "Create account" : "Sign in"} <ChevronRight size={17} />
            </Button>
          </form>
          )}

          <div className="auth-switch">
            {isRegister ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : registration && !registration.canRegister ? (
              <>Registration is closed. Ask the host for an account.</>
            ) : (
              <>
                New to Runehall? <Link to="/register">Create an account</Link>
              </>
            )}
          </div>
          <div className="auth-hint" style={{ marginTop: 22 }}>
            Accounts are stored locally in Runehall's SQLite database. Passwords are hashed with scrypt. When you
            host the site later, use HTTPS before sharing it outside your network.
          </div>
          <div style={{ marginTop: 18 }}>
            <Link to="/" className="tiny muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={13} /> Back to the landing page
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
