# Trust model

Runehall is a table aid for a group that already trusts each other and a host
who controls the server and database. It optimizes for low friction at the
table, not for competitive anti-cheat. The server enforces structure and
permissions; the table is trusted to keep its own books honest.

This page records the boundary so a new feature does not quietly become an
enforcement mechanism, and so a table can see what it is choosing to trust.

## What the server enforces

- Account, session, campaign membership, GM/player, and character ownership
  permissions.
- Campaign roles for level advancement, awards, imports, journal visibility,
  scene management, and settings.
- Item legality for the campaign ruleset, stack limits, and the stored summary
  and derived state.
- Coin cost when an item is bought through the gear browser's purchase route.
- Source ownership, available stack, and available coins when a character
  gives an item or coins to another campaign character.
- Optimistic revisions on character saves, so two editors do not silently
  overwrite each other.
- Upload type, size, dimension, quota, and campaign access checks.
- Schema migration names and checksums, so a database from another branch or an
  edited migration is refused instead of being silently changed.

## What the table is trusted to do

- Edit the character sheet, including HP, conditions, currency, inventory
  quantities, equipped/invested flags, and other play state. A save replaces
  the stored draft; the server recalculates the summary and derived state but
  does not audit or reject ordinary stat changes.
- Use the inventory **+/-** controls as manual adjustments. They do not charge
  or refund coins. Buying through the gear browser does enforce the listed
  price, and selling applies the usual half-price value in the sheet.
- Duplicate a character they own, or any campaign character if they are that
  campaign's GM. A duplicate is a full copy into the same campaign, including
  gear, coins, custom items, and play state.
- Award treasure and grant gear as the GM. These are table decisions, not a
  server-side economy.

## Decisions

### Character duplication is a full copy

Duplication is a convenience for backups, variants, and bringing a new
character in without rebuilding it. It is intentionally **not** a build
template and **not** GM-only:

- The owner or the campaign GM may duplicate.
- The copy joins the same campaign and keeps the source's gear and coins.
- The dashboard asks for confirmation before copying a campaign character and
  says that gear and coins are kept.
- Duplicating a campaign character writes a `character.duplicate` audit entry
  with the source, the copy, the number of inventory stacks, and the copied
  coin value. Audit writes are best-effort and are not a security boundary.

A table that treats campaign wealth as competitive can keep free grants off,
avoid duplicating campaign characters, and review the audit log. A future
untrusted-hosting mode would need a server-side economy ledger and a
template-only duplicate mode; that is not the current product.

### Inventory quantity edits are manual

The sheet's **+/-** controls are for loot, rewards, crafting, consumables,
corrections, and other table bookkeeping. Routing every increase through the
purchase endpoint would break those flows, and diffing every saved draft to
infer a purchase would be an anti-cheat feature the product does not promise.

The purchase route remains the priced path: it checks coins and rejects items
that are not available under the campaign ruleset. The sheet labels the manual
controls and explains that they do not charge coins, so the behavior is
visible rather than surprising.

## Accountability

The admin audit log records security-relevant actions, including campaign
changes, awards, transfers, and campaign character duplication. It has
retention controls and CSV export. It is an accountability aid, not a
prevention mechanism: a trusted player can still edit their own sheet, and the
host can still change the database directly.

## Stricter hosting

If Runehall is ever offered to untrusted players, the following would need to
change before that promise is honest:

- Move currency and inventory mutations behind narrow server endpoints with a
  ledger, instead of saving the whole draft.
- Make duplication a template copy that clears campaign membership, inventory,
  and currency by default.
- Add a server-side review queue or diff for unusual sheet changes.
- Separate the host role from campaign GM so a server operator is not silently
  also the table's referee.

Until then, use Runehall with a group you trust, keep backups, and treat the
audit log as a record rather than a guard.
