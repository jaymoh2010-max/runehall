import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, LogOut, Shield, ShieldCheck, Swords, UserRound, Users } from "lucide-react";
import { useSession } from "../stores";
import { Avatar, IconButton } from "./ui";

export function AppShell() {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/campaigns" className="brand">
          <img src="/rune.svg" alt="" />
          <span className="brand-word">
            Rune<span>hall</span>
          </span>
        </Link>
        <nav className="topnav">
          <NavLink to="/campaigns" className={({ isActive }) => `topnav-link ${isActive ? "is-active" : ""}`}>
            <Swords size={16} />
            <span>My Campaigns</span>
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => `topnav-link ${isActive ? "is-active" : ""}`}>
            <BookOpen size={16} />
            <span>Library</span>
          </NavLink>
          <NavLink to="/rules" className={({ isActive }) => `topnav-link ${isActive ? "is-active" : ""}`}>
            <Shield size={16} />
            <span>Rules</span>
          </NavLink>
          {user?.isAdmin ? (
            <NavLink to="/admin" className={({ isActive }) => `topnav-link ${isActive ? "is-active" : ""}`}>
              <ShieldCheck size={16} />
              <span>Admin</span>
            </NavLink>
          ) : null}
        </nav>
        <div className="topbar-user" ref={menuRef}>
          <Avatar name={user?.displayName ?? "Adventurer"} src={user?.avatarUrl} size={32} />
          <span className="user-name">{user?.displayName}</span>
          <IconButton
            label="Account menu"
            onClick={() => setMenuOpen((open) => !open)}
            className={menuOpen ? "is-active" : ""}
          >
            <ChevronDown size={15} />
          </IconButton>
          {menuOpen ? (
            <div className="user-menu">
              <div className="user-menu-pop">
                <div style={{ padding: "8px 10px 10px" }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{user?.displayName}</div>
                  <div className="tiny muted">@{user?.username}</div>
                </div>
                <Link to="/campaigns" onClick={() => setMenuOpen(false)}>
                  <Users size={15} /> My campaigns
                </Link>
                <Link to="/account" onClick={() => setMenuOpen(false)}>
                  <UserRound size={15} /> Account & security
                </Link>
                {user?.isAdmin ? (
                  <Link to="/admin" onClick={() => setMenuOpen(false)}>
                    <ShieldCheck size={15} /> Hall controls
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
