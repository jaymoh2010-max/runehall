# Runehall — product and architecture plan

## 1. Vision

Runehall is the single browser tab a Pathfinder 2e group keeps open all session:

- **Players** build and level a character, see their sheet, roll from it, move a token, and read the shared chronicle.
- **The GM** prepares maps and tokens, reveals the dungeon, runs initiative and monsters, writes session notes, and keeps the party's data in one place.
- **The table** runs locally first. Hosting is a deployment detail, not a prerequisite.

The target table size is one GM plus 4–10 players. That means the product should optimize for trust, low friction, and fast local operations rather than competitive anti-cheat or massive-scale infrastructure.

### Principles
1. **Local-first and portable.** SQLite + JSON compendium + uploaded files. No cloud account required.
2. **Real rules, honest gaps.** Show the actual PF2e math we can verify, and mark the places where the player/GM must decide.
3. **One source of truth.** Character sheet, token, campaign journal, and table log belong to the same campaign.
4. **Fast at the table.** Most actions should be one click or one drag. Searching a 6,000-feat archive should not stall the session.
5. **Readable by humans.** Exported character JSON and a documented data pipeline make the site repairable.

---

## 2. Delivery phases

### Phase 0 — Foundation (built)
- TypeScript React client, Fastify API, Socket.IO real-time channel.
- SQLite schema for users, sessions, campaigns, members, characters, scenes, tokens, messages, state, and journal entries.
- Local accounts, sessions, campaign invite codes, GM/player roles.
- PF2e data ingestion pipeline.

### Phase 1 — Character forge (built, with known gaps)
- Ancestry → heritage → background → class → abilities → skills → feats → spells → gear → details → review.
- Real compendium content and live derived statistics.
- Class choice groups (doctrines, bloodlines, rackets, schools, instincts, etc.) driven by Foundry choice tags.
- Autosave, export/import, at-the-table sheet, local and campaign rolls.
- Known gaps: complex/story prerequisites, all feat/item effects, companion advancement, and exact split-caster casting restrictions.
- Feat and equipment pickers now show conservative automation badges, and level-1 fighter/wizard/rogue golden fixtures pin the derived math.
- Leveling up creates a persistent checklist of required boosts, skills, feats, and spell ranks.
- Feat, spell, and equipment pickers default to a recommended common-only view and rank exact/prefix name matches first.

### Phase 2 — Shared table (built, with known gaps)
- Scene upload, grid sizing, pan/zoom/fit, token drag/snap, hidden/locked/owned tokens.
- Party roster rail with avatar hover cards (HP, AC, saves, perception, speed, class/spell DC, conditions) and click-to-select token.
- Fog of war brush, measurement, pointer pings, presence.
- Server-authoritative dice with degrees of success, whispers, persistent chat.
- Initiative tracker and round/turn state.
- Known gaps: walls, lighting, vision, multi-token drag, templates, auras, token HP → sheet sync.

### Phase 3 — Campaign hub (built)
- My Campaigns dashboard for GM and players, with role, last played, and continuation.
- Shareable invite links and codes: signed-out users are prompted to authenticate, then choose or create a character and join.
- LAN-aware invite links for friends joining a locally hosted table.
- Party roster, character permissions, journal with visibility, settings, member management.
- Library and rules quick reference.
- Encounter builder with saved fights, bestiary counts, launch-to-table, and a GM-controlled Milestone/XP-budget toggle. GM can advance the party without XP bookkeeping.
- Loot parcels with compendium equipment, coins, and one-action distribution to a character sheet.
- Journal handouts with image attachments, shared/GM-only visibility, and a player-facing gallery.
- Campaign Overview with last-session summary, next-session details, party status, and shared or GM-only clue threads.
- Grouped bestiary tokens with formation dragging, aggregate group HP, and one initiative roll per group.
- GM-only NPC statblock library with optional art and one-click token placement.
- Shared session schedule with GM-managed attendance and automatic Overview date sync.
- Persistent bestiary palette with drag-to-map group placement.
- GM screen with level/simple DCs, condition lookup, secret rolls, and player roll requests.
- Campaign import with ID remapping and player-account matching, plus a dry-run-first unused-asset cleanup command.
- Next: optional automatic XP tracking, scene playlists, and hosting hardening.

### Phase 4 — Reliability and trust (in progress)
- [x] Per-campaign revisions, `campaign:revision` socket events, gap detection, and reconnect snapshot refresh.
- [x] Character autosave optimistic revisions with a conflict dialog.
- [x] Upload magic-byte validation and image dimension limits.
- [x] Readiness health check for SQLite and compendium.
- [x] Extracted, tested table socket/state layer (`useCampaignTable` + pure `tableEvents` reducers).
- [x] Forced-disconnect reconnect convergence test.

### Phase 5 — Table depth
- Walls/doors and dynamic light.
- Templates, auras, condition values/durations, multi-select, and a proper token context menu.
- Player-side group checks, combat-log filters, delay/ready actions.
- Scene playlists and GM-only preview.

### Phase 6 — Hosting and durability
- Docker image, Compose deployment, HTTPS reverse-proxy guide, security headers, CSP, origin checks, and auth/upload rate limits are built.
- Configurable registration (open, invite-only, closed), first-user administrator bootstrap, invite codes, local password recovery, self-service password change, and an audit log are built.
- Backups support retention pruning and documented cron/systemd/Task Scheduler automation plus a restore drill.
- The compendium manifest is pinned to the source commit.
- Remaining: optional Postgres/S3 adapters and built-in off-machine backup shipping.
- Multi-device uploads, asset library, and campaign import/export.
- Optional OAuth.

---

## 3. Architecture

### Runtime shape
```
Browser (React 19 + Vite)
  │  fetch /api/*           │  Socket.IO /socket.io
  ▼                         ▼
Fastify 5 ──────────────── Socket.IO server
  │  auth/campaign/table routes, static files
  ▼
SQLite (node:sqlite)   data/compendium/*.json   data/uploads/*
```

- **Client:** React, React Router, Zustand for session/toast stores, custom CSS design system, Socket.IO client.
- **Server:** Fastify 5, `@fastify/cookie`, `@fastify/multipart`, `@fastify/static`.
- **Database:** `node:sqlite` `DatabaseSync`, WAL mode, foreign keys. No native addon build required.
- **Compendium:** JSON files loaded into memory at boot, indexed for search; no external API at runtime.
- **Realtime:** Socket.IO rooms per campaign; GM room for private rolls/messages.
- **Auth:** scrypt password hashes, random session token stored as SHA-256 hash, HTTP-only SameSite=Lax cookie.

### Why these choices
- **SQLite via node:sqlite:** zero-config local persistence and no Windows native build pain.
- **Single process:** the server serves API, websocket, uploads, and built client. Easy to run on a home PC or small VPS.
- **JSON compendium:** rules data is static and read-mostly. Keeping it out of SQLite makes regeneration and attribution simple.
- **Server-side dice:** a shared log and consistent PF2e degree calculations; also supports secret GM rolls.
- **Socket state + REST snapshots:** socket events for fast in-session updates, REST for initial load, scene management, uploads, and recovery.

### Realtime protocol (summary)
- `campaign:join` verifies membership, joins `campaign:<id>` and, for GMs, `gm:<id>`.
- `token:move/create/update/delete`, `fog:update`, `scene:activate/update`, `initiative:*`, `chat:send`, `dice:roll`, `pointer`.
- Server persists every meaningful action and broadcasts the authoritative result.
- On reconnect, the client re-joins the campaign; the table data comes from the REST snapshot.

### Permissions
| Action | Player | GM |
| --- | --- | --- |
| View campaign/party/sheet | yes (campaign member) | yes |
| Edit own character | yes | yes (any) |
| Create scenes / upload maps | no | yes |
| Move tokens | own, unlocked | all |
| Reveal/hide fog | no | yes |
| Roll initiative / change turn | no | yes |
| Secret rolls | whisper to GM | GM-only |
| Journal write | no | yes |
| Journal read | visible entries | all |
| Invite/member settings | no | yes |

---

## 4. Data model (SQLite)

- `users` — account, display name, scrypt hash.
- `sessions` — hashed token, expiry.
- `campaigns` — name, description, GM, invite code, timestamps.
- `campaign_members` — campaign/user/role/joined.
- `characters` — owner, optional campaign, name, full JSON draft, derived summary.
- `scenes` — map URL, dimensions, grid size/offset, fog enabled, revealed cells.
- `tokens` — scene, character/owner links, position, size, color, HP, AC, conditions, hidden/locked.
- `messages` — chat/roll/system, author, payload JSON, all/GM visibility.
- `campaign_state` — active scene, initiative JSON, round, turn index.
- `journal_entries` — title, content, visible, author.

The character draft is a versioned JSON document (`CharacterDraft.version = 1`). The derived sheet is recomputed from the draft + compendium context on the client and on save for token summaries. This keeps rules changes deployable without migrating every character row.

---

## 5. PF2e rules engine scope

### Automated now
- Ability boosts/flaws from ancestry, background, class key ability, free boosts, and level 5/10/15/20 milestones, including the partial-boost rule above +4, with same-source uniqueness and level-1 cap.
- Class key-ability options discovered from class/subclass choices (e.g., psychic subconscious minds, rogue rackets).
- Starting proficiencies from class data plus later proficiency upgrades encoded in class-feature `subfeatures`, `ActiveEffectLike` rules, and `MartialProficiency` rules.
- Class/subclass choice groups extracted from Foundry ChoiceSet tags, including doctrine/bloodline/racket/instinct/school/hybrid study/etc.
- Fixed subclass skill training (rogue rackets, druid orders, investigator methodologies, swashbuckler styles, gunslinger ways, sorcerer bloodlines, oracle mysteries, witch patrons, summoner eidolons, kineticist gates, exemplar epithets).
- Cleric doctrine proficiency/feature progression (cloistered cleric, warpriest, battle creed), including favored-weapon rank upgrades.
- HP, AC (armor, Dex cap, shield raised, proficiency, Strength-based armor penalty waiver), saves, perception, class DC, spell DC/attack with class-specific spellcasting attributes.
- Skill training from background/class/deity, background skill and Lore choices (including rare/legacy backgrounds whose choices exist only in prose), Intelligence-based extra skills, skill increases (including training untrained skills), lore, armor check penalty.
- Attack/damage from equipped weapons, finesse/thief handling, thrown/ranged/propulsive, fist, deity favored weapons, gunslinger firearms, alchemist bombs, weapon specialization, and weapon proficiency categories.
- Equipment price/bulk/wealth and standard starting wealth.
- Full-caster, bounded-caster (magus/summoner/necromancer/psychic), animist, wizard-curriculum, cleric-divine-font, and champion focus spellcasting; spell slot tables by level and rank; spontaneous repertoire limits for bards, oracles, sorcerers, and summoners; prepared-spell tracking and slot-limit validation.
- Background granted feats and feat choices, class features by level, selected class options, automatic class-feature skill rank upgrades, and ancestry features/non-land speeds.
- Feat prerequisite checks for ability scores, proficiency ranks, prerequisite feats, class features/options, heritage, deity, spellcasting, senses, and age; story/campaign prerequisites are surfaced as manual checks.
- Validation checklist for missing/invalid choices.

### Deliberately manual / future
- Story/campaign prerequisites and unusual feat prerequisites that depend on unmodeled fiction, access, or affiliations.
- Automatic conditional bonuses and item rune effects.
- Prepared-vs-spontaneous slot enforcement (animist apparition slots and cleric divine font slots are counted, and divine font now has separate pips, but heal-or-harm casting restrictions are not enforced).
- Exact prepared-vs-spontaneous restrictions for split casters such as the animist.
- Psychic amps, focus-spell maximums from every feat, and focus spell selection restricted by class.
- Animist apparitions, animal companions, eidolons, familiars, constructs, and summon stat blocks. Bestiary-linked companion statblocks now prefills HP, AC, attacks, and abilities; advancement and companion-specific rules remain manual.
- Alchemical formula books and daily consumable preparation.
- Automatic language/sense grants from every feat, and paired background skill/Lore/feat choices that must be selected together.
- Spells with unusual action costs and heightening automation.
- Persistent damage tracking and full condition effect automation.

These gaps are surfaced in the interface rather than hidden so the table knows what to verify.

---

## 6. Testing and quality bar

- Unit tests for the dice parser/degree logic, core cleric math, spell slot tables, armor/favored-weapon rules, and compendium integrity/source values.
- `npm run simulate` generates valid characters across every class/level, ancestry/background, subclass option, random seeds, and a full feat-prerequisite sweep, then reports crashes/non-finite math/validation errors.
- TypeScript strict mode across client/server/shared.
- Manual browser verification of:
  - register/login, campaign create/join, player access and read-only sheet;
  - builder completion with real data and autosave;
  - sheet HP/condition persistence and rolls into chat;
  - map upload, scene activation, token creation/movement, fog reveal, initiative;
  - chat, dice, journal, settings, library.
- Production build (`npm run build`) and single-process server verification.

Future: Playwright happy-path tests, database backup/restore tests, and an import/export round-trip test.

---

## 7. Hosting later

1. Build the client, run the Fastify server behind a TLS reverse proxy (Caddy/Nginx).
2. Set `COOKIE_SECURE=1`, back up `data/runehall.db` and `data/uploads`.
3. Optionally move to Postgres + object storage if the group grows beyond a single machine.
4. Add invite-only registration or OAuth if exposed publicly.
5. Never expose the dev Vite server; use the production server.

The site binds to `0.0.0.0` by default so players on the same LAN can join at `http://<host-ip>:3001` (or 5173 in dev). Windows Firewall may prompt on first run.
