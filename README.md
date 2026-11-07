# Runehall

An all-in-one, local-first **Pathfinder Second Edition** table: a character builder, shared battle map, server-rolled dice table, campaign journal, and rules compendium.

Runehall is built for a private group of roughly 4–10 players and a GM. It runs on one machine, stores everything in a local SQLite database, and is designed to be easy to put on a home network or a small server later.

> Independent, unofficial tool compatible with Pathfinder Second Edition. Not affiliated with or endorsed by Paizo Inc.

---

## What's in this first build

### Character forge
- Level 1–20 character builder with live PF2e math.
- Ancestry, heritage, background, class, deity, ability boosts, skills, feats, spells, gear, details, and review chapters.
- Core sources by default — Player Core, Player Core 2, Core Rulebook, GM Core, and Monster Core — with an **Expanded sources** toggle in every picker.
- Feat prerequisites are enforced: options with unmet prerequisites are hidden and cannot be selected. Complex story requirements stay visible with a **Check prereqs** warning.
- Weapon, armor, and shield runes: weapon/armor potency, striking, resilient, property runes, and shield durability; rune prices count toward wealth and their bonuses flow into attacks, damage, AC, saves, and shield Hardness/HP.
- Prepared casters are capped by their rank-by-rank spell slots; duplicate preparations are supported, spontaneous repertoire limits are checked, and slot pips can be reset between sessions.
- Manual companion roster for animal companions, familiars, eidolons, and summons, with HP, AC, and attack notes.
- Guided level-up previews new feats, skills, spells, ability boosts, and class features, then jumps into the relevant chapter.
- A persistent level-up checklist tracks required boosts, skill increases, feat slots, and spell ranks, with links back to each chapter.
- Printable character sheet with a clean Print/PDF layout.
- Real compendium content: 51 ancestries, 334 heritages, 540 backgrounds, 29 classes, 3,000+ class features/feats, 2,000+ spells, 5,900+ items, 480+ deities, 1,200+ creatures.
- Feat, spell, and equipment pickers default to a **Recommended only** view (common, non-playtest options) and rank exact/prefix name matches first; toggle the filter off to browse everything.
- **Global compendium search** in the top bar (`Ctrl+K` or `/`) searches feats, spells, items, creatures, ancestries, heritages, backgrounds, classes, class features, deities, conditions, and actions at once. Results are grouped by relevance and open a full entry page with traits, statistics, and complete rules text.
- **Hover descriptions** on library rows, picker results, bestiary entries, token list rows, and map tokens show a short rules summary and key stats without leaving the current screen.
- Ability boost validation, key ability selection, ancestry/background/class choices, doctrine/bloodline/racket-style subclass selection.
- Derived HP, AC, saves, perception, class DC, spell DC/attack, skills, lore, attacks, bulk, and wealth.
- Autosaves every change; portable JSON export/import.
- Route-level code splitting keeps the initial client small, with a gzip bundle budget in CI checks. Dialogs trap and restore focus, the app has a skip link, and reduced-motion preferences are honored.
- At-the-table sheet with clickable skill/save/attack/spell rolls, HP, temp HP, hero points, focus points, conditions, and notes.

### Shared table
- Scene maps with automatic dimensions and grid sizing.
- Pan, zoom, fit, grid overlay, and snap-to-grid token movement.
- Token creation from party characters, the bestiary, or custom markers.
- Token editor via right-click or the side panel: art upload, HP/AC, size, color, owner, hidden/locked, conditions, and linked-character HP sync.
- A party roster rail beside the map: hover a portrait to see live HP, AC, saves, perception, speed, class/spell DC, hero points, and conditions; click to select that character's token. Online/offline dots show who is currently connected.
- Player token ownership and locking; GM controls for hidden tokens and HP.
- Brush-based fog of war with reveal/hide modes and three brush sizes.
- Scene duplication, live grid calibration preview, and fog alignment for offset grids.
- Distance measurement, pointer pings, and live presence.
- Server-side dice with PF2e degrees of success, secret GM rolls/whispers, and persistent table chat.
- GM roll requests with one-click player prefill in the dice tray.
- Initiative tracker with GM rolls, individual reroll, current turn, round counter, add/remove, next/previous, HP, and condition counts.
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
- Shared library and quick rules reference.

---

## Quick start

### Requirements
- **Node.js 26+** (Runehall uses the built-in `node:sqlite` module; no native database dependency).
- npm 11+ (bundled with Node 26).
- Windows, macOS, or Linux.

### Development
```bash
npm install
npm run dev
```
Open **http://localhost:5173**. The API and Socket.IO server run on port 3001; Vite proxies `/api`, `/uploads`, and `/socket.io`.

### Production-style local run
```bash
npm run build
npm start
```
Open **http://localhost:3001**. The Fastify server serves the built client, API, uploads, and websocket server from one process.

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
| `npm test` | Vitest unit tests |
| `npm run check` | Typecheck, unit tests, production build, and bundle budget |
| `npm run check:bundle` | Verify the production entry JS/CSS gzip budgets after a build |
| `npm run check:full` | `check` plus the two-user smoke test |
| `npm run smoke` | Two-user GM/player API + socket smoke test against a temporary database |
| `npm run ingest` | Rebuild the compendium from the Foundry PF2e data clone |
| `npm run verify:data` | Validate compendium counts, required fields, cross-references, inline macros, SQLite integrity, and foreign keys |
| `npm run simulate` | Generate valid characters across classes, levels, ancestries, backgrounds, subclass options, feats, spells, and gear; report rule/math problems |
| `npm run backup` | Snapshot SQLite + uploaded assets into `backups/` |
| `npm run ship-backup` | Verify and copy the newest backup to another folder or NAS mount |
| `npm run restore -- --from <dir> --yes` | Restore a backup (server must be stopped) |
| `npm run audit-prune` | Preview expired audit entries; add `-- --delete` to remove them |
| `npm run reset-password -- --username <name>` | Issue a temporary password and sign out that account everywhere |
| `npm run cleanup-assets` | Dry-run scan for unused uploaded files; add `-- --delete` to remove them |

Environment variables: `PORT` (default 3001), `HOST` (default 0.0.0.0), `COOKIE_SECURE` (set to `1` behind HTTPS), `NODE_ENV`, `ENABLE_CSP`, `REGISTRATION_MODE` (`open`, `invite`, or `closed`), `AUDIT_RETENTION_DAYS` (default `0`, keep forever), `AUTH_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `TRUSTED_ORIGINS`, `DATA_DIR`, `DATABASE_PATH`, `COMPENDIUM_DIR`, `BACKUP_DIR`, `BACKUP_SHIP_DIR`, `LOG_LEVEL`.

### Production and Docker

```bash
npm ci
npm run build
NODE_ENV=production COOKIE_SECURE=0 npm start
```

Or run the container:

```bash
docker compose up -d --build
```

The compose path keeps SQLite, the compendium, uploads, and backups in `./data` and `./backups`. Put Caddy or Nginx in front for HTTPS, then set `COOKIE_SECURE=1`. Security headers, CSP, origin checks, and auth/upload rate limits are built in. The production image is built and health-checked in CI, and has been verified locally with persistence, backups, and restore. It also prepares `/app/shipped` for an optional off-machine backup mount.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full deployment checklist, reverse-proxy examples, updates, and current hosting gaps.

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

See [docs/PLAN.md](docs/PLAN.md) for the product/architecture plan, [docs/ROADMAP.md](docs/ROADMAP.md) for the review and step-by-step execution plan, [docs/BACKUP.md](docs/BACKUP.md) for backup/restore, and [docs/DATA.md](docs/DATA.md) for the data pipeline and licensing details.

---

## Current scope and known limitations

This is a substantial, playable foundation — not a complete Pathbuilder/Foundry replacement yet.

- **Realtime recovery is revision-aware.** Reconnecting or returning to the tab refetches the authoritative table, chat merges by message ID, and campaign revisions let the client detect a missed socket event and refetch. Character saves use optimistic revisions and surface a conflict dialog instead of silently overwriting another edit.
- **Rules automation is intentionally pragmatic.** Ability boosts (including partial boosts above +4), HP, AC, saves, perception, skills, attacks, spell DCs, and full/bounded slot tables are live. Feat prerequisites are checked for common mechanical requirements (abilities, proficiencies, feats, class features, heritage, deity, and age); story/campaign prerequisites are flagged for manual review. Feat/item effects that alter statistics (for example, conditional bonuses) are not all applied automatically. Feat and equipment pickers show conservative **Automated / Partly automated / Manual** badges so the table knows what still needs tracking.
- **Spell repertoire/slot enforcement is a table aid.** You can add the spells your character knows, and full casters, bounded casters (magus/summoner/necromancer/psychic), and focus casters get slot or focus trackers. Animist slots are shown as a per-rank total of animist and apparition slots, and cleric divine font slots now have their own pips separate from ordinary slots. Prepared casters label their lists as **spellbook**, spontaneous casters as **repertoire**, and prepared counts include the divine font where relevant. The tracker does not enforce heal-or-harm font preparation.
- **Companion-style subsystems are table aids.** Animist apparitions, animal companions, eidolons, familiars, and similar allies are not automated as separate actors. Companions can link to a bestiary entry to pull HP, AC, attacks, and abilities into the roster, but advancement and companion-specific rules remain manual.
- **No walls or dynamic lighting yet.** Fog of war is brush-based, with no line-of-sight or vision blocking.
- **Multi-select and group drag are supported.** Shift/Ctrl/Cmd-click adds or removes tokens, Shift-drag draws a marquee, and dragging any selected token moves the whole selection. Bulk controls apply damage, healing, full HP, conditions, visibility, locking, and deletion to every selected token.
- **Scenes form a playlist.** The GM can reorder scenes with buttons or drag-and-drop, step through them with previous/next controls, activate a new scene on creation, and preview any scene as players see it without moving the table. Scene creation generates a small WebP thumbnail for the scene manager, with lazy loading and the full map as a fallback.
- **Initiative supports delay, ready, and ties.** The active combatant can delay to the end of the order or mark a readied action, trigger a readied action from the chip, and tied entries use Perception before manual reordering. Readied state expires at the start of that combatant’s next turn.
- **The combat log is filterable.** Chat can be narrowed to table talk, rolls, requests, or GM-only messages. The GM can send a **Group check** request, and player responses are linked back to the request card with totals, degrees of success, and a pass/fail tally.
- **Area templates are shared.** Burst, emanation, cone, and line templates can be placed and measured on the map, are persisted per scene, and are shared with all connected clients. Rotation handles and save/roll cards remain future work.
- **Token conditions carry values and durations.** Conditions store an optional numeric value and round duration, show as labels such as “Frightened 2 (3r)”, and normalize older string conditions. Advancing initiative ticks timed token conditions and linked character-sheet conditions, removing expired ones. Character-sheet conditions also have a manual −1 button.
- **Token HP and sheet HP are linked from the sheet side.** When you save a character, linked tokens update. Editing a token's HP directly does not currently write back into the sheet.
- **Encounter prep is GM-facing.** Campaigns choose **Milestone** or **XP budget** advancement. XP mode shows PF2e encounter budgets and difficulty but does not award XP automatically; the GM advances the party with **Level up party** when the story calls for it. Encounter prep is hidden from players. Encounters can be duplicated, split into numbered waves, and launched through a scene/wave preview. Reinforcements roll initiative into the existing order without resetting the round, and party-size presets cover Auto plus 3–6 characters.
- **Loot distribution updates sheets, not players' choices.** The GM builds parcels, adds compendium equipment and coins, then gives a parcel to a character. New weapons, armor, and shields arrive equipped; players can change equipment in the builder afterward. Parcels are a record, not an in-character inventory the player can edit directly.
- **Players can manage their inventory.** The character sheet shows gear stacks, equipped state, Bulk, gear value, and the purse. Players can change quantities, equip or unequip gear, remove items, and give an item stack or coins to another character in the campaign. Transfers are revision-checked and applied to both sheets together; received items arrive unequipped, and a whole transferred stack carries its runes.
- **Handouts are shared journal entries.** The GM can mark a journal entry as a handout, attach up to 12 images, and choose whether players can see it. Players only receive shared entries and their attachments; GM-only handouts remain hidden. A handout or entry can be duplicated with its content, visibility, kind, and attachments intact. The GM can reuse any image already uploaded for the campaign from the handout editor's **From library** picker.
- **The dashboard is a continuity aid, not a scheduler.** It stores a last-session summary, next-session date, shared teaser, GM-only notes, and clue/quest threads. Players see the safe subset; session attendance and reminders are not automated yet. The GM can generate an editable recap draft from shared rolls, visible journal entries, loot, the played session, and open shared threads, then save it as the summary or a new shared handout. GM-only chat, hidden handouts, and GM-only threads are excluded from the draft. New campaigns also show a four-step setup checklist that disappears once players are invited, a character exists, a session is scheduled, and a handout is written.
- **Monster groups move and act together.** Bestiary groups and encounter launches create grouped tokens with numbered names. Dragging one member moves the formation, group HP is the sum of its members, and one initiative roll covers the group. Individual HP is still tracked per token.
- **The bestiary palette is a table tool, not a modal.** The GM can keep it open, search and filter creatures, set a count, then drag a group directly onto the map or press Add to place it at the center.
- **The GM screen is a fast reference, not a second rules engine.** It provides standard level/simple DCs, condition text, GM-only secret rolls, and shared roll requests. Complex modifiers and situational bonuses remain the GM’s call.
- **NPC statblocks are a GM-only library.** Save recurring allies, villains, and custom creatures with combat basics, optional art, and notes, then place a token on any scene. Players only see the resulting token, never the prep library.
- **Sessions are shared; attendance is GM-managed.** The GM schedules sessions, keeps a private agenda checklist, and records attendance. Players see the schedule, their own attendance, and everyone's check-in status, but never GM notes or the agenda. The next scheduled session updates the Overview date, and the Overview reminds players to check in and the GM who is still outstanding. XP is still not awarded automatically.
- **Campaign import creates a new campaign, not a merge.** It remaps content IDs and matches player accounts by username; characters whose owners are not local are assigned to the importing GM. Uploaded images are referenced, not copied.
- **Unused uploads are cleaned up deliberately.** Deleting a scene, handout, token, or NPC does not immediately delete its image file. Campaign uploads appear in the GM-only **Assets** tab with usage labels; unreferenced campaign images can be deleted there. Run `npm run cleanup-assets` to review legacy or orphaned files outside a campaign, and add `--delete` to remove them.
- **Only images are uploaded.** No audio, video, PDFs, or animated token frames. Uploads are checked by file signature, not just the browser-provided MIME type, and oversized images are rejected.
- **Local accounts, not OAuth.** Fine for a private group; use HTTPS before exposing the site outside a trusted network.
- **Registration is controllable.** The first account on a fresh install becomes the instance administrator. From **Admin → Hall controls**, that account can leave registration open, switch to invite-only single-use codes, or close it entirely. Open registration remains the default for local use.
- **The audit log is local and manageable.** Sign-ins, failed sign-ins, password changes, campaign creation/deletion, member removal, party level-ups, and administrative actions are recorded in SQLite. Admins can filter the log, export the current filter as CSV, and set a retention window from 0 (keep forever) to 3650 days. Pruning runs when retention changes and at server startup; `npm run audit-prune` can preview or apply it manually.
- **Password recovery is local.** Signed-in users can change their password in **Account & security**. A host with shell access can run `npm run reset-password -- --username <name>` to issue a temporary password or grant administrator access; there is no email reset.
- **Backups can be scheduled and shipped off-machine.** `npm run backup -- --keep N` prunes older archives, and `npm run ship-backup -- --to <folder> --keep N` verifies and copies the newest archive to another disk, NAS mount, or synced folder. Backups include per-file SHA-256 hashes, and restore refuses corrupted archives.
- **Search is keyword-based, not natural-language.** The global search bar and library cover every compendium entry type, but there is no semantic rules lookup or question answering over rules text.
- **Some upstream entries have no separate rules text.** About 189 generic treasure/gear items and seven creatures have empty descriptions in the Foundry source export; the library shows their statistics and an explicit fallback rather than inventing text. Thirteen recovered entries use GM-facing source text and are labeled **GM source text**. Twenty-eight control attacks legitimately have no damage, and 716 spells have no tradition because they are focus, ritual, or class-locked.

### Good next steps
1. **Hosting verification:** run the restore drill on a clean machine.
2. **Browser E2E:** automate the GM/player campaign, table, modal, and lazy-route flows.
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
