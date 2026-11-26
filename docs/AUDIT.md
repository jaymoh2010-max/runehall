# Runehall audit — manual-first table + Pathbuilder-style sheet

Audit date: 2026-11-22

## Scope

This review covers the current product direction:

- Owlbear-style table as the home screen
- Pathbuilder-style sheet opened over the table
- Manual combat and initiative
- Compendium, bestiary, audio, chat, and dice
- Local SQLite persistence and campaign membership

## Verification snapshot

All current gates pass:

| Command | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run smoke` | Pass |
| `npm run e2e` | 26 passed, 0 skipped |
| `npm run simulate:campaign` | 78 passed, 0 failed |

The 23 skipped browser tests were removed from the serial suite; the active suite now covers only the current manual-first product.

## Remediation status

The follow-up `audit-fixes` pass addressed the P0 findings and the targeted P1/P2 items:

- Read-only sheets hide or disable HP, conditions, pips, gear actions, spell casts, details editing, and the builder.
- Sheet saves are serialized through a queue that keeps the latest draft and resolves waiting callers; Cast waits for the save before posting chat.
- HP/focus/slot pips apply each click to the current draft, so rapid changes are not dropped.
- Initiative score inputs keep local text and commit on blur or Enter.
- Granted spells are merged into the Spells tab; innate spells receive their remaining-use count and stay visible beside cantrips.
- Item grants bump the campaign revision, campaign import/export preserves `playerItemGrant`, and campaign settings updates write an audit entry.
- The token panel can remove conditions, edit value/duration, and (for the GM) change name, art, and size; players no longer see the GM-only initiative action.
- `My sheet` prefers the selected token's character and offers a picker when the user owns several characters.
- Socket refreshes are silent, unsaved details survive unrelated saves, sheet rolls have a DC/secret control, and deleting from the embedded builder returns to the table.
- Dead turn automation, the `initiative:action` socket event, active-movement UI code, and the `.core-sheet-drawer` CSS were removed.
- Legacy campaign tab URLs now redirect to the table; XP/advancement settings moved behind an advanced disclosure.
- Action filters expose `aria-pressed`, action lists show a count with progressive loading, item-price errors use the shared currency formatter, and the sheet restores the document title on close.

Intentional follow-ups: token owner and temp-HP editing were not added because tokens do not store temp HP; legacy campaign render blocks remain bundled but unreachable; `npm audit` stays a manual periodic check (`npm audit --omit=dev` currently reports 0 vulnerabilities).

---

## Severity summary

### P0 — correctness and permissions

1. **Read-only sheets still expose write controls.**
   `CharacterSheetView` never derives `permissions.canEdit`. HP, conditions, pips, gear Buy/Grant, equip/invest, Save details, spell Cast, and Edit build are active on another player's sheet. The server correctly rejects most writes, but the UI still posts cast messages and the builder route can navigate the viewer away from the table. The "shared sheet" experience should be truly read-only.
   - `src/client/components/sheet/CharacterSheetView.tsx`
   - `CharacterSheetView` uses `character.permissions` only for `canGrant`.

2. **Linked-token conditions cannot be removed from the quick panel.**
   The token panel can add a condition but only renders condition tags. Unlinked monsters can therefore accumulate conditions with no table-side removal path. Add a remove button per condition.
   - `src/client/components/table/TokenQuickPanel.tsx`

3. **Rapid sheet edits can be silently dropped.**
   `persist()` returns early while `saving` is true. HP buttons, hero/focus pips, equipment toggles, and Cast can fire faster than the save round-trip. The last click wins, and earlier changes disappear.
   - `CharacterSheetView` `persist`, `changeHp`, `cast`, `toggleEquipment`.

4. **Casting posts chat before the save succeeds.**
   `cast()` calls `void persist(...)` and immediately writes a chat message. On a revision conflict or failed save, the table sees a cast that never affected the sheet.
   - `CharacterSheetView` `cast`.

5. **Initiative score edits are committed per keystroke.**
   The controlled score input calls `onSetValue` on every `onChange`, producing a socket `initiative:update` and broadcast for each digit. This can fight the input cursor and creates unnecessary traffic.
   - `src/client/components/table/InitiativeBar.tsx`

6. **Granted spells are missing from the sheet.**
   The Spells tab only reads `draft.spells` arrays. It does not merge `derived.grantedSpells`, so domain focus spells, curriculum spells, and other class-granted spells can be absent.
   - `CharacterSheetView` `spellEntries`
   - `DerivedCharacter.grantedSpells` in `src/shared/types.ts`

7. **Innate spells may be treated as one-use.**
   The sheet calls `spellCastOptions` with `innate: true` but no `innateRemaining`. At-will innate spells can be shown/consumed as a single use. The old sheet passed the remaining-use value explicitly.
   - `CharacterSheetView` `optionsForSpell`

8. **Item grants do not advance the campaign revision.**
   `POST /api/characters/:id/items` updates the sheet and broadcasts `character:updated`, but does not call `touchCampaign`. Clients that only see the character summary can miss the revision bump until reconnect.
   - `src/server/routes/characters.ts` item route

9. **Campaign import loses the new item-grant setting.**
   Export includes `playerItemGrant` through the campaign summary. Import never reads it, so an exported campaign returns with free player gear disabled.
   - `src/server/campaignImport.ts` around the campaign settings copy.

### P1 — table and sheet usability

10. **`My sheet` is ambiguous for multi-character users.**
    The button chooses the most recently updated character with a summary. A GM (or a player with an old draft) has no picker. Prefer the character linked to the selected token, or add a small character selector.

11. **Party-rail tooltip is stale.**
    The popover says “Click to select · Double-click for sheet,” but click now opens the sheet.
    - `src/client/components/table/PartyRail.tsx`

12. **Players are shown a GM-only Add to initiative action.**
    The quick panel renders it for every selected token. The server rejects non-GM calls, so it is a confusing dead click.
    - `TokenQuickPanel`

13. **Token editing is incomplete for an Owlbear-style table.**
    The quick panel has no way to change token art, name, size, color, owner, temp HP, or condition values/durations. The old token editor was removed wholesale; a compact editor or the Add token flow should cover art and identity.

14. **Campaign import/export is no longer feature-complete.**
    Besides `playerItemGrant`, review whether the new manual-first settings and sheet fields survive round-trip import. The export format is versioned, so import must stay compatible with older archives.

15. **Full-sheet reload flashes on socket updates.**
    `load()` always sets `loading = true`; the `character:updated` listener calls it. A GM changing token HP while a player has the sheet open briefly replaces the sheet with a spinner. Use a silent refresh path for socket-driven updates.

18. **Unsaved detail edits can be reset by unrelated saves.**
    The details form is resynced whenever `draft` changes. Casting, spending a slot, or changing HP can wipe unsaved appearance/notes text. Keep a dirty flag or save details separately.

19. **Sheet overlay rolls have no target DC.**
    The old sheet had a target DC/AC field. The new sheet drawer relies on the chat dice tray for DCs, so degree-of-success rolls are less convenient from the sheet. Add a compact DC/secret control to the sheet topbar.

20. **Builder delete exits the table.**
    `removeCharacter` always navigates to `/campaigns`. When the builder is embedded over the table, deleting a character should return to the table (or the sheet) instead of leaving the campaign.

21. **Dead code and dead CSS remain.**
    `turnEffects.ts`, `tickConditionsForEntry`, `initiative:action`, movement/action fields, `SceneCanvas` active-movement code, and the `.core-sheet-drawer` CSS are no longer used. They increase surface area and make future audits harder.

22. **The test suite has a large skipped tail.**
    23 of 49 browser tests are skipped. Keep a small, explicit “parked features” test file if needed, but remove obsolete tests from the main serial flow so failures point at the current product.

### P2 — polish and maintainability

23. **Action filters are not toggle buttons semantically.** Add `aria-pressed` and a clearer selected state.
24. **Sheet `document.title` is not restored when the overlay closes.** Minor, but the table tab keeps the character's title.
25. **Item-price error text is raw copper.** `Not enough coins (300 cp)` should use the shared currency formatter.
26. **Campaign audit details omit new settings.** `playerItemGrant` is not mentioned in the campaign update audit detail.
27. **`ACTION` reference rows truncate at 120 items.** Search covers the full set, but the list slice can hide later matches when the query is broad. Show a count or paginate.
28. **Condition math vs manual design needs an explicit product decision.** Conditions still automatically change AC, saves, checks, and DCs. That is useful Pathfinder math, but it is one of the few remaining automatic combat behaviours. Document it as “manual tracking, automatic math” or remove it.
29. **Scratch demo files are excluded from typecheck/Prettier.** This is intentional for local work, but those files are untracked and should eventually be removed or moved outside the repo.
30. **No dependency/security audit in CI.** `npm audit` is not part of the gates; it is a reasonable periodic check once dependency versions settle.

---

## Architecture observations

### Good

- Server remains the source of truth for characters, tokens, initiative, and chat.
- The manual-first model is coherent: the table does not move tokens for players, tick conditions, resolve turn effects, or apply damage automatically.
- Character math remains centralized in `shared/rules.ts` and is reused by the sheet and builder.
- The sheet is split into a focused component with a small set of tabs, which is much easier to reason about than the old 5,000-line page.
- The builder is lazy-loaded inside the sheet, keeping the initial table/sheet chunks reasonable.
- The item browser is server-validated for price and grant permission.

### Risks

- **Full-draft PUT for every inline edit** creates revision contention and the dropped-save behaviour above. A small patch endpoint for HP, conditions, pips, and equipment would be safer, or the client should serialize saves through a queue.
- **Two interactive surfaces for the same sheet** (page and overlay) are maintained by one component; permission and loading fixes must cover both.
- **Campaign data still contains removed features.** That is useful for compatibility, but it means “removed” features remain callable through the API and direct URLs. Decide whether that is an intentional archive or technical debt.
- **The sheet is becoming a second builder.** Inline builder, actions, details, gear, and spells are all in one overlay. Keep the tab boundaries and avoid adding campaign management here.

## Recommended fix order

1. Read-only permissions across the sheet and Edit build.
2. Serialize or queue sheet saves; await Cast before posting chat.
3. Fix initiative score input (local state + blur/Enter).
4. Complete the token quick panel (remove conditions, art/name/size, GM-only initiative action).
5. Merge granted spells and pass innate remaining uses.
6. Add `touchCampaign` to item grants and import `playerItemGrant`.
7. Clean hidden campaign tabs, dead automation files, and dead CSS.
8. Reduce skipped E2E tests to active coverage plus an explicit parked-feature list.

## Suggested acceptance checks for the next pass

- A non-owner viewing a sheet sees no write controls and cannot trigger chat casts or the builder.
- Holding the HP +5 button or clicking five pips quickly never loses increments.
- Editing initiative score to `18` sends one update, not two or three.
- A Cleric's domain focus spell appears in the Spells tab without being manually added.
- An at-will innate spell never consumes a limited use.
- Exported and re-imported campaigns preserve player gear-grant permission.
- Token conditions can be added and removed from the quick panel.
