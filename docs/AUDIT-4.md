# Runehall audit 4 - gaps after the P2 hardening pass

Audit date: 2026-11-27

Reviewed commits: `3065879` (initial audit), `a1c5dac` (sixth pass, after background grants, Runesmith, inventory lifecycle, the affliction picker, live runes, and operational hardening), `5d3427b` (seventh pass, trust-model decisions), and the large-import batch (eighth pass)

Scope: database and migrations, backups/restore, rules engine and spellcasting, items and inventory, compendium data, server/socket authorization, and the table/sheet client. The initial read-only audit and the second fix pass ran on dedicated worktrees; the second pass is on `audit/gaps-2-2026-11-27`.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | Pass (typecheck, lint, 864 unit tests, build, bundle budget) |
| `npm run smoke` | Pass, including persistent-damage automation |
| `npm run e2e` | 45 passed |
| `npm run simulate:campaign` | 18 passed, 0 failed |
| `npm run simulate` | 2,337 characters; 0 problems |
| `npm run simulate:parties` | 23 passed, 0 failed |
| `npm run simulate:feats` | 144,565 combinations; 0 failures |
| `npm run restore-drill` | Pass end to end |
| `npm run verify:data` | Structure, references, counts, and integrity pass |

## Fixed in this pass

### Combat and table

- **Linked-character token damage used stale data.** `token:damage` forwarded no damage types to `applyHpEditToDraft`, and the `character:updated` broadcast sent the pre-damage draft. It now forwards the damage type, applies the critical flag from the token panel, and broadcasts `result.draft` (`src/server/socket.ts`, `src/client/components/table/TokenQuickPanel.tsx`, `VttTable.tsx`). The smoke test now checks the broadcast contains the post-damage draft value.
- **Scene visibility left initiative stale.** Hiding or revealing a scene now rebroadcasts the GM and player-safe initiative order immediately (`src/server/routes/table.ts`).
- **Grouped tokens added during combat setup only recorded the first member.** The setup entry is rebuilt from the full group and keeps its rolled initiative/pending state (`src/server/socket.ts`). `initiative:begin` now refuses a second begin.
- **Combat setup was lost on campaign import.** Import now preserves `round: 0` while still defaulting archives without a round to 1 (`src/server/campaignImport.ts`).

### Rules

- **Multiclass dedication DC/attack advanced without the archetype feats.** Proficiency now stays trained until Expert/Master Spellcasting is actually selected (`src/shared/multiclass.ts`, `src/shared/rules.ts`). Added a level-12 gating test.
- **Innate spell DC/attack ignored a higher spell proficiency.** Innate casting now uses the better of its own trained/expert progression and the character's existing spellcasting/focus proficiency (`src/shared/rules.ts`). Added a level-7 test.
- **Prone did not penalize spell attacks.** The circumstance penalty now applies to spell, focus, innate, and multiclass spell attacks.
- **Archetype slots did not satisfy "spellcasting class feature" prerequisites.** The predicate now checks `multiclassCaster.spellSlots` as well (`src/shared/rules.ts`).
- **Nonlethal damage stabilized an already dying character.** Nonlethal damage no longer removes an existing Dying condition; it leaves the value unchanged (`src/shared/damage.ts`). Added a regression test.
- **Affliction maximum duration ticked before onset.** Duration now starts only after a round-based onset has passed; non-round/manual onsets leave the timer manual (`src/shared/afflictions.ts`). Added a multi-turn test.
- **Witch Dedication allowed two prepared cantrips.** The familiar knows two, but only one can be prepared each day (`src/shared/multiclass.ts`).
- **Coins had no Bulk and invested stacks counted as one item.** Carried coins now add 1 Bulk per full 1,000 coins, and invested entries count their quantity (`src/shared/inventory.ts`, `itemActivation.ts`, `rules.ts`).

### Items and inventory

- **Staves were hard-capped at 5 charges.** The charge dialog now offers up to a 10th-rank slot, so high-rank staves can be charged and cast (`src/client/components/sheet/CharacterSheetView.tsx`).
- **Concatenated staff spell names were dropped.** The parser now tokenizes names against the known spell list, including names containing "or" and parenthetical qualifiers (`src/shared/itemSpellcasting.ts`). A new data test verifies every parsed staff spell resolves against `spells.json`; this removes the previously unmatched staff entries.
- **Item activation existed only in tests.** A Use/Activate action is back on the sheet for consumables and limited-use items, using the existing `activateItemOnDraft` helper; healing items post their healing formula. (Multi-use consumables and bomb attack consumption remain separate gaps below.)
- **Purchases and awards could silently burn overflow.** Buying, awarding, or transferring into a full 9,999-item stack is now rejected with an explicit error before coins are spent (`src/server/routes/characters.ts`).

### Client and accessibility

- **Long-rest and daily-preparation dialogs opened behind the in-table sheet.** Both modals now accept `elevated` and the sheet passes it in overlay mode. The builder's level-up/conflict dialogs, portrait picker, daily preparations, and shared pickers are elevated as well.
- **The overlay focus trap never initialized after the async character load.** The focus effect now re-runs when the character/container mounts, and the loading/error overlay is itself a focusable dialog.

### Server, security, and operations

- **A user could claim another user's campaign-less upload as an avatar.** Avatar updates now require the asset to be owned by the user or accessible through a campaign membership (`src/server/routes/auth.ts`).
- **The early upload quota check rejected files that would still fit.** The pre-stream check now only rejects already-exhausted storage; the exact check remains after the file is measured (`src/server/routes/uploads.ts`).
- **Free-text chat could poison every backup and restore.** Backup/restore now enforce structured upload references only (scene/token/character/journal/NPC/audio fields and `uploaded_assets` rows), while chat and notes are ignored (`scripts/backup-lib.mjs`). Added tests for structured references and free-text exclusion.
- **Backups could publish a database that restore would refuse.** Backup now runs the same `PRAGMA integrity_check` and `PRAGMA foreign_key_check` as restore before publishing (`scripts/backup-lib.mjs`, `backup.mjs`).
- **A corrupt live database blocked restore before the safety copy.** Restore now reports the failure and supports `--allow-unsafe` to continue without a safety copy (`scripts/restore.mjs`).
- **Operational scripts ignored `.env`.** `backup`, `ship-backup`, `restore-drill`, `cleanup-assets`, and `verify:data` now load `--env-file-if-exists=.env`, matching `restore` (`package.json`).

## Second pass

The first report was followed by a second fix pass. These defects are now closed:

- **Legacy rowless uploads.** Startup backfill registers files that predate migration 15 and infers campaign/uploader scope from structured references (`src/server/assets.ts`). A unit test covers campaign, character portrait, unused-file, and free-text exclusion cases.
- **Restore atomicity and schema safety.** Restore stages the DB/uploads on the same filesystem, verifies the staged DB, swaps the live data aside, and rolls back on failure. It keeps a local `live/` copy and a `--allow-unsafe` escape hatch. It also refuses a backup whose schema is newer than the running code unless `--allow-newer-schema` is passed (`scripts/restore.mjs`).
- **Turn automation.** End Turn now resolves the outgoing combatant's persistent damage and affliction timers, advances, then resolves the incoming combatant's fast healing/regeneration and dying recovery. Linked characters and unlinked tokens are both covered, and the rolls are posted as a `Combat automation` chat message (`src/server/socket.ts`). Smoke coverage now starts a combat with persistent damage and asserts the HP drop and chat entry.
- **Campaign import quota.** Embedded assets are checked against campaign/user quotas and free disk space before each file is written (`src/server/campaignImport.ts`).
- **Commander limits.** Tactical Expansion, Tactical Excellence, Efficient Preparation, and Commander Dedication now add folio/prepared capacity in validation, the builder, and the sheet (`src/shared/commander.ts`, `rules.ts`, `FeatsStep.tsx`, `CharacterSheetView.tsx`).
- **Monk and ranger focus proficiency.** Focus spell attacks and DCs advance to expert at 9 and master at 17 (`src/shared/rules.ts`).
- **Staff charge rules.** Daily preparation is a separate action; prepared casters can expend one additional slot; spontaneous casters can spend 1 charge plus a slot; prepared casters no longer get an invalid Slot button. The E2E staff scenario was updated to the correct level-11 staff pool.
- **Ranked at-will innate spells.** `innateMax[id] = 0` is an explicit at-will sentinel, preserved by normalization, and offered in the builder (`src/shared/innate.ts`, `rules.ts`, `SpellsStep.tsx`).
- **Psychic Dedication ability.** The dedication now chooses the higher of Intelligence or Charisma instead of hardcoding Intelligence (`src/shared/multiclass.ts`, `rules.ts`).
- **Dedication spell slots.** Validation and the builder cap dedication spells per rank and reject overfilled `multiclassSlotsUsed` (`src/shared/rules.ts`, `SpellsStep.tsx`).
- **Runed-item sales.** Sale/drop confirmations warn about attached runes, and the sale price includes their value (`CharacterSheetView.tsx`).
- **Multi-use consumables.** Items such as Black Powder Horn and Cantrip Deck track remaining uses and consume one container only when empty (`src/shared/itemActivation.ts`). Bombs still need a separate throw-consumption path.
- **Campaign asset cleanup/export.** Deleting a campaign removes unreferenced campaign uploads; self-contained export includes campaign members' pre-campaign portraits; legacy export-only tables are included in the asset reference scan.
- **Small operational fixes.** Backup/shipping ignores `.partial` staging folders, migration rollback removes `-journal`, and restore checks schema direction.

## Third pass

The post-P2 inventory batch closed the remaining item lifecycle findings:

- **Bombs and ammunition.** Bomb attacks consume one from their stack; ranged attacks offer an ammunition selector and consume one per attack. Bundle sizes and per-bundle pricing remain manual.
- **Limited-use stack merging.** Daily/staff pools add their caps and spent uses; multi-use consumables pool remaining uses into one container. Normalization and transfers share the same merge helper.
- **Staff daily reset.** `staffBaseCharges` records the base daily pool; a long rest discards extra expended-slot charges.
- **Item transfers.** The sheet exposes a Give modal; custom-item definitions are copied to the receiver and removed from the source when the stack is gone.

## Fourth pass

The P3 affliction batch closed the remaining published-affliction gap:

- **Compendium affliction picker.** The sheet searches the 215 published poisons, diseases, and curses, prefills DC, save, onset, interval, duration, and stage count, keeps stage text in notes, and stores the compendium source id for a library link (`src/client/components/sheet/AfflictionPicker.tsx`, `src/shared/afflictions.ts`).
- **Poison item link.** Poison-trait inventory entries expose a Track action that opens the picker with the item name.
- **Per-category search.** The affliction API now filters by poison/disease/curse (`src/server/compendium.ts`).
- **Coverage.** Added conversion and normalization tests plus an E2E flow that adds Lich Dust from the compendium.

## Fifth pass

The live rune batch closed the remaining rune lifecycle gap:

- **Equipment etch/detach.** The sheet's Runes modal lists matching rune items in the pack, consumes one on etch, and returns one on detach (`src/shared/runeLifecycle.ts`, `CharacterSheetView.tsx`).
- **Fundamental replacement.** Etching a new potency/striking/resilient rune returns the replaced rune to the pack instead of silently losing its value.
- **Slot safety.** Property runes require an open potency slot, and a lower-potency replacement that would strand property runes is refused.
- **Runesmith etch/re-etch.** The sheet can add a base rune or replace an etched rune from the repertoire; replacement resets the target and clears the diacritic (`src/shared/runesmith.ts`, `CharacterSheetView.tsx`).
- **Coverage.** Added five rune-lifecycle unit tests and E2E coverage for equipment etch/detach and Runesmith re-etching.

## Sixth pass

The operational hardening batch closed the migration and audio bookkeeping gaps:

- **Migration history verification.** Migration 59 adds a checksum column. The runner validates recorded names before applying anything and checks SHA-256 checksums for applied migrations; a reused version or edited SQL now fails with an actionable conflict instead of retrying or silently drifting (`src/server/migrate.ts`, `migrations.ts`).
- **Audio bookkeeping.** Audio upload inserts the asset row and track row in one transaction; delete commits the track/campaign cleanup before removing the file, so a failure leaves no stale row and an orphan file is cleaned later (`src/server/routes/uploads.ts`).
- **Restore server check.** The running-server probe now waits 1.5 seconds per attempt and retries three times per host before restoring (`scripts/restore.mjs`).
- **Coverage.** Added migration name-conflict and checksum-mismatch tests; smoke and restore drill pass.

## Seventh pass

The trust-model batch made the economic boundary explicit instead of adding anti-cheat:

- **Character duplication.** Full-copy behavior is now the documented decision: the owner or campaign GM can duplicate a character into the same campaign with its gear and coins. The dashboard confirms a campaign copy, and campaign duplicates write a `character.duplicate` audit entry (`src/server/routes/characters.ts`, `DashboardPage.tsx`).
- **Manual inventory counts.** The sheet's +/- controls remain free manual adjustments, now labelled as such. The purchase route still enforces coin cost and ruleset legality, which preserves loot, rewards, crafting, and corrections without a server-side ledger (`CharacterSheetView.tsx`).
- **Boundary documentation and coverage.** Added `docs/TRUST-MODEL.md`; the smoke test now verifies that duplication copies campaign gear/coins, rejects a player duplicating someone else's character, and writes the audit entry.

## Eighth pass

The large-import batch bounds synchronous campaign imports instead of adding a background job queue:

- **Body cap.** The route uses `CAMPAIGN_IMPORT_MAX_MB` (default 128 MB) instead of a hardcoded 256 MB, and oversized archives get a clear 413 response (`campaignImportLimits.ts`, `index.ts`).
- **Preflight.** Format, version, row counts, and embedded-asset sizes are validated before the transaction opens or any file is written (`campaignImportLimits.ts`, `campaignImport.ts`).
- **Visibility.** Import duration is recorded in the audit detail; imports over two seconds emit a warning. The dashboard shows the archive size and warns when a large file will pause the table (`DashboardPage.tsx`).
- **Decision.** A background import worker is not warranted for the local-first target table. Imports are a rare, rate-limited GM operation (5 per IP per 10 minutes); the bound and preflight keep failures cheap, and the rate limit remains the abuse control. The limit is documented in `README.md`, `docs/DEPLOY.md`, and `docs/BACKUP.md`.

## Remaining findings

No critical, high, or medium-severity findings remain from this audit. The items below are low, optional features, or deliberate boundaries.

### Low

- Campaign creation inserts the campaign, membership, scene, and state separately (`src/server/routes/campaigns.ts:404-427`); wrap them in a transaction.
- Import/export fidelity gaps: export omits some thumbnail/attachment URLs, import does not remap message request ids, and imported audio sort order is replaced by the import counter.
- `cleanup-assets --delete` can still race an in-flight upload. Require the server to be stopped or add a grace-period check before deletion.
- The migration snapshot is taken after `schema_migrations` is created; the ordering is benign but the snapshot is not literally pre-DDL.
- The overlay focus effect now runs after async load, but the same pattern should be checked if the sheet is remounted with a different character id while open.

## Deliberate boundaries

The manual-first model is coherent and should be preserved: the table does not move tokens for players, auto-apply area damage/saves, tick arbitrary conditions, or automate unusual feat/item prose. The gaps above are cases where automated math is wrong or a documented feature has no production path, not requests to turn Runehall into a rules engine.

## Reproduce

```bash
npm run check
npm run smoke
npm run e2e
npm run simulate:campaign
npm run restore-drill
```
