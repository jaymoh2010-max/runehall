# P3 backlog

This is the working list for post-P2 work. The source findings are in
`docs/AUDIT-4.md`; keep this file current when a batch ships.

## Inventory and consumable lifecycle (Done)

| Item | Status | Notes |
| --- | --- | --- |
| Bomb and ammunition consumption | Done | Bomb attacks consume one from their own stack; ranged attacks offer an ammunition selector and consume one per attack. Bundle sizes and per-bundle pricing remain manual. |
| Limited-use stack merging | Done | Daily/staff pools add their caps and spent uses; multi-use consumables pool remaining uses into one container. Transfer and normalization share the same merge helper. |
| Staff daily reset | Done | Staff base charges are stored separately; a long rest discards extra expended-slot charges and leaves the base pool empty until preparation. |
| Item transfers and custom items | Done | The sheet has a Give modal; the server copies custom-item definitions to the receiver and removes the source definition when the stack is gone. |

## Affliction and poison picker (Done)

| Item | Status | Notes |
| --- | --- | --- |
| Compendium affliction picker | Done | The sheet searches published poisons, diseases, and curses, then prefills DC, save, onset, interval, duration, stages, and source. |
| Poison item link | Done | Poison-trait inventory items expose a Track action that opens the picker with the item name. |
| Source link | Done | Tracked compendium afflictions store `sourceId` and link back to the library entry. Stage effects remain manual. |

## Live rune lifecycle (Done)

| Item | Status | Notes |
| --- | --- | --- |
| Equipment etch/detach | Done | The sheet lists matching rune items from the pack, consumes one on etch, and returns it on detach. |
| Fundamental replacement | Done | Etching a higher potency rune returns the replaced fundamental rune to the pack. |
| Slot validation | Done | Property runes require an open potency slot; reducing potency cannot strand existing property runes. |
| Runesmith etch/re-etch | Done | The sheet can etch a new base rune or replace an etched rune from the repertoire, resetting its target and diacritic. |

## Operational hardening (Done)

| Item | Status | Notes |
| --- | --- | --- |
| Migration history verification | Done | Migration 59 stores a SHA-256 checksum; the runner rejects reused version names or edited SQL before applying anything. |
| Audio bookkeeping | Done | Audio upload writes the asset and track rows in one transaction; delete commits row changes before removing the backing file. |
| Restore server check | Done | Each probe host is checked three times with a 1.5-second timeout before restore proceeds. |

## Next P3 batches

1. **Trust-model decisions:** decide whether character duplication may clone
   campaign gear/currency and whether free quantity edits should use the
   purchase ledger.
2. **Large campaign imports:** add rate limiting or background processing for
   archives that still hold the event loop and write lock.

Before starting a batch, check `git worktree list` and open branches so two
sessions do not edit the same sheet or rules files concurrently.
