# Runehall audit 4 - gaps after the P2 hardening pass

Audit date: 2026-11-27

Reviewed commits: `3065879` (initial audit) and `5b1d050` (second pass merged over the background-grant and Runesmith work)

Scope: database and migrations, backups/restore, rules engine and spellcasting, items and inventory, compendium data, server/socket authorization, and the table/sheet client. The initial read-only audit and the second fix pass ran on dedicated worktrees; the second pass is on `audit/gaps-2-2026-11-27`.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | Pass (typecheck, lint, 840 unit tests, build, bundle budget) |
| `npm run smoke` | Pass, including persistent-damage automation |
| `npm run e2e` | 43 passed |
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

## Remaining findings

No critical or high-severity findings remain from this audit. The items below are medium/low, optional features, or deliberate trust-model decisions.

### Medium

- **Bombs and ammunition are not consumed by attacks.** Equipped bombs remain permanent attacks, ranged attacks never decrement arrows/bolts, and bundle sizes are not modeled. Minimal fix: add a Throw action that decrements bomb quantity and an ammo decrement path (or label both manual).
- **Rune etch/detach is still builder-only.** Sale/drop now warns and includes rune value, but there is no live etch/detach action that consumes the matching rune item. Minimal fix: add the action and block invalid double-payment.
- **Item transfers have no sheet UI, and custom-item transfers lose their definition.** The endpoint exists at `src/server/routes/characters.ts:712`, but the client does not expose it; `addItemToDraft` copies equipment fields only, so a transferred `custom:` item arrives without its name/description. Minimal fix: add a give modal and copy the custom definition.
- **Compendium afflictions and poisons are not linked to the tracker.** The Add Affliction form only offers six generic presets; 107 poisons exist as equipment, and 13 poison afflictions have no equipment entry. Minimal fix: add an affliction picker that prefills DC/onset/interval/stages and link poison items to it.
- **Stack merging drops limited-use state.** `addItemToDraft` and the normalizer merge identical entries without preserving separate charge pools. Two wands can become one stack with one daily tracker. Minimal fix: do not merge limited-use entries, or define an explicit pooled-charge policy.
- **Migration 55 was reused in an abandoned branch.** A database from that branch records `campaign_player_item_grant` as version 55; current `travel_day_history` then retries 55 and fails on every start. The runner only selects `version`, not name/checksum. Minimal fix: store/verify migration names and emit an actionable conflict error; never reuse versions.
- **Asset/audio bookkeeping is not fully atomic.** Audio upload/delete can leave stale rows (`src/server/routes/uploads.ts:205-350`), and `cleanup-assets --delete` can race an in-flight upload. A shared reference scanner and transactional deletion/trash staging would close these.
- **Large imports still hold the event loop and write lock.** Quotas now apply, but a 50 MB embedded archive remains a synchronous transaction. Add a rate limit or background import if large imports are expected.
- **Staff daily reset keeps extra expended-slot charges.** The charge dialog correctly builds `base + expended slot`, but `resetItemUses` refills to `usesMax` rather than the base daytime pool. Minimal fix: store the base charge count separately or reset staff charges to the highest spell rank.
- **Duplicating a character clones campaign gear and currency.** `src/server/routes/characters.ts:1093` copies the full draft and keeps `campaign_id`. Under the documented trust model this may be intended, but it is a direct wealth-duplication path. Decide whether duplicates should be build templates (clear campaign/inventory) or GM-only.
- **Free quantity increases bypass the purchase ledger.** The sheet's +/- controls can set any quantity without paying, while the purchase endpoint enforces coins. `docs/PLAN.md` explicitly says the product is not anti-cheat, so this may be an accepted trust model; if not, route price-bearing increases through the purchase endpoint or reject unexplained server-side deltas.

### Low

- Campaign creation inserts the campaign, membership, scene, and state separately (`src/server/routes/campaigns.ts:404-427`); wrap them in a transaction.
- Import/export fidelity gaps: export omits some thumbnail/attachment URLs, import does not remap message request ids, and imported audio sort order is replaced by the import counter.
- The restore running-server check probes only one host/port with a 600 ms timeout; require explicit confirmation or a lockfile check.
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
