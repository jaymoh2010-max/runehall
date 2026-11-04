import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  Dices,
  LockKeyhole,
  Map,
  ScrollText,
  Sparkles,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useSession } from "../stores";

export function LandingPage() {
  const user = useSession((state) => state.user);
  useEffect(() => {
    document.title = "Runehall — Pathfinder 2e Table";
  }, []);
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <img src="/rune.svg" alt="" />
          <span className="brand-word">
            Rune<span>hall</span>
          </span>
        </Link>
        <div className="landing-nav-actions">
          {user ? (
            <Link className="btn btn-primary btn-md" to="/campaigns">
              Enter the hall <ChevronRight size={16} />
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-md" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-md" to="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <Sparkles size={13} /> An all-in-one Pathfinder 2e table
          </div>
          <h1>
            Your party.
            <br />
            Your characters.
            <br />
            <em>One hall.</em>
          </h1>
          <p className="hero-lede">
            Runehall is a character builder, shared battle map, dice table, and campaign journal — built for the
            friends around your table. No tabs, no scattered tools, no lost character sheets.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to={user ? "/campaigns" : "/register"}>
              {user ? "Open your campaigns" : "Create your free account"}
              <ChevronRight size={17} />
            </Link>
            <Link className="btn btn-secondary btn-lg" to={user ? "/library" : "/login"}>
              {user ? "Browse the library" : "I already have an account"}
            </Link>
          </div>
          <div className="hero-notes">
            <span>
              <LockKeyhole size={14} /> Local-first and private
            </span>
            <span>
              <Users size={14} /> Built for 4–10 players
            </span>
            <span>
              <BookOpen size={14} /> Remaster rules data
            </span>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit" />
          <div className="hero-die">
            <img src="/rune.svg" alt="" />
          </div>
          <span className="hero-rune r1">ᚱ</span>
          <span className="hero-rune r2">ᛟ</span>
          <span className="hero-rune r3">ᚾ</span>
          <span className="hero-rune r4">ᛖ</span>
        </div>
      </section>

      <section className="features">
        <div className="features-head">
          <div>
            <div className="page-eyebrow">Everything at the table</div>
            <h2 style={{ marginTop: 6 }}>Built for the whole evening</h2>
          </div>
          <p>From the first ability boost to the last initiative count.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <UserRoundCog size={20} />
            </div>
            <h3>A character forge</h3>
            <p>
              Pathbuilder-style building with live PF2e math: ancestries, heritages, classes, feats, spells, gear,
              and every boost accounted for.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Map size={20} />
            </div>
            <h3>A shared table</h3>
            <p>
              Upload a map, drop in tokens, pan and zoom, measure distance, and reveal the dungeon one brushstroke at
              a time.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <Dices size={20} />
            </div>
            <h3>Dice with consequence</h3>
            <p>
              Server-rolled checks with PF2e degrees of success, damage formulas, secret GM rolls, and a table log
              everyone can read.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <ScrollText size={20} />
            </div>
            <h3>A living chronicle</h3>
            <p>
              Session notes, handouts, NPCs, and the party roster stay together — not in five different group chats.
            </p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <span>Runehall · A local-first Pathfinder 2e table</span>
        <span className="legal-note">
          Independent, unofficial tool compatible with Pathfinder Second Edition. Rules data is derived from the
          Apache-2.0 Foundry VTT PF2e system. Pathfinder and all related marks are trademarks of Paizo Inc. Not
          affiliated with or endorsed by Paizo.
        </span>
      </footer>
    </div>
  );
}
