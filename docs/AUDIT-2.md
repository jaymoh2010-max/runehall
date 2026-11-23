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
- **The built-in map library uses open cartography.** The library now has 37 grid-aligned maps, mostly full colour, from Dyson Logos (CC BY 4.0), Free Fantasy Maps (CC BY 4.0), and mbround18 (CC BY-SA 4.0). Maps include grid sizes, offsets, thumbnails, credit lines, terrain filters, and Pathfinder adventure-theme tags. See `public/maps/ATTRIBUTION.md`.
- **Players can pick or crop portraits.** The account page and character builder share a portrait picker with 35 built-in painted portraits and an upload flow that crops to a square and exports 512 × 512 WebP. Built-in art is CC BY 4.0 from Joseph Hewitt and CC BY 3.0 / CC BY-SA 3.0 from Justin Nichol / Flare. See `public/portraits/ATTRIBUTION.md`.
- **GMs can use the portrait library for token art.** The table token quick panel opens the same picker, including upload-and-crop.
- **The initiative bar sits at the top of the table.** Round, current combatant, and the GM menu are stacked in a compact block under the round marker, leaving the full width for the order. The GM can roll, add a combatant, end the round manually, reorder the active combatant, or clear from that menu.
- **The table toolbar wraps cleanly.** Scene controls, fog controls, and the sheet/presence controls now space themselves across the row and fall to a second row on narrow screens instead of crowding together.
- **The token panel header uses generated creature art.** The 40px avatar now matches the token on the map.

## Verification

| Command | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run smoke` | Pass |
| `npm run e2e` | 26 passed, 0 skipped |
| `npm run simulate:campaign` | 17 passed, 0 failed |
| Player token-art upload | Verified manually with Playwright, including reset |

## Cleanup pass

- Campaign navigation is now exactly **Table / Party / Journal / Settings**. The hidden prep tabs
  (Overview, Session Zero, People, Arc, Travel, Clocks, Sessions, Encounters, Loot, NPCs, Assets,
  Notes, and GM Screen) and their client components were removed.
- The API route modules behind those screens were removed: chapters, clocks, dashboard, encounters,
  loot, NPCs, notes, sessions, session zero, shop, and travel. Unused campaign-request, calendar,
  catch-up, wealth, XP-award, Hero Point, downtime, and long-rest endpoints were removed from the
  campaign route.
- Shared PF2e rules helpers and their unit tests remain in the repository as reusable rules library
  code even where no current screen calls them.
- The campaign simulator now covers the four-tab loop: party membership, tokens and ownership, scene
  visibility, initiative visibility, level-up sync, journal visibility and quest XP, revisions,
  export/import, milestone advancement, and live metadata.
- Accessibility cleanup: the presence group has an explicit role, initiative reroll/remove targets
  are 24px, and scene tokens no longer advertise a right-click editor that is not wired up.
- Bundled map, portrait, and creature-token credits are linked from `THIRD_PARTY_NOTICES.md`.

## Character effect application review

- **Selection is wired through.** `contextForDraft` resolves the selected ancestry, heritage,
  background, class, deity, every feat slot, free-archetype feats, background and class-granted
  feats, feat choices, equipment, runes, and companion statblocks. `computeCharacter` then applies
  the curated effects to HP, Speed, initiative, skill ranks, proficiencies, Lore, senses, languages,
  AC, saves, attacks, damage, and validation.
- **Feats.** Curated always-on effects cover Toughness, Fleet, Incredible Initiative, Untrained
  Improvisation, Armor Proficiency, Weapon Proficiency, Canny Acumen, Additional Lore, Nimble Elf,
  Elven Instincts, Incredible Investiture, Unburdened Iron, Clan Pistol, Hellspawn, Proximity Alert,
  and unconditional darkvision/low-light ancestry feats. Natural Ambition and Ancestral Paragon
  resolve their granted feat. Feats with conditional or activity-based text remain labelled
  **Manual** or **Partly automated** in the builder. Toughness also lowers the automated dying
  recovery DC.
- **Items.** Base weapons, armor, shields, potency/striking/resilient/property runes, and curated
  worn-item bonuses are applied. Invested magic items now require the **Invest** toggle before their
  bonuses count, and the sheet warns when an equipped invested item is inactive. Item bonuses of the
  same type no longer stack: armor potency, ABP defense, resilient runes, and item bonuses such as
  Bands of Force or Assassin's Bracers use the highest value. Added static Athletics, Performance,
  and Will bonuses for the Belt/Bracers of Strength, Uzunjati Storytelling Amulet, and Amulet of
  Kinship's Strength. Handwraps of Mighty Blows accept weapon runes in the builder and apply them to
  the unarmed strike.
- **Conditions.** Frightened, sickened, clumsy, enfeebled, stupefied, drained, fatigued, off-guard,
  prone, grabbed, restrained, blinded, confused, unconscious, encumbered, and the dying/wounded/doomed
  track are applied to the derived sheet. Blinded now also applies off-guard. Deafened, fleeing,
  dazzled, immobilized, action-loss conditions, and detection states are surfaced as notes.
- **Coverage limit.** The compendium carries feat and item prose rather than Foundry rule elements, so
  the long tail remains manual by design. The builder displays an automation badge on every feat and
  item so the table knows which numbers are already on the sheet.

## Remaining opportunities

- Token owner reassignment and temp-HP editing still use the character sheet rather than the token panel.
- Default creature portraits are curated CC BY 3.0 archetype icons. Curated per-monster art can replace them later without changing token data.
- `npm audit` remains a manual periodic check; production dependencies currently report zero vulnerabilities.
