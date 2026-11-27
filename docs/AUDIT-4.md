# Runehall audit 4 - gaps after the P2 hardening pass

Audit date: 2026-11-27

Reviewed commit: `3065879` (`master`, merge of the commander tactics work)

Scope: database and migrations, backups/restore, rules engine and spellcasting, items and inventory, compendium data, server/socket authorization, and the table/sheet client. This was a read-only audit first; confirmed defects were then fixed on `audit/gaps-2026-11-27`. Another worktree (`feat/p2-background-grants`) was active during the pass, so its files were left untouched.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | Pass (typecheck, lint, 812 unit tests, build, bundle budget) |
| `npm run smoke` | Pass |
| `npm run e2e` | 41 passed |
| `npm run simulate:campaign` | 18 passed, 0 failed |
| `npm run restore-drill` | Pass end to end |
| `npm run simulate` | Completed; output capture truncated the summary line |
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

## Remaining findings

### Critical / high

1. **Legacy rowless uploads are still 404 after an upgrade.** `src/server/index.ts:112` requires an `uploaded_assets` row; migration 15 only created the table and never backfilled files uploaded before it. A pre-migration-15 install (or an old restored backup) keeps scene maps, token art, and portraits on disk but cannot serve them, and self-contained export skips them. Minimal fix: a startup/one-shot backfill that registers existing files and infers `campaign_id`/`uploaded_by` from structured references, or a safe fallback access check for rowless files. This is the only audit finding rated critical that was not fixed in this pass because it needs a data migration and a recovery test.
2. **Restore still removes live data before the replacement is verified in place.** `scripts/restore.mjs:201-208` deletes the live DB/WAL and uploads, then copies the backup. A disk-full or permission failure at that point loses the live data even though `pre-restore-*` exists. Minimal fix: stage the replacement on the same filesystem, verify it, rename the old files aside, then swap.
3. **End turn does not run turn automation or affliction timers.** `src/server/socket.ts:1896` only advances the index/round. `resolveStartOfTurn`, `resolveEndOfTurn`, `resolveTokenEndOfTurn`, and `resolveAfflictionTurnEnd` have no production call sites. Persistent damage, fast healing/regeneration, start-of-turn dying recovery, and round-based affliction onset/interval saves therefore never tick from the guided End Turn button, despite the readiness document claiming per-turn automation. Minimal fix: resolve the outgoing combatant's end-of-turn effects, advance, then resolve the incoming combatant's start-of-turn effects; apply linked-character and unlinked-token paths and post the rolls to chat.
4. **Campaign import bypasses upload quotas and the low-disk guard.** `src/server/campaignImport.ts` writes embedded assets without `checkUploadQuota`; the 256 MB import body limit is the only cap. Repeated imports can fill the data volume and break SQLite, migrations, and backups. Minimal fix: validate asset bytes and free space before writing/committing, cap asset count, and rate-limit imports.
5. **Commander limits ignore the feats and dedication that change them.** `src/shared/commander.ts:55-67` and `rules.ts:3595` use a level-only formula. Tactical Expansion, Tactical Excellence, Efficient Preparation, and Commander Dedication are ignored, so legal builds can fail validation and the picker can block additions. Minimal fix: derive folio/prepared bonuses from selected feat instances and the dedication, and use the same helper in validation, builder, and sheet.
6. **Monk and ranger focus proficiency never advances.** `rules.ts:4193` hardcodes rank 1 for non-spellcasters. Monk Expertise/Graceful Legend and Ranger Expertise/Masterful Hunter should raise focus spell DC/attack at 9/17. Minimal fix: derive a focus rank from the granting features, or add focus spellcasting proficiency data to class features.

### Medium

- **Staff charge and slot semantics are still simplified.** The cap is fixed, but a staff does not automatically gain free charges equal to the highest slot on daily preparation, prepared casters are still offered a "Slot" cast that is not a staff rule, and spontaneous casters are not charged the 1 staff charge + slot. Minimal fix: store a prepared charge pool equal to the highest slot, add one expended slot for prepared casters, hide the slot action for prepared casters, and charge 1 charge for spontaneous slot use.
- **Ranked at-will innate spells cannot be represented.** `src/shared/innate.ts` defaults every ranked innate spell to 1/day and the builder only offers 1-5/day. Feats such as Neighborly Graces and Realm Strider should be at will. Minimal fix: add an explicit at-will sentinel and UI option, and source frequency from the granting ability.
- **Psychic Dedication is always Intelligence.** `src/shared/multiclass.ts` hardcodes `int`; the dedication allows Intelligence or Charisma. Minimal fix: store the chosen key ability or use the qualification ability.
- **Dedication spells are not validated per rank or against slots.** A level-6 character can select two rank-2 dedication spells with one rank-2 slot, and imported drafts can overfill `multiclassSlotsUsed`. Minimal fix: group `multiclassSpells` by base rank, cap each group against `multiclassSlots[rank - 1]`, and validate used counts.
- **Rune lifecycle is incomplete on the live sheet.** There is no etch/detach action outside the builder; selling or dropping a runed weapon silently destroys the attached runes and refunds only the base item price. Minimal fix: add live etch/detach, consume a matching rune item, and include or block attached-rune value on sale/drop.
- **Consumable activation is only partially restored.** Multi-use consumables (Black Powder Horn, Cantrip Deck, etc.) still lose one whole inventory item on first use, and bombs are auto-equipped as permanent attacks without consuming quantity. Minimal fix: track remaining uses for multi-use consumables and add a Throw action that decrements bombs.
- **Item transfers have no sheet UI, and custom-item transfers lose their definition.** The endpoint exists at `src/server/routes/characters.ts:712`, but the client does not expose it; `addItemToDraft` copies equipment fields only, so a transferred `custom:` item arrives without its name/description. Minimal fix: add a give modal and copy the custom definition.
- **Compendium afflictions and poisons are not linked to the tracker.** The Add Affliction form only offers six generic presets; 107 poisons exist as equipment, and 13 poison afflictions have no equipment entry. Minimal fix: add an affliction picker that prefills DC/onset/interval/stages and link poison items to it.
- **Ammunition and bundle sizes are not modeled.** `price.cpTotal` is treated as per-unit for arrows/bolts, and ranged attacks never decrement ammunition. Minimal fix: add bundle size to equipment data or normalize to per-unit prices, and decrement ammo (or label it manual).
- **Rune/class extra damage is not shown on sheet attacks.** `extraDamage` is built for property runes and class features but the sheet only renders the base weapon formula. Minimal fix: show typed extra-damage chips and include them in the damage roll.
- **Duplicating a character clones campaign gear and currency.** `src/server/routes/characters.ts:1093` copies the full draft and keeps `campaign_id`. Under the documented trust model this may be intended, but it is a direct wealth-duplication path. Decide whether duplicates should be build templates (clear campaign/inventory) or GM-only.
- **Stack merging drops charged-item state.** `addItemToDraft` and the normalizer merge identical entries without preserving `usesUsed`/`usesMax`. Two wands can become one stack with one daily use. Minimal fix: do not merge limited-use entries, or define an explicit merge policy.
- **Free quantity increases bypass the purchase ledger.** The sheet's +/- controls can set any quantity without paying, while the purchase endpoint enforces coins. `docs/PLAN.md` explicitly says the product is not anti-cheat, so this may be an accepted trust model; if not, route price-bearing increases through the purchase endpoint or reject unexplained server-side deltas.
- **Migration 55 was reused in an abandoned branch.** A database from that branch records `campaign_player_item_grant` as version 55; current `travel_day_history` then retries 55 and fails on every start. The runner only selects `version`, not name/checksum. Minimal fix: store/verify migration names and emit an actionable conflict error; never reuse versions.
- **Backup/asset bookkeeping is not fully atomic or complete.** Asset deletion uses a narrower reference set than backup (`src/server/assets.ts:8-19`), campaign deletion strands uploads and quotas (`src/server/routes/campaigns.ts:1052`), audio upload/delete can leave stale rows (`src/server/routes/uploads.ts:205-350`), and `cleanup-assets --delete` can race an in-flight upload. A shared reference scanner and transactional deletion/trash staging would close these.
- **Self-contained export skips other users' campaign-less assets.** `src/server/routes/campaigns.ts:900-931` embeds only campaign rows or the exporter's own campaign-less uploads. A player portrait uploaded before joining a campaign can remain an unreachable URL after import.
- **Restore accepts a newer schema than the running code.** `scripts/restore.mjs` checks file integrity but not schema version; `src/server/migrate.ts` then sets `user_version` to the older code's latest. Minimal fix: compare the restored DB's highest migration and the archive app version to the running code and refuse/warn.
- **Background-granted Toughness/Diehard are invisible to dying math.** This is being addressed by the concurrent `feat/p2-background-grants` worktree; do not duplicate it. Until it lands, `applyDamageToDraft` only sees draft feat buckets.

### Low

- Backups can pick a crashed `.partial` staging directory as the newest archive (`scripts/backup-lib.mjs:110-118`); exclude staging names.
- Campaign creation inserts the campaign, membership, scene, and state separately (`src/server/routes/campaigns.ts:404-427`); wrap them in a transaction.
- Restore and migration rollback remove `-wal`/`-shm` but not `-journal`; add the sidecar for completeness.
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
