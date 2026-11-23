# Runehall

An all-in-one, local-first **Pathfinder Second Edition** table. Runehall combines the two tools a group usually keeps side by side: an Owlbear-style shared battle map and a Pathbuilder-style character builder/sheet.

> Independent, unofficial tool compatible with Pathfinder Second Edition. Not affiliated with or endorsed by Paizo Inc.

---

## What Runehall is now

The app is deliberately **manual-first**. It keeps the math, content, and bookkeeping, and leaves combat decisions to the table.

Four campaign sections:

- **Table** — the shared map and everything used during a session.
- **Party** — every hero in the campaign and a link to their sheet.
- **Journal** — shared notes, handouts, and quests.
- **Settings** — campaign setup, invites, members, and danger-zone controls.

### Table

- Scene maps with grid calibration, pan/zoom, token drag, snap, and a live movement-distance readout while dragging.
- Built-in maps plus custom uploads. The library has 37 grid-aligned colour and line-art maps from Dyson Logos, Free Fantasy Maps, and mbround18, with terrain and Pathfinder adventure-theme filters; see `public/maps/ATTRIBUTION.md`.
- Fog of war, distance measuring, pointer pings, and player presence.
- Tokens for party characters, monsters, and custom markers. Players can upload art for their own token; the GM can upload art for any token.
- Bestiary creatures get CC BY 3.0 archetype icons from Game-icons.net when no custom art is uploaded; see `public/tokens/creature/ATTRIBUTION.md`.
- A compact token panel for HP, AC, conditions, visibility, locks, and sheet access. Creature HP/AC is GM-only; linked party characters keep their shared stats.
- Condition fields autocomplete from the PF2e condition database.
- **Manual initiative order**: a top-of-table bar shows the round, order, and current combatant. The GM rolls, adds combatants, reorders, and clears from a compact dropdown on the right; nothing ticks or resolves automatically.
- Shared dice roller and persistent chat. Secret GM rolls and roll requests remain available.
- Compact Pathbuilder-inspired dark/orange interface: slim top bar, dense panels, and orange action accents.
- A **Pathbuilder-style character sheet** that opens over the table from **My sheet**, a party avatar, or a linked token. It uses a compact three-column layout: build summary and a level-by-level character plan on the left, stats and skills in the center, and tabbed Weapons / Defense / Gear / Spells / Feats / Details / Status panels on the right.
- The plan rail shows the current level by default and expands to all 20 levels, including feats, skill increases, ability boosts, and class features.
- Click a skill, attack, spell, feat, or item **name** to open its compendium page. Click the **dice icon** to roll it into table chat.
- Spellcasting tracks ordinary slots, divine font, and focus points by hand. **Cast** spends the selected slot and posts the spell to table chat.
- **Minimize** returns to the map without losing table state. Rolls from the sheet post to the same chat as the manual dice tray.
- The bestiary palette for dragging monsters onto the map.
- A shared soundtrack player with GM uploads and a bundled music library.
- Global compendium search (`Ctrl+K`) for feats, spells, items, creatures, ancestries, backgrounds, deities, conditions, and actions.

### Character builder and sheet

- Level 1–20 builder with live PF2e math.
- Ancestry, heritage, background, class, deity, abilities, skills, feats, spells, gear, details, and review.
- Built-in painted portrait library plus upload-and-crop, with 512 × 512 square exports for character sheets and table tokens; see `public/portraits/ATTRIBUTION.md`.
- Core sources by default, with an **Expanded sources** toggle.
- Feat prerequisite checks and curated always-on effects for common feats and items.
- Weapon, armor, and shield runes; bulk; wealth; inventory.
- **Gear browser** in the sheet: search the item database, buy with coins, and equip or invest. The GM can enable free **Grant** access for players in campaign settings.
- Prepared, spontaneous, focus, innate, and ritual spell tracking.
- Printable character sheet.
- Pathbuilder 2e JSON import.
- Sheet rolls post to chat. Conditions are tracked as labels and still feed the character math, but durations, persistent damage, afflictions, dying recovery, and other turn effects are **not automated**.

### Campaign

- Local accounts with scrypt-hashed passwords and HTTP-only session cookies.
- Invite links and codes, join requests, and GM/player roles.
- One SQLite database on the host machine; no cloud account required.
- Campaign journal, handouts, and quests.
- Local backup, restore, and diagnostic commands.

### What is deliberately not automated

- No automatic turn effects, condition ticking, persistent-damage rolls, or affliction countdowns.
- No speed or movement enforcement. Tokens move where the GM or owner drags them.
- No automatic damage application from chat rolls.
- No automatic leveling. The GM advances the party when the story says so.
- Loot, shops, downtime, travel, session scheduling, and similar campaign tooling are not part of the core navigation.

---

## Build from source

### Requirements

- **Node.js 26+** (Runehall uses the built-in `node:sqlite` module; no native database dependency).
- npm 11+ (bundled with Node 26).
- Git.
- Windows, macOS, or Linux.
- Optional: Docker Desktop / Docker Engine with Compose.

### 1. Install

```bash
git clone https://github.com/jaymoh2010-max/runehall.git runehall
cd runehall
npm ci
```

### 2. Develop

```bash
npm run dev
```

Open **http://localhost:5173**. The API and Socket.IO server run on port 3001; Vite proxies `/api`, `/uploads`, and `/socket.io`.

### 3. Build for production

```bash
npm run build
npm start
```

Open **http://localhost:3001**.

### 4. Docker

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

Or use Compose:

```bash
docker compose up -d --build
```

Set `COOKIE_SECURE=1` behind HTTPS and remove `BOOTSTRAP_TOKEN` after creating the administrator. See [docs/DEPLOY.md](docs/DEPLOY.md) for the full hosting checklist.

### 5. Verify

```bash
npm run check        # types, lint, format, unit tests, build, bundle budget
npm run smoke        # GM/player API + socket smoke test
npx playwright install chromium
npm run e2e          # browser flows
npm run verify:data  # compendium and SQLite integrity
```

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
| `npm run lint` | ESLint |
| `npm run format:check` | Verify Prettier formatting |
| `npm test` | Vitest unit tests |
| `npm run check` | Typecheck, lint, formatting, unit tests, build, and bundle budget |
| `npm run smoke` | Two-user GM/player API + socket smoke test |
| `npm run e2e` | Playwright browser flows |
| `npm run ingest` | Rebuild the compendium from the Foundry PF2e data clone |
| `npm run verify:data` | Validate compendium counts, required fields, and SQLite integrity |
| `npm run simulate` | Generate characters across classes, levels, and options |
| `npm run simulate:campaign` | Run two isolated 1–20 campaign simulations through the API and sockets |
| `npm run backup` | Snapshot SQLite + uploaded assets into `backups/` |
| `npm run restore -- --from <dir> --yes` | Restore a backup (server must be stopped) |
| `npm run reset-password -- --username <name>` | Issue a temporary password |
| `npm run cleanup-assets` | Scan for unused uploaded files |

Environment variables: `PORT`, `HOST`, `COOKIE_SECURE`, `NODE_ENV`, `ENABLE_CSP`, `ENFORCE_ORIGIN`, `TRUST_PROXY_HOPS`, `REGISTRATION_MODE` (`open`, `invite`, or `closed`), `BOOTSTRAP_TOKEN`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_WINDOW_MS`, `TRUSTED_ORIGINS`, `DATA_DIR`, `DATABASE_PATH`, `COMPENDIUM_DIR`, `BACKUP_DIR`, `LOG_LEVEL`.

---

## Project layout

```
src/
  shared/            Types, PF2e rules math, dice, conditions, encounters
  client/            React 19 interface
    components/table/  Map, toolbar, chat, manual initiative, sheet drawer
    pages/             Campaign, builder, sheet, library, dashboard
  server/            Fastify API, SQLite, auth, compendium, Socket.IO
    routes/          Auth, campaigns, characters, table/scenes, compendium, uploads
scripts/             PF2e data ingestion, smoke tests, backups
data/
  compendium/        Generated local rules compendium (JSON)
  uploads/           Uploaded maps, portraits, and token art
  runehall.db        SQLite database (created on first run)
tests/               Unit, smoke, integration, and browser tests
docs/                Deployment, backup, data, and product notes
```

See [docs/DEPLOY.md](docs/DEPLOY.md), [docs/BACKUP.md](docs/BACKUP.md), and [docs/DATA.md](docs/DATA.md) for operations and data details.

---

## Current scope and limitations

- **Manual combat is intentional.** Runehall does not enforce movement, action economy, or turn effects. Use the initiative order as a reference and track the rest at the table.
- **HP is shared, not automated.** Editing HP on a linked token updates the character sheet, and sheet HP updates the token. No damage is applied from chat automatically.
- **Conditions stay visible and affect math.** Frightened, off-guard, and similar conditions adjust the character's derived numbers, but durations and recovery checks are manual.
- **Local accounts, not OAuth.** Fine for a private group; use HTTPS before exposing the site outside a trusted network.
- **Search is keyword-based.** The compendium search covers every supported entry type, but there is no natural-language rules assistant.
- **Some source entries have no rules text.** The library shows their statistics and an explicit fallback rather than inventing text.
- **The host is one process and one SQLite file.** Back up `data/` regularly; use the included backup commands.
- **No Paizo art is shipped.** Uploaded maps and portraits remain the responsibility of the person uploading them.

---

## Licensing and attribution

- Runehall's source code is MIT-licensed.
- Rules data is generated from the [Foundry VTT PF2e system](https://github.com/foundryvtt/pf2e), distributed under the **Apache License 2.0**. The generated compendium preserves source/license metadata.
- Pathfinder Second Edition rules content is published under the **ORC License**. Pathfinder and all related marks are trademarks of Paizo Inc.
- Fonts: **Cinzel** and **Source Sans 3**, licensed under the SIL Open Font License.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
