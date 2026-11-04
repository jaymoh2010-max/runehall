import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Save, UserRound } from "lucide-react";
import { api } from "../api";
import { errorMessage, useSession, useToasts } from "../stores";
import type { PublicUser } from "../../shared/types";
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

export function AccountPage() {
  const user = useSession((state) => state.user);
  const setUser = useSession((state) => state.setUser);
  const toast = useToasts((state) => state.push);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const result = await api<{ user: PublicUser }>("/api/auth/me", {
        method: "PATCH",
        body: { displayName: displayName.trim() },
      });
      setUser(result.user);
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
            action={<Badge tone={user.isAdmin ? "gold" : "neutral"}>{user.isAdmin ? "Administrator" : "Player"}</Badge>}
          />
          <div className="account-identity">
            <Avatar name={user.displayName} src={user.avatarUrl} size={52} />
            <div>
              <strong>{user.displayName}</strong>
              <div className="tiny muted">@{user.username}</div>
            </div>
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
              <Button type="submit" variant="primary" icon={<KeyRound size={15} />} loading={savingPassword}>
                Change password
              </Button>
            </div>
          </form>
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Locked out? A host with shell access can run{" "}
            <code>npm run reset-password -- --username {user.username}</code> to issue a temporary password.
          </p>
        </Card>
      </div>

      <Card className="admin-card account-note">
        <UserRound size={18} />
        <div>
          <strong>Local-first accounts</strong>
          <p className="small muted">
            Accounts live in this hall's SQLite database. Passwords are hashed with scrypt. There is no email
            reset: recovery is handled by the local reset command or another administrator on the machine.
          </p>
        </div>
      </Card>
    </div>
  );
}
