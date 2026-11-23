# Runehall follow-up audit — tabletop polish

Audit date: 2026-11-23

## Scope

A second pass over the manual-first table after the first audit remediation, focused on live campaign use: presence, token editing, movement feedback, condition entry, creature visibility, and token art.

## Fixed in this pass

- **Presence could start empty for the table.** A page that joined the campaign room before the table hook subscribed never received the initial presence list. The campaign-join acknowledgement now includes the current presence snapshot.
- **Clicking a token could nudge it.** Pointer-down initialised the drag position at the click point instead of the token's current square. A click without movement could move the token by the click offset.
- **Dragging now shows distance.** While a token is dragged, a label above it shows the total movement in feet and grid squares using PF2e's alternating diagonal cost. The label disappears on release.
- **Token fields no longer write per keystroke.** Name, image URL, AC, HP, and condition value/duration inputs commit on blur or Enter, avoiding socket floods and caret fights.
- **Sheet switching resets unsaved-detail state.** Loading a different character clears the previous character's dirty flag so its details form cannot block the new sheet.
- **`My sheet` picker now works.** An explicit character choice overrides the selected token's linked character; the token only supplies the default.
- **Condition entry autocompletes from the compendium.** Both the sheet Status tab and the table token panel use a shared cached PF2e condition list.
- **Creature HP and AC are GM-only.** Unlinked creature tokens are redacted in table snapshots and token broadcasts. Linked character tokens keep party HP/AC. The token panel and map also hide creature defenses defensively.
- **Token art uploads are available to owners and the GM.** Players can upload art for their own token; the GM can upload for any token. Player-supplied URLs are restricted to uploaded assets, while the GM retains the URL field.
- **Creature tokens have default portraits.** Any unlinked creature token without custom art gets an archetype icon based on its bestiary traits. The bestiary list shows the same avatar. The icon set is CC BY 3.0 from Game-icons.net; see `public/tokens/creature/ATTRIBUTION.md`.
- **The built-in map library uses open cartography.** The ten presets now use CC BY 4.0 maps from Dyson Logos and Free Fantasy Maps, with grid sizes, grid offsets, thumbnails, and in-app credit lines. See `public/maps/ATTRIBUTION.md`.
- **The token panel header uses generated creature art.** The 40px avatar now matches the token on the map.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run smoke` | Pass |
| `npm run e2e` | 26 passed, 0 skipped |
| Player token-art upload | Verified manually with Playwright, including reset |

## Remaining opportunities

- Token owner reassignment and temp-HP editing still use the character sheet rather than the token panel.
- Legacy campaign render blocks remain bundled even though legacy tab URLs redirect to the table.
- Default creature portraits are curated CC BY 3.0 archetype icons. Curated per-monster art can replace them later without changing token data.
- `npm audit` remains a manual periodic check; production dependencies currently report zero vulnerabilities.
