# Runehall — review and execution roadmap

## Review snapshot

### What is already solid
- A complete vertical slice exists: account → campaign → invite code → character builder → sheet → table.
- Real PF2e compendium data is local and searchable (ancestries, heritages, backgrounds, classes, feats, spells, equipment, deities, conditions, monsters).
- The core math engine is tested and useful: boosts, HP, AC, saves, perception, skills, attacks, spell DCs, full-caster slots, equipment budget, and level boosts.
- The table already covers the core Owlbear-style loop: map upload, scenes, token drag/snap, fog brush, measuring, pings, chat, server dice, initiative, and a party rail with live hover stats.
- Local-first security is reasonable for a private group: scrypt passwords, HTTP-only sessions, membership checks, GM-only socket actions, SQLite persistence.
- The UI has a distinct identity and deliberately responsive layouts.

### What is still prototype-level
- **Rules automation is partial.** Feat prerequisites are enforced for mechanical requirements, while complex/story prerequisites are flagged for review; some subclass/feature/item effects are manual; companions and split-caster casting restrictions are not automated. This can make a sheet look correct while missing situational bonuses.
- **Realtime recovery is incomplete.** On a socket reconnect the client rejoins the room but does not replay events missed while offline. Tokens, fog, chat, or initiative can become stale after a laptop sleeps or Wi-Fi drops.
- **No migrations, backup, or restore workflow.** The database only uses `CREATE TABLE IF NOT EXISTS`; future schema changes will not upgrade existing campaign databases. There is no one-command backup for SQLite + uploads.
- **Table polish is thin around tokens and scenes.** No token context menu, token image upload/edit, conditions with values on tokens, attack/damage shortcuts, templates, walls, lighting, or robust grid calibration.
- **Content volume needs curation.** The builder exposes 540 backgrounds and 29 classes by default. That is impressive, but overwhelming; not every option has the same automation quality.
- **Test coverage is now unit + smoke + simulation.** Dice, rules math, compendium integrity, and content tiers are unit-tested; the GM/player campaign flow has an automated smoke test; `npm run simulate` generates valid characters across the matrix. Upload and edge-case auth coverage still rely on manual checks.
- **Large UI files are becoming bottlenecks.** `CharacterBuilderPage.tsx` and `VttTable.tsx` carry a lot of responsibility. Any major builder or table feature should include a split into smaller components.

### Highest-risk issues (fix before adding lots of features)
1. Losing campaign data or failing to upgrade a database.
2. A long session going stale after a disconnect.
3. A player trusting a sheet number that is wrong because a feat/item/subclass effect was not applied.
4. Accumulating gameplay bugs with no E2E safety net around the GM/player loop.

---

## Recommended order

**Campaign lifecycle → stabilize → make the table excellent → deepen the builder → add GM prep tools → harden for hosting.**

The campaign lifecycle is now in place: a GM can create a campaign, share a link/code, and a player can create an account, choose or create a hero, and land in a campaign that persists under **My Campaigns** for both roles.

The character builder is already good enough for a core campaign at low levels. The larger remaining risk is trusting a long-running campaign to a system without backup and reconnect recovery. The table is the strongest differentiator versus Pathbuilder, so it deserves the next big UX investment after the safety work.

---

## Sprint 1 — Campaign lifecycle and My Campaigns (completed in this pass)

**Goal:** make it effortless for a GM to recruit players and for everyone to return to the same table later.

- [x] Public invitation route: `/join/:code`.
- [x] Invitation preview with campaign name, premise, GM, member count, and character count.
- [x] Signed-out friends are prompted to create an account or sign in, then returned to the invitation.
- [x] Signed-in friends choose:
  - create a new character and go straight to the builder,
  - bring an unassigned existing character,
  - or join without a character and create one later.
- [x] The character is assigned to the campaign as part of joining.
- [x] Invite modal with copyable **link** and **code**, plus LAN-aware links for friends on another device.
- [x] “My Campaigns” dashboard section for both GM and players, with role, last played, member/character counts, and **Continue campaign**.
- [x] Join form accepts either a bare invite code or a full invite link.
- [x] Existing members opening an invite link see an “already at the table” state.
- [x] Realtime `character:created` event so the GM's table/party rail can pick up a newly joined player's character without a reload.

**Acceptance:** GM creates a campaign, sends a link, friend registers, creates a character, and both accounts see the same campaign under My Campaigns. The campaign persists through logout, restart, and a new session. Verified in the browser and via API.

---

## Sprint 2 — Trust, recovery, and test harness (in progress)

**Goal:** make the current app safe enough for an ongoing campaign.

- [x] **Schema migrations**
  - Added `schema_migrations` + `PRAGMA user_version`, with `001_initial_schema` containing the full baseline.
  - Future columns/tables must be added as new migration files, never by editing a shipped migration.
  - Verified an existing database upgrades in place.
- [x] **Backup and restore**
  - `npm run backup` creates a consistent SQLite snapshot using `VACUUM INTO`, copies uploads, and records the compendium manifest.
  - `npm run restore -- --from <dir> --yes` refuses to run while the server is live, keeps a pre-restore safety copy, and restores DB + uploads.
  - Documented in `docs/BACKUP.md`.
- [x] **Campaign JSON export**
  - GM → Settings → Campaign archive exports campaign, members, characters, scenes, tokens, messages, journal, initiative, and asset URLs. Import is still a future item.
- [x] **Realtime resynchronization**
  - The table refetches its authoritative snapshot after socket reconnects and when the tab wakes from hidden.
  - Chat is merged by message ID; scenes/tokens/initiative/fog are replaced from the snapshot.
  - Toolbar shows **Live / Reconnecting… / Offline**.
  - Remaining: a revision/sequence number to prove ordering under rapid concurrent events.
- [x] **Error boundary and recovery UX**
  - Added a route-level React error boundary with reload/home recovery.
  - Autosave already surfaces failures instead of silently claiming “Saved”.
- [x] **Two-user automated smoke test**
  - `npm run smoke` starts an isolated server with a throwaway database, registers a GM and player, creates/joins a campaign, assigns a character, moves a player-owned token, verifies GM socket updates and chat, and cleans up.
- [x] **Split oversized files (core)**
  - `CharacterBuilderPage.tsx` is now a ~750-line shell over 11 focused step modules plus a shared builder kit.
  - `VttTable.tsx` now uses `VttToolbar` and `VttTokenPanel`; the remaining extraction target is the socket/state hook.

---

## Sprint 3 — Make the table the reason to use Runehall

**Goal:** run a full combat and exploration session without needing Owlbear.

- [x] **Token interaction upgrade**
  - Right-click a token to open the editor, or select it and choose **Edit token**.
  - Upload/replace token art, or use initials.
  - HP current/max, AC, size, color, hidden/locked, owner, conditions, and linked-character HP sync.
  - Quick damage/heal controls (−5, +5, Full, Down).
  - Verified by creating a token, setting 24/30 HP, AC 18, and Frightened 1, then seeing those values in the token panel and initiative chip.
  - Remaining: drag-and-drop image onto a token, temp HP, and a full right-click context menu instead of opening the editor directly.
- [x] **Scene polish (core)**
  - Scene duplication copies grid, fog, and tokens.
  - Grid calibration shows a live SVG overlay while adjusting grid size and offsets.
  - Fog now renders at capped scene resolution with offset-aware cells, so non-zero grid offsets align.
  - Verified duplication and the calibration preview in the browser.
  - Remaining: scene reordering, activate-on-create, background color, thumbnails, and player-safe preview.
- [x] **Chat and dice improvements (core)**
  - GM roll requests (“Perception · 1d20+7 · DC 18”) post a card with **Open dice tray**.
  - The player card prefills formula, label, and DC.
  - Covered by the two-user smoke test.
  - Remaining: group checks, history filters, GM message deletion, combat log, and a character modifier picker.
- [x] **Initiative and combat bar (core)**
  - Chips show HP, AC, and condition count with full details on hover; wounded chips change color.
  - Individual reroll is available to the GM and is covered by the smoke test.
  - Encounter state already persists through `campaign_state`; late joiners receive the current order.
  - Remaining: delay/ready actions, tie handling, and explicit NPC add flow.
- [x] **Table ergonomics (core)**
  - Focusable, keyboard-operable map tokens; party rail avatars remain keyboard accessible.
  - Full-screen button with a theater-mode fallback for embedded browsers.
  - Shortcuts: R/H fog, M measure, T token, E edit, I initiative, ←/→ turn, F full screen, C chat, P party, Esc clear.
  - Verified measure/chat/party toggles and theater mode in the browser.
  - Remaining: pan/fit/chat-focus hotkeys and a shortcut cheatsheet beyond the toolbar hint.
- [x] **Party rail enhancements (core)**
  - Online/offline dot driven by socket presence; on-scene ring remains.
  - Hover card shows HP, AC, saves, perception, speed, DCs, hero points, conditions, and owner presence.
  - Click selects the token; double-click opens the sheet.
  - Remaining: quick damage and ping actions directly from the hover card.

**Acceptance status:** the desktop table can run a combat with token editing, fog, grid calibration, scene duplication, initiative, HP/condition tracking, roll requests, presence, and keyboard/full-screen operation. Group checks, combat-log filters, and some scene-management niceties remain for a later polish pass.

---

## Sprint 4 — Close the most damaging builder gaps

**Goal:** trust the numbers for a normal core campaign, without trying to reproduce every Foundry rule element.

1. **Content quality tiers (complete for the current builder)**
   - Tier 1 defaults to Player Core, Player Core 2, Core Rulebook, GM Core, and Monster Core.
   - Every builder picker has an **Expanded sources** toggle; the choice is stored on the character draft.
   - Picker detail panels show a **Core** or **Expanded** badge, and expanded lists warn that some effects may need manual tracking.
   - Campaign creation now exposes a GM-controlled ruleset: **Core Remastered**, **Expanded Remastered**, or **Legacy + Remastered**. Players inherit it; the builder locks source/legacy toggles for campaign characters.
   - Verified default core backgrounds: 63 shown vs. 262 remastered options when expanded.
   - Remaining: granular per-option automation levels beyond Core/Expanded.

2. **Feat prerequisite validation (complete for the current rules engine)**
   - Level, ability modifier, proficiency, skill/Lore, feat, class feature/option, ancestry/heritage/deity, casting, focus pool, and common trait prerequisites are parsed.
   - Feats with definitively unmet prerequisites are hidden from future choices and cannot be selected.
   - Complex story/campaign prerequisites remain visible with a **Check prereqs** warning.
   - Replacing a feat evaluates the slot as empty, so the feat being replaced cannot satisfy its own prerequisites.
   - Feat category and slot-level mismatches are hard validation errors.
   - Remaining: expand parser coverage for unusual narrative requirements as they are reported. GM overrides are intentionally deferred.

3. **Curated rule overrides for known gaps (deferred)**
   - The current Foundry import already carries subclass proficiencies; Warpriest/Battle Creed armor and save ranks are covered by data tests.
   - Keep a small explicit override layer ready for concrete reported gaps rather than guessing at one now.
   - Acceptance remains: any reported common subclass must affect AC/saves/proficiencies correctly.

4. **Gear and runes (core complete)**
   - Weapon and armor potency, striking, resilient, and property runes can be attached per item.
   - Attached runes count toward wealth, replace the previous fundamental rune in their category, and enforce property-rune slots from potency.
   - Weapon potency and striking change attack/damage; armor potency and resilient change AC/all saves; common energy property runes add separate typed damage rolls.
   - Verified in-browser: +1 striking longsword changed +15/1d8 to +16/2d8 and +1 armor potency raised AC from 22 to 23.
   - Reinforcing shield runes now raise Hardness/HP with their printed caps, and the sheet shows shield durability.
   - The builder charges the current rune’s full price, which equals its base price plus any upgrade cost; purchase history is not tracked.
   - Remaining: full property-rune effect coverage.

5. **Spellcasting depth (core complete)**
   - Prepared casters now stop preparing once a rank’s slots are full.
   - Duplicate prepared castings are supported with a per-spell counter.
   - Spell slot pips can be reset in one click; cleric divine font and wizard curriculum slots are shown in the slot totals.
   - Spontaneous repertoire limits and prepared-slot validation are covered by shared tests.
   - Verified in-browser: a wizard with four rank-1 slots showed 4/4 prepared and disabled a fifth preparation.
   - Remaining: separate divine-font slot tracking and full spellbook-vs-known presentation for all prepared classes.

6. **Companions and print (manual roster complete)**
   - Animal companions, familiars, eidolons, and summons can be recorded with name, kind, level, HP, AC, and attack notes.
   - Companion roster appears on the character sheet and in print output.
   - Added a Print/PDF action with a print stylesheet that removes app chrome.
   - Remaining: bestiary-linked companion stat blocks and automated companion advancement.

7. **Guided level-up (first pass complete)**
   - The Level up action previews HP, new feat slots, skill increases, spell ranks, ability boosts, and class features.
   - Choosing a preview item advances the character and jumps into that chapter.
   - Remaining: full step-by-step level-up wizard with prerequisite explanations.

Then immediately add **guided level-up**: a dedicated “Level up” flow that explains each new choice and validates the result without making the player hunt through chapters.

---

## Sprint 5 — GM prep and campaign continuity

**Goal:** make Runehall useful between sessions, not just during them.

- [x] **Encounter builder (core)**
  - Campaign-level **Milestone / XP budget** toggle. Milestone hides encounter XP; XP mode shows creature XP, party-size thresholds, difficulty, and the XP each PC earns.
  - Saved encounters per campaign with scene assignment, notes, monster counts, and custom NPCs.
  - Bestiary search and level filtering; add one or many copies of a creature.
  - Launch creates numbered monster tokens on the scene, starts a fresh initiative order, and activates the scene.
  - GM-only writes and reads; players never see encounter prep.
  - Campaign export now includes encounters.
- [x] **GM party advancement**
  - **Level up party** on the Party tab advances every campaign character by one level and refreshes sheets and linked tokens.
  - Players finish their new feat, skill, and spell choices in the builder.
- [x] **Loot parcels (core)**
  - GM-only treasury with saved parcels, item rows, quantities, and coin totals.
  - Equipment search respects the campaign ruleset and adds items from the compendium.
  - **Give loot** merges equipment stacks into the chosen character, adds coins, recomputes the sheet, and refreshes linked tokens.
  - Distributed parcels stay as a record and cannot be edited or handed out twice.
  - Campaign export now includes loot parcels.
- [x] **Handouts and journal attachments (core)**
  - Journal entries can be **entries** or **handouts**.
  - Attach up to 12 local images with a thumbnail gallery and a full-size preview.
  - Shared entries expose their images to players; GM-only handouts and their images stay hidden.
  - Journal filter for **All / Entries / Handouts**, visible to the whole table.
  - Campaign export includes journal kinds and attachments.
- [x] **Campaign dashboard (core)**
  - New **Overview** tab with last-session summary, next-session date, shared teaser, and GM-only notes.
  - Party status cards show level, HP, AC, conditions, and unfinished-character count.
  - Clue/quest threads can be marked done, shared with players, or kept GM-only.
  - Quick actions jump to the table, party, journal, encounters, or loot.
  - Players receive a filtered read-only view; GM-only notes and threads never leave the server.
  - Campaign export includes the dashboard.
- [x] **Bestiary grouping (core)**
  - Bestiary tokens can be placed as a group of 1–20 with numbered names and shared group metadata.
  - Dragging any group member moves the whole formation.
  - The token panel shows aggregate group HP and can damage or heal every member at once.
  - Grouped monsters roll one initiative entry (for example, “Goblin Warrior ×3”).
  - Encounter launches now create grouped tokens automatically.
  - A persistent, non-modal **Bestiary** palette supports search, level filtering, group counts, and drag-to-map placement.
- [x] **NPC/statblock library (core)**
  - GM-only library of recurring allies, villains, and custom creatures.
  - Each NPC stores level, HP, AC, perception, size, token color, optional token art, and statblock notes.
  - **Place token** creates a token on the active or chosen scene with the saved combat basics.
  - NPCs are included in campaign export and never exposed to players.
  - Remaining: import/duplicate an NPC from the bestiary in one step.
- [x] **Session scheduling and attendance**
  - Shared **Sessions** tab with upcoming and past sessions, dates, duration, and status.
  - GM can schedule, edit, delete, and mark sessions played.
  - GM records attendance as attended, late, absent, excused, or unmarked.
  - Players see the schedule and their own attendance only; GM notes stay hidden.
  - The next scheduled session syncs to the Overview dashboard automatically.
  - Campaign export includes sessions and attendance.
- [x] **GM screen**
  - Quick level-based DC reference with Easy/Normal/Hard/Very Hard/Incredibly Hard adjustments.
  - Simple DCs for Untrained through Legendary, clickable into the roll form.
  - Searchable condition reference with full descriptions.
  - Secret rolls post only to GM chat; roll requests go to the shared table chat.
  - Live socket status and last secret-roll result.
- [x] **Campaign import (core)**
  - Imports a `.runehall.json` export as a new campaign.
  - Remaps campaign, scene, token, character, loot, encounter, and session IDs.
  - Matches player accounts by username; unmatched character owners fall back to the importing GM.
  - Imports characters, scenes, tokens, journal/handouts, encounters, loot, dashboard, NPCs, sessions, attendance, messages, and initiative state.
  - Uploaded image files are not copied; use a full backup archive to move assets between machines.
- [x] **Asset cleanup**
  - `npm run cleanup-assets` scans every database table for `/uploads/` references and reports unused files.
  - Dry-run by default; `--delete` removes only unreferenced files, and `--verbose` lists them all.
- [ ] Automatic XP tracking (intentionally skipped for now).

Acceptance: a GM can prepare a full session in Runehall and start it with one “Activate scene / roll initiative” flow.

---

## Sprint 6 — Hosting and hardening

- [x] **Docker deployment path**
  - Multi-stage `Dockerfile` and `docker-compose.yml` with persistent `data/` and `backups/` volumes.
  - Non-root runtime, health check, and production client build.
  - `docs/DEPLOY.md` covers local production, Compose, Caddy/Nginx HTTPS, updates, and backups.
- [x] **Baseline hardening**
  - Security headers: nosniff, frame protection, referrer policy, permissions policy, and cross-origin isolation.
  - Production CSP with a development opt-in.
  - `COOKIE_SECURE=1` adds HSTS.
  - Same-origin enforcement for state-changing API requests in production, with `TRUSTED_ORIGINS` escape hatch.
  - In-memory fixed-window rate limits for login/register and uploads.
- [x] **Accounts and accountability**
  - Configurable registration: open, invite-only single-use codes, or closed.
  - First account on a fresh install becomes the instance administrator.
  - Admin **Hall controls** page for registration mode, invite codes, and the audit log.
  - Self-service password change from **Account & security**, which signs out other sessions.
  - Local recovery command: `npm run reset-password -- --username <name>`, with `--admin` and `--list`.
  - Audit log for sign-ins, failed sign-ins, password changes, campaign creation/deletion, member removal, party level-ups, and administrative actions.
- [x] **Backup automation and restore drill**
  - `npm run backup -- --keep N` prunes older archives.
  - Cron, systemd timer, Windows Task Scheduler, and Docker examples.
  - Documented restore drill covering database, uploads, audit entries, and handout images.
- [x] **Compendium pinning**
  - Ingest records `sourceCommit`, `sourceRef`, and `sourceDirty` in `data/compendium/manifest.json`.
  - Current data pinned to Foundry PF2e commit `be611895ec16d4672f53d014527d9007b06cb409`.
- [ ] Postgres and object-storage adapters if the group grows beyond one machine.
- [ ] Off-machine backup shipping built into the app (currently delegated to rsync/rclone/restic).

---

## Content strategy recommendation

Do not claim full Pathbuilder parity until the Tier 1 list is genuinely automated. It is better to say:

> “These core options are fully automated. Expanded content is available, but some effects may be manual.”

That is more trustworthy than silently showing a number that may be missing a +1 circumstance bonus. Add source and automation badges to class/feat/item cards.

---

## What not to do yet

- Do not build walls/lighting before realtime recovery and backups.
- Do not attempt a full Foundry rule-element interpreter as the next step.
- Do not add public hosting before the backup/reconnect work.
- Do not add more all-content pickers without a source/quality filter.
- Do not let `CharacterBuilderPage.tsx` or the remaining `VttTable.tsx` state layer grow unchecked; extract the socket/state hook before the next major table feature.

---

## Recommended next session

Sprint 3’s core table workflow is complete. Before Sprint 4:

1. add bestiary-linked companion/familiar/eidolon stat blocks,
2. separate divine-font slot tracking and finish spellbook-vs-known presentation,
3. expand the guided level-up into a full step-by-step wizard,
4. extract `VttTable`’s socket/state hook and modal layer when table work resumes,
5. finish the small table-polish leftovers: filterable combat log, group checks, scene reordering, and party-card quick actions.

Keep the two-user smoke test green as new socket events are added.
