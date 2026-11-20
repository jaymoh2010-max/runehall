# Runehall

[![CI](https://github.com/jaymoh2010-max/runehall/actions/workflows/ci.yml/badge.svg)](https://github.com/jaymoh2010-max/runehall/actions/workflows/ci.yml)

An all-in-one, local-first **Pathfinder Second Edition** table: a character builder, shared battle map, server-rolled dice table, campaign journal, and rules compendium.

Runehall is built for a private group of roughly 4–10 players and a GM. It runs on one machine, stores everything in a local SQLite database, and is designed to be easy to put on a home network or a small server later.

> Independent, unofficial tool compatible with Pathfinder Second Edition. Not affiliated with or endorsed by Paizo Inc.

---

## What's in this first build

### Character forge
- Level 1–20 character builder with live PF2e math.
- Ancestry, heritage, background, class, deity, ability boosts, skills, feats, spells, gear, details, and review chapters.
- Core sources by default — Player Core, Player Core 2, Core Rulebook, GM Core, and Monster Core — with an **Expanded sources** toggle in every picker.
- Common level-1 heritage mechanics are applied: Skilled Human's skill choice and level-5 expertise, Versatile Human's bonus general feat, Ancient Elf's other-class dedication, and the senses/feat access of Aiuvarin, Dromaar, Nephilim, Changeling, Dhampir, and Duskwalker. Dragonblood adds Draconic and explicit tracking notes without inventing low-light vision. Less structured heritages stay visible with honest manual notes.
- Level-1 class choices apply their fixed grants: Druid order feat and focus spell, Bard muse feat and repertoire spell, Wizard school focus spell and thesis feat, Sorcerer bloodline focus spell, and Cleric doctrine feats. Granted feats/spells do not consume normal slots. Free choices such as domains, variable bloodline gifts, curriculum variants, and Champion devotion spells stay explicit notes.
- Spellcasting basics are tighter: Sorcerer and Oracle use the correct level-1 three-slot table, a bloodline/patron/eidolon-derived tradition must exist before ordinary spells are added, class cantrip caps are shown, and a Cleric receives a warning when non-font prepared spells exceed the ordinary slots.
- Feat prerequisites are enforced: options with unmet prerequisites are hidden and cannot be selected. Complex story requirements stay visible with a **Check prereqs** warning. Class feats are also checked against the selected class, even when the “Only my class” filter is off, and a background’s starting feat enters the same prerequisite and effect pipeline.
- Core ancestry, heritage, background, and class choices plus picker selections update the summary, step badges, and derived numbers immediately instead of waiting for the next autosave. The **Sheet** link waits for a pending save before navigating, and closing the tab flushes the latest draft.
- Weapon, armor, and shield runes: weapon/armor potency, striking, resilient, property runes, and shield durability; rune prices count toward wealth and their bonuses flow into attacks, damage, AC, saves, and shield Hardness/HP.
- Starting wealth is a one-time level-1 creation budget covering both gear and carried coins, with a **Take remaining as coins** action. Imported, looted, and transferred characters use play-history wealth without a starting-budget warning.
- Prepared casters are capped by their rank-by-rank spell slots; duplicate preparations are supported, spontaneous repertoire limits are checked, and slot pips can be reset between sessions.
- Manual companion roster for animal companions, familiars, eidolons, and summons, with HP, AC, and attack notes.
- A step-by-step level-up wizard shows before/after HP and each new feat, skill, spell, ability boost, or class feature with Back/Next controls. Level up stays locked while required choices are unresolved, then opens the first relevant chapter.
- A persistent character checklist tracks every unresolved required choice — boosts, skill increases, feat slots, spell ranks, and base selections — with links back to each chapter. It survives reloads and appears after GM-driven level-ups too.
- Party cards and the Overview mark characters with unresolved required choices as **Needs choices** instead of treating a saved but unfinished draft as ready.
- Printable character sheet with a clean Print/PDF layout.
- Real compendium content: 51 ancestries, 334 heritages, 540 backgrounds, 29 classes, 3,000+ class features/feats, 2,000+ spells, 5,900+ items, 480+ deities, 1,200+ creatures.
- Feat, spell, and equipment pickers default to a **Recommended only** view (common, non-playtest options) and rank exact/prefix name matches first; toggle the filter off to browse everything.
- **Global compendium search** in the top bar (`Ctrl+K` or `/`) searches feats, spells, items, creatures, ancestries, heritages, backgrounds, classes, class features, deities, conditions, and actions at once. Results are grouped by relevance and open a full entry page with traits, statistics, and complete rules text.
- **Hover descriptions** on library rows, picker results, bestiary entries, token list rows, and map tokens show a short rules summary and key stats without leaving the current screen.
- Ability boost validation, key ability selection, ancestry/background/class choices, doctrine/bloodline/racket-style subclass selection.
- Derived HP, AC, saves, perception, class DC, spell DC/attack, skills, lore, attacks, bulk, and wealth.
- Autosaves every change; portable JSON export/import.
- Route-level code splitting keeps the initial client small, with a gzip bundle budget in CI checks. Dialogs trap and restore focus, the app has a skip link, and reduced-motion preferences are honored.
- At-the-table sheet with clickable skill/save/attack/spell rolls, HP, temp HP, hero points, focus points, conditions, and notes. A target DC/AC field resolves degree of success, secret rolls stay GM-only, attacks have second/third-attack MAP buttons and a critical-damage shortcut, conditions change the derived math, the sheet explains what was applied, **Arm next roll** spends a Hero Point on a reroll, and **Refocus** restores a Focus Point.
- Conditions are shared between a linked character sheet and its table token. A GM applying Frightened or Off-Guard to a token updates the player's AC, saves, attacks, and DCs; a player changing conditions on the sheet updates the token.
- The open character sheet and party cards receive live `character:updated` events, so token damage, GM rests, loot, conditions, and level-ups do not require a reload.
- One-click **Long rest**: heals CON modifier (minimum 1) × level, clears temporary HP, resets spell slots, divine font, focus points, and shield, removes fatigued and recovering dying/unconscious, and reduces doomed/drained by 1.
- **Damage and healing use PF2e life state.** Temporary HP absorbs damage first; reaching 0 HP applies dying and unconscious; healing above 0 clears them and adds or raises wounded; doomed lowers the death threshold. Direct HP corrections apply the same dying/unconscious state without silently consuming temporary HP. Sheet HP, token editor HP, token panel edits, group damage/healing, and unlinked-monster damage all use the same helper.

### Shared table
- Scene maps with automatic dimensions, interactive grid calibration, and map scaling.
- Categorized built-in battle maps for taverns, caverns, forests, mountains, battlefields, crypts, villages, ships, deserts, and swamps, plus custom uploads and blank scenes.
- Scene props with ground/overhead layers, built-in furniture/nature/dungeon/camp pieces, custom prop uploads, and a GM-controlled all-on/all-off prop collision switch with shortest-path movement and Speed-limited detours.
- GM-managed campaign soundtrack: local MP3/OGG/WAV/WebM uploads or a bundled CC0 music library with battle, exploration, tavern, relaxing, and mystery moods; a shared track list; synced play/pause; player **Join audio**/**Leave audio** controls; local volume; and looping playback.
- Pan, zoom, fit, grid overlay, and snap-to-grid token movement.
- Token creation from party characters, the bestiary, or custom markers.
- Token editor via right-click or the side panel: art upload, HP/AC, size, color, light color, owner, hidden/locked, conditions, and linked-character HP sync.
- A party roster rail beside the map: hover a portrait to see live HP, AC, saves, perception, speed, class/spell DC, hero points, and conditions; click to select that character's token. Online/offline dots show who is currently connected.
- Player token ownership and locking; GM controls for hidden tokens and HP. Hidden tokens, their moves, their updates, and hidden scene props are filtered on the server, so players never receive them.
- Brush-based fog of war with reveal/hide modes and three brush sizes.
- GM-drawn walls and doors with a click-to-open door state, optional wall collision with shortest-path movement around walls and closed doors, per-token vision radius, colored light radius, normal/low-light/darkvision senses, shared or per-player vision, explored-area fog memory, and optional line-of-sight fog.
- Selecting a token shows cover (+2/+4/total) and concealment flat-check DCs against hovered tokens, calculated from walls, closed doors, ground props, ambient light, token lights, and the observer's senses.
- Scene duplication, drag-to-calibrate grid alignment, map scaling, and fog alignment for offset grids.
- PF2e distance measurement with 5/10 alternating diagonals, pointer pings, and live presence.
- Server-side dice with PF2e degrees of success, secret GM rolls/whispers, and persistent table chat.
- GM roll requests with one-click player prefill in the dice tray.
- Initiative tracker with GM rolls, individual reroll, current turn, round counter, add/remove, next/previous, HP, condition counts, and per-turn movement tracking with PF2e 5/10 diagonal carryover and Speed warnings.
- Keyboard shortcuts and a distraction-free full-screen/theater table mode.
- Character sheets can roll directly into the campaign log.

### Campaign hub
- Local accounts with scrypt-hashed passwords and HTTP-only session cookies.
- Configurable registration — open, invite-only single-use codes, or closed — with the first account becoming the instance administrator.
- **Hall controls** for administrators: registration mode, invite codes, account counts, and a local audit log.
- **Account & security** page for display name and password changes; changing a password signs out other sessions.
- Local recovery with `npm run reset-password -- --username <name>`, including `--list` and `--admin`.
- **My Campaigns** dashboard for both roles, with role, last played, member/character counts, and one-click continuation.
- The GM chooses a campaign ruleset at creation — **Core Remastered**, **Expanded Remastered**, or **Legacy + Remastered** — and players inherit it automatically.
- Shareable invite links (`/join/:code`) and codes. Signed-out friends create an account or sign in, then choose or create a character before joining.
- LAN-aware invite links so players on other devices can join a locally hosted table.
- GM/player roles, member management, player read-only views, party roster, journal visibility, and campaign settings.
- **GM-controlled advancement by default.** Milestone mode hides XP and leaves every level-up to the GM. Optional XP tracking awards experience to selected characters, supports fast/medium/slow advancement (800/1,000/1,200 XP per level), and includes simple/complex hazard, accomplishment (10/30/80), quest, and custom awards with a recent-award ledger. It never levels anyone automatically; the GM advances the whole party or one character when they choose. Campaign characters cannot be advanced from the builder by their owners; uncampaigned characters remain owner-editable.
- The GM can apply a long rest to the whole party from the Party tab; linked tokens and character summaries update together.
- Shared library and quick rules reference.

---

## Build from source

### Requirements
- **Node.js 26+** (Runehall uses the built-in `node:sqlite` module; no native database dependency).
- npm 11+ (bundled with Node 26).
- Git.
- Windows, macOS, or Linux.
- Optional: Docker Desktop / Docker Engine with Compose for the container build.

### 1. Clone and install
```bash
git clone https://github.com/jaymoh2010-max/runehall.git runehall
cd runehall
npm ci
```
`npm ci` uses the committed `package-lock.json` for a reproducible install.

### 2. Run in development
```bash
npm run dev
```
Open **http://localhost:5173**. The API and Socket.IO server run on port 3001; Vite proxies `/api`, `/uploads`, and `/socket.io`.

### 3. Build for production
```bash
npm run build
npm start
```
Open **http://localhost:3001**. The Fastify server serves the built client, API, uploads, and websocket server from one process.

### 4. Run with Docker
```bash
docker build -t runehall .
docker run -d --name runehall --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  -e REGISTRATION_MODE=invite \
  -e BOOTSTRAP_TOKEN=replace-with-a-long-random-value \
  -v runehall-data:/app/data \
  -v runehall-backups:/app/backups \
  runehall
```

Set `COOKIE_SECURE=1` behind HTTPS and remove `BOOTSTRAP_TOKEN` after creating the administrator.
Or use Compose from the repository root:
```bash
docker compose up -d --build
```
The compose path keeps SQLite, the compendium, uploads, and backups in `./data` and `./backups`.

### 5. Verify the build
```bash
npm run check        # types, lint, format, unit tests, production build, bundle budget
npm run smoke        # GM/player API + socket smoke test
npx playwright install chromium
npm run e2e          # browser flows in Chromium
npm run verify:data  # compendium and SQLite integrity
```
GitHub Actions runs the verify job, the browser E2E job, the restore drill, and a Docker image health check on pushes and pull requests. A separate weekly **Rules simulation** workflow runs the full character matrix. Dependabot watches npm and GitHub Actions.

### First five minutes
1. **Register** an account.
2. **Create a campaign** — you become the GM and get an invite code.
3. Open the **Party** tab and create a character.
4. Build the character through the chapters, then open its **sheet**.
5. Return to **Table**, open **Scenes**, create or upload a map, add party/monster tokens, and start playing.

Players join with the GM's invite link or code from their own accounts. They can bring an existing character or create one during the join flow, then the campaign appears under **My Campaigns** for them too. They see the party, can move only tokens they own unless the GM unlocks them, and can return to the same table from their dashboard next session.

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite client + Fastify server with live reload |
| `npm run dev:client` | Vite only (port 5173) |
| `npm run dev:server` | Fastify only (port 3001) |
| `npm run build` | Build the production client into `dist/client` |
| `npm start` | Run the server and serve the built client |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (react-hooks rules, syntax/safety checks) |
| `npm run format:check` | Verify Prettier formatting |
| `npm run format` | Rewrite files with Prettier |
| `npm test` | Vitest unit tests |
| `npm run check` | Typecheck, lint, formatting, unit tests, production build, and bundle budget |
| `npm run check:bundle` | Verify the production entry JS/CSS gzip budgets after a build |
| `npm run check:full` | `check` plus the two-user smoke test |
| `npm run smoke` | Two-user GM/player API + socket smoke test against a temporary database |
| `npm run e2e` | Build and run the Playwright GM/player browser flows |
| `npm run ingest` | Rebuild the compendium from the Foundry PF2e data clone |
| `npm run verify:data` | Validate compendium counts, required fields, cross-references, inline macros, SQLite integrity, and foreign keys |
| `npm run simulate` | Generate valid characters across classes, levels, ancestries, backgrounds, subclass options, feats, spells, and gear; report rule/math problems |
| `npm run simulate:campaign` | Run two isolated 1–20 campaign simulations through the API and sockets; report failures and campaign gaps |
| `npm run backup` | Snapshot SQLite + uploaded assets into `backups/` |
| `npm run ship-backup` | Verify and copy the newest backup to another folder or NAS mount |
| `npm run restore -- --from <dir> --yes` | Restore a backup (server must be stopped) |
| `npm run restore-drill` | End-to-end live backup, shipping, corruption rejection, and restore check |
| `npm run audit-prune` | Preview expired audit entries; add `-- --delete` to remove them |
| `npm run reset-password -- --username <name>` | Issue a temporary password and sign out that account everywhere |
| `npm run cleanup-assets` | Dry-run scan for unused uploaded files; add `-- --delete` to remove them |

Environment variables: `PORT` (default 3001), `HOST` (default 0.0.0.0), `RUNEHALL_PORT` / `RUNEHALL_BIND` (Compose published port and bind address), `COOKIE_SECURE` (set to `1` behind HTTPS), `NODE_ENV`, `ENABLE_CSP`, `ENFORCE_ORIGIN`, `TRUST_PROXY_HOPS` (default `1`), `REGISTRATION_MODE` (`open`, `invite`, or `closed`), `BOOTSTRAP_TOKEN` (optional one-time first-admin token), `AUDIT_RETENTION_DAYS` (default `0`, keep forever), `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_WINDOW_MS`, `TRUSTED_ORIGINS`, `DATA_DIR`, `DATABASE_PATH`, `COMPENDIUM_DIR`, `BACKUP_DIR`, `BACKUP_SHIP_DIR`, `LOG_LEVEL`.

### Production and Docker

```bash
npm ci
npm run build
# Local HTTP test only; set COOKIE_SECURE=1 behind HTTPS.
NODE_ENV=production COOKIE_SECURE=0 npm start
```

Or run the container:

```bash
docker compose up -d --build
```

The compose path keeps SQLite, the compendium, uploads, and backups in `./data` and `./backups`. Put Caddy or Nginx in front for HTTPS, then set `COOKIE_SECURE=1`. Security headers, CSP, origin checks, and auth/upload rate limits are built in. The production image is built and health-checked in CI, and has been verified locally with persistence, backups, and restore. It also prepares `/app/shipped` for an optional off-machine backup mount.

**Hosting for friends:** clone <https://github.com/jaymoh2010-max/runehall.git>, copy
`.env.example` to `.env`, set `BOOTSTRAP_TOKEN`, `COOKIE_SECURE=0` for localhost/SSH-tunnel setup,
and `REGISTRATION_MODE=invite` (or `closed`), then run `docker compose up -d --build`. Create the
first administrator from the server or an SSH tunnel; it becomes the instance administrator. Then
set `COOKIE_SECURE=1`, remove `BOOTSTRAP_TOKEN`, recreate, and put Caddy/Nginx in front. The compose
file binds port 3001 to loopback. See [docs/DEPLOY.md](docs/DEPLOY.md) for the full
clone-to-HTTPS checklist, reverse-proxy examples, updates, backups, and current hosting gaps.
For the table-facing setup, character creation, and session-1 checklist, see
[docs/FIRST-CAMPAIGN.md](docs/FIRST-CAMPAIGN.md).

---

## Project layout

```
src/
  shared/            Types, PF2e rules engine, dice parser, encounter math, content helpers
  client/components/builder/steps/  Focused builder chapter components
  server/            Fastify API, SQLite, auth, compendium, Socket.IO table server
    routes/          Auth, campaigns, encounters, loot, characters, compendium, table/scenes, uploads
  client/            React 19 interface
    components/      UI system, builder pickers, table canvas/chat/initiative
    pages/           Landing, auth, dashboard, campaign hub, builder, sheet, library, rules
  scripts/           PF2e data ingestion (ingest-pf2e.mjs)
data/
  compendium/        Generated local rules compendium (JSON)
  uploads/           Uploaded maps, portraits, and token art
  runehall.db        SQLite database (created on first run)
tests/               Dice and PF2e rules-engine tests
docs/                Product plan, data pipeline, architecture notes
```

See [docs/PLAN.md](docs/PLAN.md) for the product/architecture plan, [docs/ROADMAP.md](docs/ROADMAP.md) for the review and step-by-step execution plan, [docs/CAMPAIGN-READINESS.md](docs/CAMPAIGN-READINESS.md) for the PF2e campaign coverage review and simulation results, [docs/BACKUP.md](docs/BACKUP.md) for backup/restore, and [docs/DATA.md](docs/DATA.md) for the data pipeline and licensing details.

---

## Current scope and known limitations

This is a substantial, playable foundation — not a complete Pathbuilder/Foundry replacement yet.

- **Realtime recovery is revision-aware.** Reconnecting or returning to the tab refetches the authoritative table, chat merges by message ID, and campaign revisions let the client detect a missed socket event and refetch. Character saves use optimistic revisions and surface a conflict dialog instead of silently overwriting another edit.
- **Rules automation is intentionally pragmatic.** Ability boosts (including partial boosts above +4), HP, AC, saves, perception, initiative, skills, attacks, spell DCs, and full/bounded slot tables are live. Feat prerequisites are checked for common mechanical requirements (abilities, proficiencies, feats, class features, heritage, deity, and age); story/campaign prerequisites are flagged for manual review. A curated effect engine applies verified, always-on effects — feats (Toughness HP, Fleet speed, Incredible Initiative, Untrained Improvisation), choice-driven feats (Canny Acumen saves/Perception, Additional Lore, Armor Proficiency, Weapon Proficiency, Ancestral Paragon granted feat), and items (skill items, Bands of Force AC/saves, Amulet of the Third Eye Perception) — while most other feat/item effects that alter statistics (conditional bonuses and the like) are not applied automatically. Non-numeric feats such as Diehard and Robust Health surface as **tracking notes** on the character sheet instead of pretending they are automated. Feat and equipment pickers show conservative **Automated / Partly automated / Manual** badges so the table knows what still needs tracking.
- **Spell repertoire/slot enforcement is a table aid.** You can add the spells your character knows, and full casters, bounded casters (magus/summoner/necromancer/psychic), and focus casters get slot or focus trackers. Animist slots are shown as a per-rank total of animist and apparition slots, and cleric divine font slots now have their own pips separate from ordinary slots. Prepared casters label their lists as **spellbook**, spontaneous casters as **repertoire**, and prepared counts include the divine font where relevant. The tracker does not enforce heal-or-harm font preparation.
- **Companion-style subsystems are table aids.** Animist apparitions, animal companions, eidolons, familiars, and similar allies are not automated as separate actors. Companions can link to a bestiary entry to pull HP, AC, attacks, and abilities into the roster, but advancement and companion-specific rules remain manual.
- **Walls, doors, and lighting use a simple but playable model.** Walls and closed doors can block sight and, when the scene's **Wall collision** switch is on, token movement with shortest-path detours. Ambient light, token light, per-token light colors, and normal/low-light/darkvision affect fog. Selecting a token shows cover, greater cover, total cover, and concealment against hovered tokens, but attack rolls still require the player to apply the flat check manually. Full dynamic shadow-casting is not implemented.
- **Multi-select and group drag are supported.** Shift/Ctrl/Cmd-click adds or removes tokens, Shift-drag draws a marquee, and dragging any selected token moves the whole selection. Bulk controls apply damage, healing, full HP, conditions, visibility, locking, and deletion to every selected token.
- **Scenes form a playlist.** The GM can reorder scenes with buttons or drag-and-drop, step through them with previous/next controls, activate a new scene on creation, and preview any scene as players see it without moving the table. Scene creation generates a small WebP thumbnail for the scene manager, with lazy loading and the full map as a fallback.
- **Initiative supports delay, ready, and ties.** The active combatant can delay to the end of the order or mark a readied action, trigger a readied action from the chip, and tied entries use Perception before manual reordering. Readied state expires at the start of that combatant’s next turn.
- **The combat log is filterable.** Chat can be narrowed to table talk, rolls, requests, or GM-only messages. The GM can send a **Group check** request, and player responses are linked back to the request card with totals, degrees of success, and a pass/fail tally.
- **Area templates are shared.** Burst, emanation, cone, and line templates can be placed and measured on the map, are persisted per scene, and are shared with all connected clients. Rotation handles and save/roll cards remain future work.
- **Conditions carry values, durations, and math.** Conditions store an optional numeric value and round duration, show as labels such as "Frightened 2 (3r)", and normalize older string conditions. Frightened, sickened, clumsy, enfeebled, stupefied, drained, fatigued, off-guard, prone, grabbed, restrained, blinded, unconscious, and encumbered now change AC, saves, Perception, skills, attacks, class/spell DCs, max HP, or Speed as appropriate; status and circumstance penalties follow PF2e stacking. The sheet lists what was applied. Advancing initiative ticks timed conditions, reduces frightened by 1 at the end of the turn, and removes expired conditions from both tokens and linked sheets. Character-sheet conditions also have a manual -1 button.
- **Token HP and sheet HP share one source of truth.** Current HP is two-way: token damage/healing writes to the linked sheet, and sheet saves update linked tokens. Max HP belongs to the character sheet; the token max is read-only for linked characters and remains editable for unlinked monsters and NPCs.
- **Encounter prep is GM-facing.** Campaigns choose **Milestone** or **XP budget** advancement, plus a fast/medium/slow pace. XP mode shows PF2e encounter budgets and difficulty but does not award XP automatically; the GM awards encounter, hazard, accomplishment, quest, or custom XP and advances the party with **Level up party** when the story calls for it. Encounter prep is hidden from players. Encounters can be duplicated, split into numbered waves, and launched through a scene/wave preview. Reinforcements roll initiative into the existing order without resetting the round, and party-size presets cover Auto plus 3–6 characters. A fresh launch replaces the tokens that encounter already placed on that scene, and **Clear launched** removes them and their initiative entries without touching character, NPC, or hidden tokens. Tokens launched before this update have no provenance record, so remove those older duplicates once by hand.
- **Loot distribution updates sheets, not players' choices.** The GM builds parcels, adds compendium equipment and coins, then gives a parcel to a character. New weapons, armor, and shields arrive equipped; players can change equipment in the builder afterward. Parcels are a record, not an in-character inventory the player can edit directly.
- **Players can manage their inventory.** The character sheet shows gear stacks, equipped state, Bulk, gear value, and the purse. Players can change quantities, equip or unequip gear, remove items, and give an item stack or coins to another character in the campaign. Transfers are revision-checked and applied to both sheets together; received items arrive unequipped, and a whole transferred stack carries its runes.
- **Handouts are shared journal entries and can track quests.** The GM can mark a journal entry as a handout, attach up to 12 images, and choose whether players can see it. A handout can also be an active, completed, or failed quest with an XP reward; completing it lets the GM award that XP to the party once, and the rewarded state prevents a double payout. Players only receive shared entries and their attachments; GM-only handouts remain hidden. A handout or entry can be duplicated with its content, visibility, kind, and attachments intact. The GM can reuse any image already uploaded for the campaign from the handout editor's **From library** picker.
- **The soundtrack is a single shared track list, not multiple named playlists.** The GM can upload MP3/OGG/WAV/WebM files or add a bundled CC0 fantasy track from the mood-filtered music library (battle, exploration, tavern, relaxing, mystery). Playback loops and syncs on play, pause, and track changes; it is not sample-accurate across clients, and players must click **Join audio** before their browser will start sound. Players can leave audio locally without pausing the table. New tracks and deletions reach connected players live, deleted uploaded files are removed when no longer referenced, bundled library files are never deleted from a campaign, and campaign export/import carries track metadata. Audio is managed from the table's right sidebar.
- **The in-world calendar is a GM clock.** Campaigns track a Golarion date in Absalom Reckoning, including the standard month lengths and the leap day in Calistril. The Overview shows the date, and the GM can set it or advance it by 1 or 7 days. Changes are pushed to players viewing the campaign, and campaign export/import preserves the date.
- **Downtime is tracked per character.** The GM grants days from the Party tab, and players spend them from the character sheet. Earn Income, crafting, retraining, and other downtime activities remain manual; the tracker records the days.
- **The dashboard is a continuity aid, not a scheduler.** It stores a last-session summary, shared teaser, GM-only notes, and clue/quest threads. The next-session date comes from the **Sessions** calendar rather than a second dashboard field. Players see the safe subset; session attendance and reminders are not automated yet. The GM can generate an editable recap draft from shared rolls, visible journal entries, loot, the played session, and open shared threads, then save it as the summary or a new shared handout. GM-only chat, hidden handouts, and GM-only threads are excluded from the draft. New campaigns also show a four-step setup checklist that disappears once players are invited, a character exists, a session is scheduled, and a handout is written.
- **Monster groups move and act together.** Bestiary groups and encounter launches create grouped tokens with numbered names. Dragging one member moves the formation, group HP is the sum of its members, and one initiative roll covers the group. Individual HP is still tracked per token.
- **The bestiary palette is a table tool, not a modal.** The GM can keep it open, search and filter creatures, set a count, then drag a group directly onto the map or press Add to place it at the center.
- **The GM screen is a fast reference, not a second rules engine.** It provides standard level/simple DCs, condition text, GM-only secret rolls, and shared roll requests. Complex modifiers and situational bonuses remain the GM’s call.
- **NPC statblocks are a GM-only library.** Save recurring allies, villains, and custom creatures with combat basics, optional art, and notes, then place a token on any scene. Players only see the resulting token, never the prep library.
- **Sessions are shared; attendance is GM-managed.** The GM schedules sessions, keeps a private agenda checklist, and records attendance. Players see the schedule, their own attendance, and everyone's check-in status, but never GM notes or the agenda. A scheduled session stays in **Upcoming & current** and keeps its check-in controls until the GM marks it played or canceled; the card shows **In progress** or **Overdue** once its start time passes. Session changes reach open Sessions and Overview tabs live, and the Overview reminds players to check in and the GM who is still outstanding. XP is still not awarded automatically.
- **Campaign import creates a new campaign, not a merge.** It remaps content IDs and matches player accounts by username; characters whose owners are not local are assigned to the importing GM. Uploaded images are referenced, not copied.
- **Pathbuilder 2e characters can be imported.** On **My Campaigns**, choose **Import Pathbuilder** under Characters and select a JSON export from pathbuilder2e.com. Runehall matches names against its local compendium and reports unmatched options instead of guessing. Weapon/armor/shield runes, prepared-slot duplicates, and pets/familiars (as companions) are imported; dual-class and play state remain manual, pet statblocks need review, and some skill increases or ability boosts may need review in the builder. Players joining through an invite can also choose **Import from Pathbuilder**; the character stays in their library and waits in the GM's **Join requests** queue until the GM approves or declines it.
- **Unused uploads are cleaned up deliberately.** Deleting a scene, handout, token, or NPC does not immediately delete its image file. Campaign uploads appear in the GM-only **Assets** tab with usage labels; unreferenced campaign images can be deleted there. Run `npm run cleanup-assets` to review legacy or orphaned files outside a campaign, and add `--delete` to remove them.
- **Only images are uploaded to the campaign asset library.** Video, PDFs, and animated token frames are not supported there; soundtrack audio is uploaded separately through the table's Soundtrack panel. Image uploads are checked by file signature, not just the browser-provided MIME type, and oversized images are rejected. Smoke coverage includes bad signatures, mismatched/unsupported types, empty files, oversized files and dimensions, foreign campaigns, and cleanup after rejection.
- **Local accounts, not OAuth.** Fine for a private group; use HTTPS before exposing the site outside a trusted network.
- **Registration is controllable.** The first account on a fresh install becomes the instance administrator. From **Admin → Hall controls**, that account can leave registration open, switch to invite-only single-use codes, or close it entirely. Open registration remains the default for local use.
- **The audit log is local and manageable.** Sign-ins, failed sign-ins, password changes, campaign creation/deletion, member removal, party level-ups, and administrative actions are recorded in SQLite. Admins can filter the log, export the current filter as CSV, and set a retention window from 0 (keep forever) to 3650 days. Pruning runs when retention changes and at server startup; `npm run audit-prune` can preview or apply it manually.
- **Password recovery is local.** Signed-in users can change their password in **Account & security**. A host with shell access can run `npm run reset-password -- --username <name>` to issue a temporary password or grant administrator access; there is no email reset.
- **Backups can be scheduled and shipped off-machine.** `npm run backup -- --keep N` prunes older archives, and `npm run ship-backup -- --to <folder> --keep N` verifies and copies the newest archive to another disk, NAS mount, or synced folder. Backups include per-file SHA-256 hashes, and restore refuses corrupted archives. `npm run restore-drill` proves the whole path with real campaign data; CI runs it on a fresh runner.
- **Search is keyword-based, not natural-language.** The global search bar and library cover every compendium entry type, but there is no semantic rules lookup or question answering over rules text.
- **Some upstream entries have no separate rules text.** About 189 generic treasure/gear items and seven creatures have empty descriptions in the Foundry source export; the library shows their statistics and an explicit fallback rather than inventing text. Thirteen recovered entries use GM-facing source text and are labeled **GM source text**. Twenty-eight control attacks legitimately have no damage, and 716 spells have no tradition because they are focus, ritual, or class-locked.

### Good next steps
1. **Keep the deployment green:** keep the Docker, browser E2E, and weekly rules-simulation jobs green, and merge Dependabot updates.
2. **Maintainability:** split the largest modules (`rules.ts`, `CharacterSheetPage`, `CampaignPage`) incrementally.
3. **Rules automation:** close the remaining subclass, feat, and item effect gaps.
4. **Optional scale:** Postgres/S3 adapters and OAuth only when the local deployment is proven.

---

## Licensing and attribution

- Runehall's source code is MIT-licensed.
- Rules data is generated from the [Foundry VTT PF2e system](https://github.com/foundryvtt/pf2e), which is distributed under the **Apache License 2.0**. The generated compendium preserves source/license metadata.
- Pathfinder Second Edition rules content is published under the **ORC License**. Pathfinder and all related marks are trademarks of Paizo Inc.
- Fonts: **Cinzel** and **Source Sans 3**, licensed under the SIL Open Font License.
- Runehall ships no Paizo art. Uploaded maps and portraits remain the responsibility of the person uploading them.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
