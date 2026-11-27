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

## Next P3 batches

1. **Affliction and poison picker:** prefill the tracker from compendium
   afflictions and link poison equipment entries to their affliction records.
2. **Live rune lifecycle:** etch and detach equipment runes on the sheet, consume
   the matching rune item, and block double payment. Add on-sheet Runesmith
   re-etching alongside the existing Invoke action.
3. **Operational hardening:** store migration names/checksums to reject reused
   versions, make asset/audio bookkeeping transactional, and strengthen the
   restore running-server check.
4. **Trust-model decisions:** decide whether character duplication may clone
   campaign gear/currency and whether free quantity edits should use the
   purchase ledger.
5. **Large campaign imports:** add rate limiting or background processing for
   archives that still hold the event loop and write lock.

Before starting a batch, check `git worktree list` and open branches so two
sessions do not edit the same sheet or rules files concurrently.
