# Runehall - review and execution roadmap

> **Product reset.** The current core is the table plus the character sheet:
> maps, tokens, fog, dice/chat, soundtrack, manual initiative, compendium/bestiary,
> and campaign invites/party/journal. Combat automation is intentionally off.
> Sprints below are historical notes unless the section says otherwise.

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
- **Realtime recovery is revision-aware.** Reconnects refetch the authoritative table, campaign revisions detect missed events, character saves reject stale writes, and the table socket/state layer now lives in a tested hook with pure event reducers.
- **Table polish is deep.** AoE templates, condition values/durations, multi-select, group drag, bulk actions, scene playlists, generated thumbnails, combat-log filters, group checks, delay/ready/ties, first-run setup, GM-drawn walls/doors, line-of-sight fog, per-token vision radii, light sources, normal/low-light/darkvision senses, shared/per-player vision, explored-area memory, ten categorized built-in battle maps, layered scene props, wall/closed-door movement collision, per-token light colors, cover/concealment readouts, shared freehand drawing tools with GM erase/clear controls, a Golarion calendar, quest handouts with one-time XP rewards, and a campaign soundtrack are built. Sample-accurate audio sync and full dynamic shadow-casting remain future work.
- **Content volume needs curation.** The builder exposes 540 backgrounds and 29 classes by default. That is impressive, but overwhelming; not every option has the same automation quality.
- **Test coverage is unit + smoke + browser E2E + simulation.** Dice, rules math, compendium integrity, content tiers, security, and migrations are unit-tested; the GM/player campaign flow and registration/admin flows have an automated smoke test; Playwright covers registration, admin audit controls, campaign creation, the character builder and sheet, compendium routes, player-safe campaign access, and table interactions (token placement, chat, dice rolls, and the scenes manager). Upload edge cases (bad signatures, mismatched/unsupported types, empty files, oversized files and dimensions, foreign campaigns, and cleanup after rejection) are covered by the smoke test.
- **Code health has guardrails.** Route-level splitting keeps the entry bundle near 107–122 KB gzip, and `npm run check` now covers types, lint (ESLint), formatting (Prettier), tests, build, and bundle budgets. The table state layer is tested; some large components remain.
- **Operations are on solid footing.** The Docker image is built and health-checked in CI, backup shipping is checksum-verified and automated, the restore drill has passed on a clean CI runner, the audit log supports retention and CSV export, and Playwright covers the main GM/player browser flows. Uploads validate magic bytes and image dimensions.

### Highest-risk issues (fix before adding lots of features)
1. Losing campaign data or failing to upgrade a database.
2. A long session going stale or diverging after concurrent edits or a disconnect.
3. A player trusting a sheet number that is wrong because a feat/item/subclass effect was not applied.
4. Accumulating gameplay bugs with no browser E2E safety net around the GM/player loop.

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

## Sprint 2 — Trust, recovery, and test harness (completed)

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
  - Scene duplication copies grid, fog, tokens, templates, and walls.
  - Grid calibration shows a live SVG overlay while adjusting grid size and offsets.
  - Drag across a chosen number of map squares to set the grid pitch and both offsets in one gesture.
  - The scale control resizes the canvas, grid, and offsets together so large maps stay manageable without losing alignment.
  - The ruler uses PF2e diagonal movement: 5 feet, then 10 feet, alternating.
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
  - Shortcuts: R/H fog, M measure, D draw, E erase, T token, I initiative, ←/→ turn, F full screen, C chat, P party, Esc clear.
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

2. **Common heritage mechanics (first pass complete)**
   - A curated mechanics table covers Skilled Human, Versatile Human, Ancient Elf, Aiuvarin, Dromaar, Nephilim, Changeling, Dhampir, Dragonblood, and Duskwalker.
   - Heritage skill/feat choices are stored in `featChoices`, so they do not consume normal feat slots.
   - Versatile and Ancient Elf feats enter the character context, prerequisite checks, and curated effect engine; class feats granted by Ancient Elf bypass only the class-access restriction.
   - Senses, granted traits, language options, and manual notes flow into the builder and sheet.
   - Remaining: normalize the upstream Foundry `Sense`/`GrantItem` rules at ingest so the curated table can shrink.

3. **Feat prerequisite validation (complete for the current rules engine)**
   - Level, ability modifier, proficiency, skill/Lore, feat, class feature/option, ancestry/heritage/deity, casting, focus pool, and common trait prerequisites are parsed.
   - Feats with definitively unmet prerequisites are hidden from future choices and cannot be selected.
   - Class feats with recognizable class traits are blocked when they belong to another class, even with the class filter off. Background starting feats enter the context, prerequisite, and effect pipeline.
   - Core selections and picker choices update the summary and step status before the next autosave; navigating to the sheet flushes the pending save.
   - Complex story/campaign prerequisites remain visible with a **Check prereqs** warning.
   - Replacing a feat evaluates the slot as empty, so the feat being replaced cannot satisfy its own prerequisites.
   - Feat category and slot-level mismatches are hard validation errors.
   - Remaining: expand parser coverage for unusual narrative requirements as they are reported. GM overrides are intentionally deferred.

4. **Curated rule overrides for known gaps (deferred)**
   - The current Foundry import already carries subclass proficiencies; Warpriest/Battle Creed armor and save ranks are covered by data tests.
   - Keep a small explicit override layer ready for concrete reported gaps rather than guessing at one now.
   - Acceptance remains: any reported common subclass must affect AC/saves/proficiencies correctly.

5. **Gear and runes (core complete)**
   - Weapon and armor potency, striking, resilient, and property runes can be attached per item.
   - Attached runes count toward wealth, replace the previous fundamental rune in their category, and enforce property-rune slots from potency.
   - Weapon potency and striking change attack/damage; armor potency and resilient change AC/all saves; common energy property runes add separate typed damage rolls.
   - Verified in-browser: +1 striking longsword changed +15/1d8 to +16/2d8 and +1 armor potency raised AC from 22 to 23.
   - Reinforcing shield runes now raise Hardness/HP with their printed caps, and the sheet shows shield durability.
   - The builder charges the current rune’s full price, which equals its base price plus any upgrade cost; purchase history is not tracked.
   - Remaining: full property-rune effect coverage.

6. **Spellcasting depth (core complete)**
   - Prepared casters now stop preparing once a rank’s slots are full.
   - Duplicate prepared castings are supported with a per-spell counter.
   - Spell slot pips can be reset in one click; cleric divine font and wizard curriculum slots are shown in the slot totals.
   - Sorcerer and Oracle now use the correct level-1 three-slot spontaneous table.
   - A bloodline/patron/eidolon-derived tradition is required before ordinary spells can be added, class cantrip caps are shown, and Cleric non-font preparation produces an advisory warning.
   - Fixed class-choice grants apply Druid order feats/focus spells, Bard muse feats/repertoire spells, Wizard school focus spells and thesis feats, Sorcerer bloodline focus spells, and Cleric doctrine feats. Higher-rank bloodline gifts, Sorcerer/Wizard advanced focus spells, Oracle mystery spells and revelations, full school curricula, Runelord sins, and Rooted Wisdom branches are granted automatically.
   - Spontaneous repertoire limits and prepared-slot validation are covered by shared tests.
   - Character sheets take a long rest, preview the reset, and open daily preparations; prepared casters choose ranked spells and prepared cantrips, with pending reminders in the sheet, builder, party rail, dashboard, and campaign party cards.
   - Focus-only classes get their own spell attack/DC, innate spells use a separate Charisma-based profile, and the sheet uses the correct source per spell row.
   - Class grants cover psychic conscious minds and psi cantrips, necromancer grave spells, summoner link spells, and cleric deity spells.
   - Cleric domains cover Domain Initiate, Expanded Domain Initiate, and repeated Advanced Domain picks, including alternate domains and rank-4 advanced focus spells. Domain Spirit and Advanced Domain Spirit grant a spirit-linked initial and advanced domain spell, and Domain Focus is documented.
   - Oracle mysteries grant their listed granted spells, and Advanced/Greater Revelation grant their focus spells; Domain Acumen and Domain Fluency remain limited to the domains associated with the chosen mystery.
   - Prepared casters use class-specific source labels: spellbook for wizard/magus, familiar for witch, dirge for necromancer, and spell list for cleric/druid/animist; spontaneous casters keep repertoire.
   - Learn a Spell computes the rank/rarity gold cost and rank DC, deducts the gold, adds the spell to a spellbook/familiar/dirge, and marks it as a paid addition; spellbook classes show starting contents, free-pick counts, the two-free-spells-per-level budget, and a warning when free picks exceed it.
   - Fixed-tradition spellcasting dedications grant a separate dedication-cantrip list, ranked dedication spells, Basic/Expert/Master slot pools, and higher-slot heightening; sorcerer, witch, and summoner dedications ask for their tradition in the builder.
   - Sustained spells are recorded when cast, listed on the sheet, and can be ended; ritual rows open a detail card with cost, requirements, full text, structured primary and secondary checks for most rituals, and a primary-check skill override, then roll the chosen skill.
   - Magus studious slots scale at 7th/11th/13th level; the builder and daily preparations only allow Gecko Grip, Haste, Fly, and the chosen hybrid study's studious spells.
   - Animist prepared slots and spontaneous apparition slots are separate, with all 14 apparitions, daily attunement, signature-style heightening, and the primary vessel focus spell.
   - Spontaneous casters track the ranks at which each spell is known; rank copies count against the matching repertoire limit, signature spells heighten upward, and non-signature spells can downcast from higher slots.
   - Psychic psi cantrips expose an Amp cast that spends 1 Focus Point, with curated amp summaries and heightened notes in the builder and sheet; the base cantrip stays at will.
   - The table shows a turn-start Sustain reminder for the active character, with a one-click Sustain acknowledgement and per-spell End.
   - Scrolls expose a Cast scroll action that filters by the character's spell list and consumes the scroll.
   - Generic Magic Wands expose a Cast wand action that filters by the wand's rank and records one daily use until a long rest; fixed-spell specific wands cast directly; flexible wands open the picker at their listed rank with the special effect left manual; Cyrusian wands filter to illusions.
   - Staves expose parsed spell lists and a manual charge pool, charge in daily preparations, spend charges by spell rank, can spend a spell slot instead of charges, and empty on a long rest; plain-text lists and referenced staff lists are covered, and each staff shows its special-effect prose. Bonuses and triggered effects remain manual.
   - Verified in-browser: a wizard with four rank-1 slots showed 4/4 prepared and disabled a fifth preparation; an animist cast Sure Strike from an apparition slot while the prepared rank-1 slot stayed full; a sorcerer learned Fireball at ranks 3 and 5, downcast it from a rank-4 slot, cast it from a rank-3 scroll that was consumed, cast it from a generic rank-3 wand that showed Used today, cast Lightning Bolt directly from a specific rank-3 wand, cast Grease from a flexible rank-1 wand, and charged and cast Heal from a Staff of Healing; a psychic amped Telekinetic Projectile and spent one focus point; a sustained Flaming Sphere produced a table reminder and ended cleanly.
   - Remaining: devotion spell variants, automated staff bonuses/triggers, and a dedicated spellbook/repertoire data split.

7. **Companions and print (manual roster complete)**
   - Animal companions, familiars, eidolons, and summons can be recorded with name, kind, level, HP, AC, and attack notes.
   - Companion roster appears on the character sheet and in print output.
   - Added a Print/PDF action with a print stylesheet that removes app chrome.
   - Remaining: bestiary-linked companion stat blocks and automated companion advancement.

8. **Guided level-up (first pass complete)**
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
- [x] **Handouts and journal attachments (core)**
  - Journal entries can be **entries** or **handouts**.
  - Attach up to 12 local images with a thumbnail gallery and a full-size preview.
  - Shared entries expose their images to players; GM-only handouts and their images stay hidden.
  - Journal filter for **All / Entries / Handouts**, visible to the whole table.
  - Campaign export includes journal kinds and attachments.
- [x] **Bestiary grouping (core)**
  - Bestiary tokens can be placed as a group of 1–20 with numbered names and shared group metadata.
  - Dragging any group member moves the whole formation.
  - The token panel shows aggregate group HP and can damage or heal every member at once.
  - Grouped monsters roll one initiative entry (for example, “Goblin Warrior ×3”).
  - Encounter launches now create grouped tokens automatically.
  - A persistent, non-modal **Bestiary** palette supports search, level filtering, group counts, and drag-to-map placement.
- [x] **NPC and hazard library (core)**
  - GM-only library of recurring allies, villains, custom creatures, and custom hazards.
  - Each entry stores level, HP, AC, perception, size, token color, optional token art, and statblock notes; hazards add complexity, trigger, disable, and routine text.
  - **Place token** creates a token on the active or chosen scene with the saved combat basics.
  - Hidden entries never reach players; visible NPCs are shared through the People tab, while hazards stay GM-only.
  - Remaining: import/duplicate an NPC from the bestiary in one step, and bundle compendium hazard presets.
- [x] **GM screen**
  - Quick level-based DC reference with Easy/Normal/Hard/Very Hard/Incredibly Hard adjustments.
  - Simple DCs for Untrained through Legendary, clickable into the roll form.
  - Searchable condition reference with full descriptions.
  - Secret rolls post only to GM chat; roll requests go to the shared table chat.
  - Live socket status and last secret-roll result.
- [x] **Campaign import (core)**
  - Imports a `.runehall.json` export as a new campaign.
  - Remaps campaign, scene, token, character, encounter, and message IDs.
  - Matches player accounts by username; unmatched character owners fall back to the importing GM.
  - Imports characters, scenes, tokens, journal/handouts, encounters, NPCs, messages, and initiative state.
  - Uploaded image files are not copied; use a full backup archive to move assets between machines.
- [x] **Pathbuilder 2e character import**
  - The dashboard's Characters section accepts a pathbuilder2e.com JSON export.
  - The public invite page also offers **Import from Pathbuilder** for players joining a campaign.
  - Matches ancestry, heritage, background, class, deity, feats, skills, gear, spells, lores, and money by name against the local compendium.
  - Returns a report of unmatched names and warnings instead of guessing.
  - Weapon/armor/shield runes (potency, striking, resilient, reinforcing, and property runes), prepared-slot duplicates, and pets/familiars (as companions) are imported.
  - Dual-class and play state remain manual; pet statblocks need review, and imported characters open in the builder for review.
  - Imported join requests stay outside the campaign until the GM approves them from **Campaign → Settings → Join requests**; declining leaves the character in the player's library.
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
  - Current data pinned to Foundry PF2e commit `a70593f7d52ba6357c3bdc05c09dcb9d4f2765dc`.
- [ ] Postgres and object-storage adapters if the group grows beyond one machine.
- [ ] Off-machine backup shipping built into the app (currently delegated to rsync/rclone/restic).

---

## Sprint 7 — Realtime correctness and data integrity

**Goal:** trust the table through disconnects, reconnects, and concurrent edits.

- [x] **Versioned campaign state**
  - Per-campaign monotonic `revision` counter, bumped on every persisted table mutation through `touchCampaign`/`bumpCampaign`.
  - REST snapshots return the revision; socket clients receive `campaign:revision`.
  - The table ignores stale revisions and refetches the snapshot when it detects a gap.
- [x] **Character conflict detection**
  - Characters carry an optimistic `revision`.
  - Saves may include `expectedRevision`; stale writes return `409` with the current server draft.
  - Builder and sheet show a conflict dialog with **Reload their version** and **Keep my changes**.
- [x] **Extract the table socket/state layer**
  - `useCampaignTable` owns table state and the Socket.IO subscription.
  - Pure reducers in `tableEvents.ts` apply token, fog, scene, chat, and character events.
  - Unit tests cover movement, deduplication, fog modes, scene deletion, chat merging, and character updates.
- [x] **Reconnect test**
  - The smoke test disconnects a player, mutates the token as the GM, reconnects, and verifies the snapshot position and revision advanced.
  - A pure `revisionAction` helper is unit-tested for stale, next, and gap cases.
- [x] **Upload hardening**
  - Image signatures are checked against the declared MIME type before a file is accepted.
  - PNG/GIF/JPEG/WebP dimensions are validated against a 12,000 px / 100 MP ceiling.
- [x] **Readiness health check**
  - `/api/health` now reports database and compendium readiness plus counts, and returns `503` when either is unavailable.

**Acceptance:** a forced disconnect and concurrent edits converge on both clients with no stale HP, token, fog, or initiative.

---

## Sprint 8 — Character trust and level-up

**Goal:** make the sheet’s numbers and the level-up path trustworthy.

- [x] **Automation coverage labels**
  - Conservative `full` / `partial` / `manual` labels for feats and equipment.
  - Labels are shown in the feat and equipment pickers with a legend explaining manual tracking.
  - Common situational feats now carry partial automation notes (Shield Block, Ride, Assurance, Trick Magic Item, Quick Identification, and similar), and Skill Training applies its first chosen skill.
  - The multi-party simulation includes one Free Archetype + Automatic Bonus Progression campaign from 1-20.
  - `npm run simulate:feats` audits all 144,565 class/feat combinations at level 20; 39,166 accessible picks reached the derived sheet with 0 failures, while class-incompatible and prerequisite-unmet combinations are reported separately.
  - Feat labels are text-based until a curated override list grows; equipment labels distinguish base gear from magic and other items.
- [x] **Golden-sheet regression fixtures**
  - Level-1 fighter, wizard, and rogue fixtures pin abilities, HP, AC, saves, perception, DCs, attacks, and key skills.
  - Build legality remains covered separately by the existing rules tests.
- [x] **Persistent character and level-up checklist**
  - The checklist is derived from the character’s current validation issues, so it survives reloads and appears after GM-driven level-ups.
  - Each task links to the chapter that resolves it; the header reports the remaining required choices.
  - Character summaries store validation error/warning counts, and party cards plus the Overview mark unfinished builds as **Needs choices**.
- [x] **Full guided level-up wizard**
  - The Level up button is gated while the current sheet still has validation errors; the tooltip explains which permission or choice is blocking it.
  - A step-by-step wizard shows an overview with before/after HP, one page for each new feat, skill, spell, ability, or class feature, and a confirmation step with Back/Next controls.
  - Confirming applies the level and opens the first new choice; the persistent checklist keeps every remaining choice visible.
  - The wizard step builder is covered by unit tests, and the browser flow verifies the checklist appears on an unfinished draft.
- [x] **Casting presentation**
  - Cleric divine font slots are tracked with their own pips, separate from ordinary rank slots.
  - Prepared casters label their spell lists as **spellbook** and show prepared counts; spontaneous casters use **repertoire**.
  - The sheet shows the same separation and labels.
  - Heal, Harm, and Force Barrage expose 1/2/3-action formulas and rolls, including rank-scaled 2-action healing and Force Barrage's +2 shard heightening.
  - Dual-font deities now require an explicit Heal or Harm choice, and the Wizard extra slot is restricted to curriculum spells at every rank.
  - Remaining: split the shared known list into dedicated spellbook and repertoire fields.
- [x] **Companion support (first pass)**
  - Companions can link to a bestiary entry, which prefills name, level, HP, AC, and attack notes.
  - Linked statblocks show saves, perception, attacks, and abilities in the builder and sheet.
  - Links are stored as `monsterId` on the companion and resolved through the character context.
  - Remaining: place companions as linked tokens, automate companion advancement, and enforce companion-level rules.
- [x] **Content curation**
  - Feat, spell, and equipment pickers now default to a **Recommended only** filter.
  - Recommended means common, non-playtest options; users can toggle it off to see everything.
  - Search ranks exact names first, then prefix and word-prefix matches, before falling back to level/name order.
  - Unit tests cover recommended filtering and exact-name ranking.

**Acceptance:** level-up cannot skip required choices; golden fixtures match; manual effects are visibly flagged.

---

## Sprint 9 — Table depth

**Goal:** run a full combat without another VTT.

- [x] **Live sheet state and table rolls**
  - The open character sheet joins the campaign room and refreshes on `character:updated` when it has no unsaved edits.
  - Party cards also consume live character summaries, so token damage, rests, and level-ups do not require a reload.
  - A target DC/AC field resolves PF2e degrees of success; a secret toggle keeps the roll GM-only.
  - Attacks expose second/third-attack MAP buttons (agile-adjusted) and a critical-damage shortcut.
  - Direct HP corrections apply dying/unconscious and wounded-on-recovery without silently consuming temporary HP.
  - Sheet, token editor, token panel, group actions, and unlinked monsters share one HP edit helper (damage, heal, or direct correction).
- [x] **Starting wealth budget**
  - A fresh level-1 character’s 15 gp budget covers both equipment value and carried coins, with a one-click **Take remaining as coins** action.
  - Pathbuilder and transfer characters are explicitly unbudgeted so play-history wealth does not trigger false creation warnings.
- [x] **Session zero and safety**
  - A shared Session zero tab publishes the campaign pitch, genre, tone, themes, expectations, house rules, content limits, safety tools, and a GM checklist.
  - Each member can save private lines, veils, and notes. Anonymous responses hide the player's name from the GM's response list; private safety preferences are never included in campaign export.
  - The GM receives a live pause/X-card signal as a toast and GM-only chat card, without the player's identity attached.
  - No automated source checklist, party-hook questionnaire, or third-party anonymous channel yet.
- [x] **Area templates**
  - Burst, emanation, cone, line, and square templates with size in feet.
  - Click-drag placement on the map, with a live preview and a size label.
  - Casting an area spell from the table sheet switches to placement mode automatically with the spell's size and damage-type colour.
  - Templates store the spell name, save/damage summary, caster, and duration; affected tokens are listed in chat and the active-area panel.
  - Round-based durations expire as initiative advances, and owners or the GM can clear individual areas.
  - Remaining: rotate handles and automatic per-target save/damage application cards.
- [x] **Conditions with values and durations**
  - Token conditions store name, optional value, and optional duration in rounds.
  - Legacy string conditions are normalized automatically on load.
  - The token editor, token panel, and initiative tooltip show labels such as “Frightened 2 (3r)”.
  - Advancing initiative ticks the active entry’s timed conditions and removes expired ones.
  - Character-sheet conditions also track value and round duration, with a one-click −1 duration button that removes a condition when its last round expires.
  - A linked character sheet and token share one condition list: GM token edits update the sheet’s AC/saves/attacks/DCs, and sheet edits update the token.
  - Legacy names such as “Drained 2” are normalized during ticking and rest reduction.
  - Character-sheet condition durations tick automatically when that character’s linked token ends its turn in initiative.
  - Remaining: sheet ticking without a linked token.
- [x] **Multi-select, marquee, and group drag**
  - Shift/Ctrl/Cmd-click toggles tokens in the selection; a plain click selects one token.
  - Shift-drag on empty map space draws a marquee and selects every token inside it.
  - Dragging any selected token moves the whole selection, clamped to the scene.
  - Bestiary group members still move together and are merged into multi-selection drags.
  - The primary selected token still drives the token panel.
- [x] **Bulk token actions**
  - Multi-selected tokens can take damage, heal, or be restored to full HP together.
  - A condition can be applied to every selected token at once, and conditions can be cleared.
  - The GM can hide, show, lock, unlock, or delete the whole selection.
  - Remaining: per-token confirmation for destructive bulk actions.
- [x] **Scene playlists and player-safe preview**
  - Scenes can be reordered with up/down controls or drag-and-drop; ordering is persisted and broadcast.
  - Toolbar previous/next buttons step through the scene playlist.
  - Creating a scene can activate it immediately.
  - The GM can preview any scene as players see it without changing the active scene.
  - Remaining: generated scene thumbnails and player-facing preview controls.
- [x] **Combat-log filters and group checks**
  - Chat log filters for All, Talk, Rolls, Requests, and GM-only messages.
  - Empty-filter states explain when nothing matches.
  - GM Screen can mark a roll request as a **Group check**.
  - Group check cards are labeled in the shared chat and still open the prefilled dice tray.
  - Secret chat and secret rolls use independent toggles, so a whispered message no longer makes the next public roll private.
  - Player rolls made from a request are linked back to it, and the request card shows each responder, total, degree of success, and a pass/fail tally for group checks.
  - Remaining: GM-only response filtering and exportable check summaries.
- [x] **Delay, ready, and initiative ties**
  - The active combatant can **Delay** their turn, moving to the end of the order with a Delayed badge.
  - **Ready** marks the readied state and advances the turn (and round when needed).
  - A readied action can be **triggered** from the chip, posting a table message and clearing the state.
  - Readied state expires automatically when that combatant's next turn begins.
  - Tied entries use Perception as the default tie break and can still be reordered manually.
  - Remaining: ready-trigger text/conditions and full PF2e Perception tie automation.
- [x] **Token HP ↔ sheet HP source of truth**
  - Current HP is explicitly two-way: token damage/healing updates the linked character's `play.hp` and summary, and saving the sheet updates every linked token.
  - Max HP is owned by the character sheet; linked token max HP is read-only in the token editor and panel.
  - Unlinked monster and NPC tokens keep their own editable max HP.
  - Covered by the two-socket smoke test.
- [x] **Walls, doors, and line-of-sight fog**
  - The GM can draw grid-snapped walls and doors, click a door to open or close it, right-click a wall to delete it, and clear all walls.
  - Walls and closed doors block sight; open doors do not.
  - Optional line-of-sight fog makes players see cells visible from their tokens using each token's vision radius, light radius, and normal/low-light/darkvision senses. Earlier explored cells stay dimly visible per player in local storage.
  - Scenes can use shared party vision or per-player vision; per-player scenes use each player's owned tokens. GM preview falls back to shared vision.
  - Ambient light is configurable as bright, dim, or darkness. Token light sources create bright light and a dim ring outside it.
  - Dim light is rendered as a lighter fog rather than full black. Concealment is surfaced as a hover readout with the DC 5/11 flat check; the attack roll still asks the player to roll it.
  - Selecting a token as the observer shows cover (+2), greater cover (+4), total cover from walls or closed doors, and concealment against every hovered token. Ground props provide cover; overhead props and open doors do not.
  - Each token light has a hex color; a blended overlay renders warm gold by default or any chosen color as a tinted glow.
  - Wall data is persisted per scene, copied on duplication, exported/imported with campaigns, and broadcast to connected clients.
  - A scene-level **Wall collision** switch makes walls and closed doors block token movement; open doors pass freely.
  - Blocked moves follow the shortest path around walls using the same A* route preview and remaining-Speed truncation as prop collision.
  - Wall collision is off by default so scenes that only use walls for sight keep their current movement behavior.
  - Covered by shared vision, lighting, cover, wall-collision, and pathfinding tests, a two-socket smoke check of token light colors and a wall detour, and a browser wall-drawing flow.
- [x] **Built-in map library**
  - Ten categorized vector battle maps ship with the app: tavern, cavern, forest, mountain, battlefield, crypt, village, ship, desert, and swamp.
  - Every built-in map is 1536×1024 with an exact 24×16 grid at 64 px per square, so the overlay aligns without manual calibration.
  - The New Scene form filters by category and fills the scene name, dimensions, and grid size when a map is selected.
  - Custom uploads and blank scenes remain available alongside the library.
  - Covered by metadata unit tests and a browser flow that creates a scene from the library and then edits it.
- [x] **Layered scene props**
  - The GM can place, drag, resize, rotate, lock, hide, and delete decorative props on the map.
  - Props can use a **ground** layer under tokens or an **overhead** layer above tokens but below fog.
  - Built-in prop categories cover furniture, nature, dungeon pieces, and camp equipment.
  - Custom prop images upload through the campaign asset library and count as used assets.
  - A single GM-controlled **Prop collision** switch turns collision on for every prop or off for purely decorative scenes.
  - When enabled, a blocked move automatically follows the shortest PF2e grid path around the props instead of being rejected.
  - On the active combatant's turn, the detour stops at the last square the remaining Speed can pay for, so the token gets as close to the destination as its movement allows. Diagonal steps on the detour keep the 5/10-foot alternation.
  - A dashed route and distance label preview the detour while dragging; tokens already overlapping a prop can move out.
  - Prop data is persisted per scene, copied on duplication, exported/imported with campaigns, and broadcast to connected clients.
  - Covered by prop normalization, collision, and pathfinding tests, a two-socket smoke check of detours and Speed limits, and a browser drag/collision-toggle flow.

**Acceptance:** a complete combat with an AoE template, condition values, multiple selected tokens, and a filtered log needs no other tool.

---

## Sprint 10 — GM prep and continuity

**Goal:** make session prep and between-session continuity excellent.

- [x] **Encounter improvements**
  - Encounters can be duplicated with their combatants, waves, notes, and scene.
  - Combatants belong to numbered waves, and the roster is grouped by wave with per-wave XP.
  - The launch preview chooses a scene, wave, and initiative mode.
  - Reinforcements roll initiative into the existing order while preserving the current round and active turn.
  - Launched tokens carry encounter provenance. A fresh launch replaces that encounter's earlier tokens on the scene, and **Clear launched** removes its tokens and initiative entries without touching linked or manual tokens.
  - Party-size presets offer Auto plus 3, 4, 5, and 6 characters.
- [x] **Reusable handouts**
  - The GM can duplicate any journal entry or handout in one click.
  - Duplicates preserve content, kind, visibility, and attachments.
- [x] **Campaign soundtrack**
  - The GM can upload MP3, OGG, WAV, or WebM tracks (up to 25 MB), list them, play or pause, and remove them.
  - A bundled CC0 music library adds battle, exploration, tavern, relaxing, and mystery tracks. The GM can browse by mood, preview author/license/source links, and add a track without uploading a file.
  - Playback state is campaign-wide and broadcast to connected clients; the position is synced on play, pause, and track changes using server time so client clock skew cannot mis-seek. Tracks loop.
  - New tracks and deletions are broadcast live, so players do not need to reload to play a track the GM just added.
  - Players receive **Join audio** and **Leave audio** controls to satisfy browser autoplay rules, plus a local volume slider; joining or leaving is local and does not change the table's shared state. A GM who reloads while shared playback is running also gets **Join audio** instead of being stuck without a resume control.
  - Uploaded tracks use the campaign upload store, are protected from orphan cleanup, and stay separate from the image asset library. Deleting a track removes its uploaded backing file once nothing else references it; bundled library files are never removed.
  - Campaign export includes track metadata; import restores tracks whose audio files already exist in `data/uploads` or the bundled library.
  - Covered by audio-signature unit tests, a two-socket smoke check of upload, playback, export/import, and deletion, and a browser upload/play/remove and library-add flow.
- [x] **Quest handouts and one-time XP rewards**
  - A handout can be marked Active, Completed, or Failed and carry an XP reward.
  - The Journal has a Quests filter and shows the status and reward on the handout.
  - When a quest is Completed, the GM can award its XP to the whole party once; the entry records the award and refuses a second payout, even after the handout is edited.
  - Quest XP is only paid out in XP tracking mode; milestone campaigns store the value for reference and reject the award.
  - Quest rewards use the existing character XP field and never trigger automatic leveling.
  - Covered by journal unit tests, a two-user smoke check of the award and double-award guard, and a browser quest/reward flow.
- [x] **Player-facing inventory and transfers**
  - The character sheet shows gear stacks, equipped state, bulk, gear value, and the purse.
  - Players can adjust quantities, equip or unequip gear, and remove items from the sheet.
  - A player can give an item stack or coins to another character in the same campaign.
  - Transfers are server-side, revision-checked, and applied to both sheets atomically.
  - Received items arrive unequipped; transferring a whole stack moves its runes.
- [x] **In-world calendar**
  - Campaigns track a Golarion date in Absalom Reckoning with the standard month lengths and a leap day in Calistril every four years.
  - The GM can set the date or advance it by 1 or 7 days.
  - Calendar changes broadcast a role-safe campaign summary, so players viewing the campaign see the new date without switching tabs.
  - Partial calendar updates preserve omitted fields, and blank or non-numeric values are rejected.
  - The date is preserved by campaign export/import.
  - Covered by calendar unit tests and a two-socket smoke check.
- [x] **Campaign asset library**
  - Uploaded images are tracked with their campaign, original name, type, and size.
  - The GM-only Assets tab lists scene art, token art, portraits, NPC art, and handout images with usage labels.
  - Any campaign image can be attached to a journal entry or handout from the editor without uploading it again.
  - Unused images can be deleted in-app; referenced images are protected.
  - The cleanup CLI remains available for orphaned legacy files.
- [ ] Optional automatic XP only if it still matters after milestone play.

**Acceptance:** prep a three-scene session with encounters and handouts in one flow.

---

## Sprint 11 — Performance, accessibility, and polish

**Goal:** make the desktop app fast and comfortable on real tables.

- [x] **Route-level code splitting**
  - Campaign, character sheet, builder, library, dashboard, rules, account, admin, and not-found pages load on demand.
  - The production entry bundle is roughly 122 KB gzip and enforced by a budget check.
- [x] **Generated scene thumbnails and lazy image loading**
  - Scene creation and replacement generate a small WebP preview locally and upload it with the full map.
  - Scene managers use the thumbnail with lazy/async loading, falling back to the full map.
  - Avatars, NPC lists, and handout attachment thumbnails load lazily.
- [x] **Desktop keyboard and contrast pass**
  - Modals trap Tab, restore focus on close, and close on Escape without leaking focus to the page.
  - Campaign tabs expose `aria-current`; segmented filters expose `aria-pressed`.
  - A skip link targets the main content region.
  - Reduced-motion preferences disable animations and smooth scrolling.
  - Secondary text contrast was raised, and focus outlines use the brighter gold token.
- [x] **First-run checklist**
  - New campaigns show a four-step setup card: invite players, create a character, schedule a session, and write a handout.
  - Completed steps are marked automatically, and the card disappears once all four are done.
- [x] **Bundle-size budget**
  - `npm run check:bundle` enforces the entry JavaScript and CSS gzip budgets.
  - `npm run check` now runs the budget after the production build.
- [x] **Desktop-first scope**
  - Mobile and tablet layouts are intentionally deferred; the supported target is a desktop browser at table size.

**Acceptance:** initial JS meaningfully smaller; the desktop core loop works keyboard-only, focus is visible, and the bundle budget stays green.

---

## Sprint 12 — Hosting and scale (only when needed)

- [x] **Verify the Docker build and run in CI or on a Docker host**
  - Built and ran the Node 26 Alpine image on Windows Docker Desktop.
  - Verified health, registration, campaign/character data, uploads, backup, restore, and restart persistence.
  - Reduced the image from about 675 MB to 456 MB by avoiding a recursive `/app` chown, then to **358 MB** by moving build-only packages to `devDependencies`.
  - Added a CI job that builds the image and waits for `/api/health`.
- [x] **Off-machine backup shipping with checksum verification**
  - `backup.json` now records per-file SHA-256 hashes and a deterministic archive digest.
  - `npm run ship-backup` verifies the source, copies to a temporary destination folder, verifies every file again, then renames the archive into place.
  - Remote retention keeps a configurable number of off-machine generations.
  - Restore verifies the manifest before changing live data and refuses corrupted archives.
  - Docker exposes `/app/shipped` as a writable off-machine mount; backup and shipping were verified inside the container.
  - Legacy archives require explicit `--allow-unverified`.
- [x] **Audit retention and export**
  - Admins can filter the audit log and download the current view as CSV with a stable header and RFC-style escaping.
  - Retention is stored in `app_settings`, configurable from 0 (keep forever) to 3650 days, and seeded by `AUDIT_RETENTION_DAYS`.
  - Expired entries are pruned when retention is saved and at server startup.
  - `npm run audit-prune` previews expired entries by default; `--delete` removes them.
  - Export and retention changes are themselves recorded in the audit log.
- [x] **Automated restore drill**
  - `npm run restore-drill` creates real campaign and upload data on an isolated server, takes a live backup, ships it, rejects a corrupted copy, restores into a fresh data directory, and boots the restored server.
  - The restored campaign ID, name, invite code, uploaded asset metadata, and file bytes are compared with the originals.
  - CI runs the drill on a fresh runner after the smoke test.
- [x] **Long rest and daily preparations**
  - Character sheets preview and apply an 8-hour long rest: heal CON modifier (minimum 1) × level, clear temporary HP, reset spell slots, divine font, focus points, and shield, and remove rest-recoverable conditions.
  - Fatigued ends, doomed and drained decrease by 1, wounded ends at full HP, and dying/unconscious clear once HP is above 0.
  - Prepared spells and cantrips stay selected for review, and hero points and XP are untouched.
  - Prepared casters see a pending-preparations banner and a daily preparations modal after resting; they choose ranked spells and prepared cantrips before confirming the day.
  - A rough-rest option halves natural healing, with a minimum of 1.
  - GMs can apply the same rest to the whole party from the Party tab, with linked tokens and summaries updated.
  - Covered by shared unit tests, the two-user smoke test, and the character-sheet browser flow.
- [x] **Per-turn movement tracking**
  - Moving the active combatant's token adds grid distance to their turn, using the actual path when a route bends around blocking props.
  - The diagonal count carries across separate moves in the same turn, so the first diagonal costs 5 feet and the second 10.
  - The active initiative chip shows movement used against character Speed and turns red when over budget.
  - Advancing or stepping back a turn resets movement; the GM also has an explicit reset control.
  - Corrections made through the token editor do not count as movement.
  - Covered by shared movement unit tests and a two-socket smoke check of diagonal carryover and turn reset.
- [x] **GM-controlled advancement and XP awards**
  - The default advancement mode is Milestone, where the GM decides when the party or an individual character levels up.
  - Optional XP tracking adds PF2e encounter budgets plus an award flow for one character, several characters, or the whole party.
  - Campaigns choose fast, medium, or slow advancement (800/1,000/1,200 XP per level); progress bars and level-up subtraction use the chosen threshold.
  - XP awards support encounters, simple/complex hazards by level difference, minor/moderate/major accomplishments (10/30/80), quests, and other awards. The GM gets a recent-award ledger.
  - XP awards never trigger a level-up; the GM uses **Level up** on a party card or **Level up party**.
  - Advancing a character consumes up to one level's threshold and preserves any excess.
  - Party cards show XP progress when tracking is enabled, and the character sheet shows awarded XP.
  - Campaign characters can only change level through the GM; the builder disables level changes for players, and the server rejects attempts to bypass it. Uncampaigned characters stay owner-editable.
  - XP awards are GM-only, audited, and covered by unit tests, the two-user smoke test, and the browser suite.
- [x] **Turn-start and turn-end automation**
  - Advancing initiative resolves linked characters' start-of-turn dying recovery checks and end-of-turn persistent damage.
  - Persistent damage rolls all types, applies the total once, updates dying once, then attempts one DC 15 flat check per type.
  - Hidden-token automation rolls stay in the GM room; visible rolls appear as “Turn automation” cards in chat.
  - Per-round/entry/phase marks prevent duplicate resolution when stepping backward and forward.
  - The sheet's manual recovery and end-turn buttons remain for out-of-combat use. Recovery-frame templates cover common poison, disease, and curse shapes; stage effects remain manual.
- [x] **Monster turn effects**
  - Unlinked tokens store fast healing, regeneration, persistent damage, and activation/suppression notes.
  - Encounter launch seeds numeric fast healing/regeneration from monster ability names; conditional fast healing starts inactive.
  - Bestiary placement seeds the same effects on each grouped token.
  - Start of turn applies fast healing/regeneration; end of turn rolls persistent damage once and then one flat check per type.
  - The token editor exposes the fields and a manual “Regeneration suppressed” toggle. Damage-type suppression and linked-PC fast healing remain manual.
- [x] **Browser E2E**
  - Playwright covers first-user registration, Hall controls (retention, CSV export, filtering), campaign creation, the invite code, the character builder and sheet, lazy library/compendium/rules/account routes, a second player joining with the invite code, and table interactions (token placement, chat, dice rolls, and the scenes manager).
  - Player-safe campaign navigation is checked: GM-only tabs are absent for the player, and the GM sees the new member in Settings.
  - CI installs Chromium, runs the suite, and uploads the Playwright report on failure.
- [x] **Lint and format guardrails**
  - ESLint (flat config) with Babel parser and `eslint-plugin-react-hooks` runs as `npm run lint`; rules-of-hooks is an error, and exhaustive-deps reports as warnings.
  - Prettier enforces formatting with `npm run format:check`; `npm run format` rewrites files.
  - Both are wired into `npm run check`; `src`, `scripts`, and `tests` were normalized in one pass.
- [x] **Operational polish**
  - Icon-only navigation links keep accessible names below 980px via `aria-label`.
  - Build-only packages moved to `devDependencies`; the production image dropped from **458 MB to 358 MB**.
  - Dependabot watches npm and GitHub Actions weekly.
  - A weekly **Rules simulation** workflow runs the full character matrix.
  - `npm audit` is clean.
- [x] **Confirmed on a clean CI runner**
  - The public repository is [jaymoh2010-max/runehall](https://github.com/jaymoh2010-max/runehall).
  - The `verify` job (including the restore drill), the Docker health job, and the browser E2E job all pass on fresh GitHub runners.
- [ ] Consider Postgres/S3 adapters or OAuth only after the local deployment is proven.

**Acceptance:** clean-machine deploy and restore drill pass end to end.

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

## Backlog beyond the current roadmap

These need a product decision before implementation:

- [ ] **Incremental refactors** — split `rules.ts`, `CharacterSheetPage`, and `CampaignPage` where it reduces risk without changing behavior, and clear the remaining `react-hooks/exhaustive-deps` warnings while doing so.

## Recommended next session

The current feature queue is complete. Next improvements:

1. keep the Docker, browser E2E, and weekly simulation jobs green,
2. merge Dependabot updates and keep dependencies current,
3. pick one backlog item above and scope it before implementation,
4. defer Postgres/S3 adapters and OAuth until the local deployment is proven.

Keep the two-user smoke test and browser E2E suite green as new socket events are added.

---

## Campaign readiness review (18 November 2026)

A campaign-level review compared Runehall against PF2e GM Core/Player Core progression and common GM/player needs. It ran two isolated 1–20 campaigns (XP and milestone) through the API and sockets: 66 checks passed, 7 gaps were recorded, and two linked-token bugs were fixed (hidden tokens no longer leak into the player initiative order; a new token for a wounded character starts at the sheet's current HP).

- Full report: [CAMPAIGN-READINESS.md](CAMPAIGN-READINESS.md)
- Repeatable simulation: `npm run simulate:campaign`
- Next priority: AP scaffolding and deeper rules automation.
