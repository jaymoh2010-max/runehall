# PF2e campaign readiness

**Reviewed:** 22 November 2026  
**Scope:** PF2e Remastered play from session zero through level 20, compared with GM Core, Player Core, and the practical needs of a long-running table.  
**Verification:** `npm run check`, `npm run smoke`, `npm run e2e`, and `npm run simulate:campaign`.

> **Current status:** Runehall can run a full 1-20 campaign with a GM and roughly 4-10 players. The core loop - invite, party, builder, sheet, table, encounter, initiative, conditions, rest, journal, archive, and restore - is implemented and covered by tests. Free Archetype and Automatic Bonus Progression are supported as campaign variants; multiclass-archetype spellcasting remains manual.

---

## Verdict

Runehall is a complete **campaign table**, with a few deliberate boundaries:

- **Ready:** accounts and invites, campaign membership, 1-20 character building, live sheets, server-rolled combat, HP/dying/wounded, conditions, afflictions, item activation, prepared/spontaneous/focus/innate casting, journal/handouts, export/import, backup/restore, and administrator moderation.
- **Campaign surface:** Table, Party, Journal, and Settings only. Removed-feature tables are gone; legacy session-zero, faction, lore, and chapter data is export/import-only archive data with no live UI or mutation endpoint.
- **GM-facing preparation:** encounters, waves, hazards-as-XP, scenes, and the campaign journal.
- **Manual by design:** optional variant rules, unusual feat/item effects, published-adventure conversion, hex-grid mapping, and long-running project bookkeeping. Condition application, durations, and ambiguous interactions stay with the GM; the sheet applies the numeric modifiers for tracked conditions.

The rest of this document records what is verified and what remains manual, so a GM can decide before session zero.

---

## Latest verification

| Check | Result |
| --- | --- |
| `npm run check` | Typecheck, lint, formatting, unit tests, production build, and bundle budget pass |
| Unit tests | 833 passing |
| `npm run e2e` | 43 passing browser scenarios |
| `npm run smoke` | End-to-end smoke suite passes |
| `npm run audit:prod` | 0 production dependency vulnerabilities |
| `npm run simulate` | 2,337 characters, 145 class/level matrix builds, 578 option builds, 38 ancestries × 269 backgrounds; 0 problems |
| `npm run simulate:feats` | 144,565 class/feat combinations checked; 39,166 accessible feats reflected on the sheet; 0 failures |
| `npm run simulate:campaign` | 18 passed, 0 failed, 0 observations per run |
| `npm run simulate:parties` | 23 passed, 0 failed, 0 observations (7 campaigns, 29 characters, 140 level steps, one campaign with Free Archetype + ABP) |

The campaign simulation exercises two complete 1-20 campaigns per run, one XP and one milestone, including tokens, hidden scene layers, party advancement, level-20 cap, export/import, revisions, and permission boundaries. The party simulation advances seven class-combination campaigns from level 1 to 20, rebuilding and saving all 29 remaster classes through the real character API at every level. The feat audit tests every accessible class/feat combination at level 20, including class-grant choices, selected-feat reflection, finite sheet math, valid damage formulas, and automation notes; incompatible classes and unmet prerequisites are counted separately.

---

## What is automated

### Characters and progression

- Level 1–20 builder with ancestry, heritage, background, class, deity, ability boosts, skills, feats, spells, gear, runes, companions, details, and review.
- Optional **Free Archetype** campaign variant: an extra archetype feat slot at every even level, an archetype-only picker, and validation that the chosen feat has the archetype trait and fits the slot level.
- Optional **Automatic Bonus Progression** campaign variant: level-based attack potency, devastating attack dice, defense potency, save potency, Perception potency, a chosen skill potency, and a 17th-level ability apex. Fundamental rune bonuses do not stack with ABP; property runes still apply.
- PF2e prerequisites, class access, feat-slot categories, spell repertoires, prepared slots, divine font, focus, innate spells, rituals, and cantrip limits.
- Campaign content scope is enforced for builder pickers, sheet gear search, and server-side item purchases and grants.
- Derived HP, AC, saves, Perception, class/spell DCs, attacks, damage, skills, lore, speed, senses, Bulk, invested items, and wealth.
- Encumbrance: carrying more than `5 + Strength` Bulk automatically applies Encumbered (Clumsy 1 and −10 ft Speed); exceeding the hard maximum adds a validation warning.
- Milestone or XP advancement with fast/medium/slow thresholds, hazard and accomplishment awards, catch-up, level-20 cap, and an XP ledger.
- GM-controlled level-up with linked-token HP/AC sync and a guided level-up checklist.
- Commander tactics: a 5-11 tactic folio, 3-6 daily preparations, builder picker, validation, and a prepared-tactics list on the sheet. Expert/master/legendary tier access stays manual because the compendium does not tag it.
- Runesmith runes: a 44-rune repertoire with printed level limits, etched-rune tracking, diacritic attachment, target notes, and an Invoke button on the sheet. Rune effects and invocation results remain prose for the table.
- Background grants: curated overrides fill the remaining prose-only skill and feat choices for 14 backgrounds. Deity-, rival-, campaign-, and past-life-dependent choices stay manual, as do category-wide picks such as Kaiju Stalker's Athletics feat.

### Table and combat

- Scene maps, grid calibration, fog, walls/doors, lights, vision, props, templates, measurement, and player-safe filtering.
- Encounter budgets, waves, reinforcements, grouped monsters, hidden combatants, and cleanup.
- Initiative, delay/ready, per-turn actions and reaction tracking, movement/Speed enforcement, and per-turn automation.
- Typed and nonlethal damage, monster resistances/weaknesses/immunities, temporary HP, dying/wounded/unconscious, doomed, regeneration, fast healing, and persistent damage.
- Conditions with values/durations and shared sheet/token math.
- Staged poisons, diseases, and curses with onset, intervals, virulent successes, and **maximum durations**. Round durations advance at end of turn; an eight-hour long rest advances longer durations.
- Treat Wounds, Battle Medicine, Stabilize, immunities, Robust Health, Continual Recovery, and Evasion/Juggernaut save upgrades.
- Item activation, consumable healing, wands, per-day uses, invested items, and daily resets.
- Sustained spells, counteract checks, incapacitation, rituals, and innate spellcasting. Innate daily uses can be set explicitly per spell, with spell prose as the fallback.
- Monster Elite/Weak templates, statblock attacks, damage, and ability sharing from the token panel.

### Campaign play

- Party requests with GM approval: level-up and player-written journal entries. Nothing changes until the GM approves or denies it; players can withdraw pending requests.
- Session zero and safety tools were retired with the hidden campaign tabs; legacy session-zero, faction, lore, and chapter data round-trips through campaign export/import only.
- Quests, handouts, and campaign export/import.
- Accessibility: visible controls across the dashboard, table, party, journal, settings, sheet tabs, builder steps, library, rules, account, and admin expose accessible names. The in-table character sheet traps focus, restores it on close, and toasts use status/alert roles.
- Golarion calendar with leap day and GM time controls.

### Operations and security

- Local accounts with scrypt hashes and HTTP-only session cookies.
- Session metadata (device, IP, last seen), per-device sign-out, and "sign out other devices". Revoked or expired sessions close live sockets within 30 seconds.
- Administrator account moderation: suspend/restore, revoke sessions, and promote/demote administrators with last-admin safeguards. Suspension revokes sessions and disconnects live sockets.
- Registration modes, a production `BOOTSTRAP_TOKEN` gate for the first administrator, single-use invite codes, expiry, revocation, and a pending-invite cap.
- Audit log with retention controls and CSV export.
- Production dependencies are audited in CI with `npm run audit:prod`.
- Upload quotas, a low-disk guard, and backup/restore checks that refuse archives missing database-referenced uploads.
- Backup staging publishes a completed archive with a single rename, so interrupted backups are not mistaken for valid ones.
- Pending schema upgrades take a verified database snapshot first; a failed migration restores it automatically, and older snapshots are pruned with `MIGRATION_BACKUP_KEEP`.
- Compendium version metadata is exposed by `/api/health` and recorded in campaign archives.

---

## Coverage against a PF2e campaign

| Stage | Support | Status |
| --- | --- | --- |
| Session zero | Shared charter, genre/tone, content limits, safety tools, private lines/veils, anonymous pause signal, allowed sources, party goal/hooks | Strong |
| Onboarding | Registration/invites, join requests, Pathbuilder import, character assignment | Strong |
| Character build | 1–20 builder, prerequisites, slots, runes, companions, budget, import, Free Archetype and ABP | Strong; uncommon effects remain manual |
| Advancement | Milestone or XP, GM approval, and player requests | Strong |
| Combat | Budgets, waves, initiative, actions, conditions, typed damage, IWR, death/recovery, afflictions | Strong with manual edge cases |
| Treasure | Inventory (quantities, sell, drop), transfers, wealth benchmarks, ABP option | Strong; ABP replaces fundamental rune math |
| Campaign log | Journal, handouts, and quests | Strong |
| Calendar | Golarion date and leap day | Strong |
| Table | Maps, fog, walls, lighting, tokens, chat, dice, music | Strong |
| Archive/portability | JSON export/import, embedded assets, SQLite backup/restore, verified manifests | Strong |
| Safety/access | GM/player views, private limits, anonymous signal, admin moderation | Strong; no third-party anonymous channel |
| Adventure path | Encounters, NPCs, and quests | Partial; no automated AP import |

---

## Remaining manual or missing

These are known boundaries, not silent failures. The sheet and UI label manual effects where possible.

### Optional variant rules

- **Multiclass-archetype spellcasting** (for example, Wizard Dedication spellcasting feats) is not parsed into slots. Record the granted spells and slots manually.

These are optional campaign variants; the base Remastered rules do not require them.

### Rules automation

- Unusual feat, item, heritage, and class effects may remain prose-only. Automation badges are conservative. Common situational feats such as Shield Block, Ride, Assurance, Trick Magic Item, and Quick Identification now record their table rules as partial automation notes; Skill Training applies its first chosen skill.
- Compendium hazard statblocks and ready-made hazard presets are not bundled. GMs can save custom hazards in the NPC & hazard library with trigger, disable, and routine text, then award hazard XP separately.
- Compendium affliction statblocks are not bundled. Built-in recovery-frame templates cover common poison, disease, and curse shapes; stage effects remain manual.
- Some action-count spell variants, fixed-rank heightening, and data conflicts stay manual.
- Difficult terrain, elevation/flying, squeezing, forced movement, flanking automation, and token-to-token collision are not automated.
- AoE templates list affected tokens and track round durations, but do not apply saves or damage automatically.

### Campaign depth

- No published-adventure importer, kingdom building, vehicles, mass combat, or automated companion advancement.
- No third-party anonymous safety channel; the GM-only pause signal is the supported path.
- Public hosting still needs TLS, a reverse proxy, off-machine backups, and the deployment checklist in `docs/DEPLOY.md`. Session revocation, moderation, invite limits, and backup atomicity are in place.

---

## Reproduce

```bash
npm run check
npm run smoke
npm run e2e
npm run simulate:campaign
npm run simulate:parties
npm run simulate:feats
```

Campaign simulation reports:

```bash
npm run simulate:campaign -- --report campaign-simulation-report.json
```

Backup and restore:

```bash
npm run backup -- --dir D:\RunehallBackups --keep 14
npm run restore -- --from "D:\RunehallBackups\runehall-..." --yes
```

See [BACKUP.md](BACKUP.md), [DEPLOY.md](DEPLOY.md), and [FIRST-CAMPAIGN.md](FIRST-CAMPAIGN.md) for operational steps, and [P2-BACKLOG.md](P2-BACKLOG.md) for the remaining polish and rules-completeness work.

---

## Rules references

- XP and advancement: <https://2e.aonprd.com/Rules.aspx?ID=2648>
- Encounter budgets: <https://2e.aonprd.com/Rules.aspx?ID=2716>
- Treasure by level: <https://2e.aonprd.com/Rules.aspx?ID=2656>
- Rest and daily preparations: <https://2e.aonprd.com/Rules.aspx?ID=2443>
- Afflictions: <https://2e.aonprd.com/Rules.aspx?ID=2749>
- Bulk and encumbrance: <https://2e.aonprd.com/Rules.aspx?ID=2581>
- Automatic bonus progression: <https://2e.aonprd.com/Rules.aspx?ID=2741>
