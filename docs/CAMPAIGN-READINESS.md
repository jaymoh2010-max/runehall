# PF2e campaign readiness

**Reviewed:** 22 November 2026  
**Scope:** PF2e Remastered play from session zero through level 20, compared with GM Core, Player Core, and the practical needs of a long-running table.  
**Verification:** `npm run check`, `npm run smoke`, `npm run e2e`, and `npm run simulate:campaign`.

> **Current status:** Runehall can run a full 1–20 campaign with a GM and roughly 4–10 players. The core loop — invite, party, builder, sheet, table, encounter, initiative, conditions, rest, loot, journal, sessions, downtime, travel, clocks, archive, and restore — is implemented and covered by tests. Free Archetype is supported as a campaign variant; Automatic Bonus Progression and multiclass-archetype spellcasting remain manual.

---

## Verdict

Runehall is a complete **campaign table**, with a few deliberate boundaries:

- **Ready:** accounts and invites, campaign membership, 1–20 character building, live sheets, server-rolled combat, HP/dying/wounded, conditions, afflictions, item activation, prepared/spontaneous/focus/innate casting, loot and shops, downtime, travel, sessions, safety tools, journal/handouts, victory-point clocks, export/import, backup/restore, and administrator moderation.
- **GM-facing preparation:** encounters, waves, hazards-as-XP, NPCs, factions, merchants, scenes, chapter/arc scaffolding, optional tracked stock, and a live GM screen.
- **Manual by design:** optional variant rules, unusual feat/item effects, published-adventure conversion, hexcrawl mapping, and long-running project bookkeeping.

The rest of this document records what is verified and what remains manual, so a GM can decide before session zero.

---

## Latest verification

| Check | Result |
| --- | --- |
| `npm run check` | Typecheck, lint, formatting, unit tests, production build, and bundle budget pass |
| Unit tests | 665 passing |
| `npm run e2e` | 48 passing browser scenarios |
| `npm run smoke` | End-to-end smoke suite passes |
| `npm run simulate:campaign` | 85 passed, 0 failed, 0 observations |

The campaign simulation exercises two complete 1–20 campaigns, including XP and milestone advancement, party catch-up, long rests, loot, shops, downtime, travel, sessions, quest XP, ownership transfer, export/import, revisions, and permission boundaries.

---

## What is automated

### Characters and progression

- Level 1–20 builder with ancestry, heritage, background, class, deity, ability boosts, skills, feats, spells, gear, runes, companions, details, and review.
- Optional **Free Archetype** campaign variant: an extra archetype feat slot at every even level, an archetype-only picker, and validation that the chosen feat has the archetype trait and fits the slot level.
- PF2e prerequisites, class access, feat-slot categories, spell repertoires, prepared slots, divine font, focus, innate spells, rituals, and cantrip limits.
- Derived HP, AC, saves, Perception, class/spell DCs, attacks, damage, skills, lore, speed, senses, Bulk, invested items, and wealth.
- Encumbrance: carrying more than `5 + Strength` Bulk automatically applies Encumbered (Clumsy 1 and −10 ft Speed); exceeding the hard maximum adds a validation warning.
- Milestone or XP advancement with fast/medium/slow thresholds, hazard and accomplishment awards, catch-up, level-20 cap, and an XP ledger.
- GM-controlled level-up with linked-token HP/AC sync and a guided level-up checklist.

### Table and combat

- Scene maps, grid calibration, fog, walls/doors, lights, vision, props, templates, measurement, and player-safe filtering.
- Encounter budgets, waves, reinforcements, grouped monsters, hidden combatants, and cleanup.
- Initiative, delay/ready, per-turn actions and reaction tracking, movement/Speed enforcement, and per-turn automation.
- Typed and nonlethal damage, monster resistances/weaknesses/immunities, temporary HP, dying/wounded/unconscious, doomed, regeneration, fast healing, and persistent damage.
- Conditions with values/durations and shared sheet/token math.
- Staged poisons, diseases, and curses with onset, intervals, virulent successes, and **maximum durations**. Round durations advance at end of turn; an eight-hour long rest advances longer durations.
- Treat Wounds, Battle Medicine, Stabilize, immunities, Robust Health, Continual Recovery, and Evasion/Juggernaut save upgrades.
- Item activation, consumable healing, wands, per-day uses, invested items, and daily resets.
- Sustained spells, counteract checks, incapacitation, rituals, and innate spellcasting.
- Monster Elite/Weak templates, statblock attacks, damage, and ability sharing from the token panel.

### Campaign play

- Party requests with GM approval: level-up, downtime, and player-written journal entries. Nothing changes until the GM approves or denies it; players can withdraw pending requests.
- Victory-point clocks with 1–12 segments, GM-only or player-visible clocks, optional player ticks, and live updates.
- Downtime days, cost of living, Earn Income, Subsist, Craft/Retrain trackers, and server-charged upkeep.
- Travel planning with PF2e pace, terrain, weather metadata, four watches, exploration activities, waypoints, encounter checks, and calendar advancement.
- Sessions, attendance, check-ins, recap drafts, session zero/safety tools, private notes, shared knowledge, factions, NPCs, quests, handouts, and merchant stock.
- Loot parcels, treasure-by-level audit, replacement wealth, shops, transfers, and campaign export/import.
- Golarion calendar with leap day and GM time controls.

### Operations and security

- Local accounts with scrypt hashes and HTTP-only session cookies.
- Session metadata (device, IP, last seen), per-device sign-out, and “sign out other devices”.
- Administrator account moderation: suspend/restore, revoke sessions, and promote/demote administrators with last-admin safeguards. Suspension revokes sessions and disconnects live sockets.
- Registration modes, single-use invite codes, expiry, revocation, and a pending-invite cap.
- Audit log with retention controls and CSV export.
- Backup staging publishes a completed archive with a single rename, so interrupted backups are not mistaken for valid ones.
- Compendium version metadata is exposed by `/api/health` and recorded in campaign archives.

---

## Coverage against a PF2e campaign

| Stage | Support | Status |
| --- | --- | --- |
| Session zero | Shared charter, genre/tone, content limits, safety tools, private lines/veils, anonymous pause signal, allowed sources, party goal/hooks | Strong |
| Scheduling | Sessions, check-ins, attendance, next-session date, live updates | Strong; no external reminders/ICS |
| Onboarding | Registration/invites, join requests, Pathbuilder import, character assignment | Strong |
| Character build | 1–20 builder, prerequisites, slots, runes, companions, budget, import, Free Archetype | Strong; uncommon effects remain manual |
| Advancement | Milestone or XP, GM approval, player requests, catch-up, wealth top-up | Strong |
| Combat | Budgets, waves, initiative, actions, conditions, typed damage, IWR, death/recovery, afflictions | Strong with manual edge cases |
| Exploration | Travel pace, terrain, weather, watches, activities, waypoints, calendar | Partial; no hexcrawl map or automatic weather effects |
| Social | NPCs, factions, attitude, reputation, secrets, public views, shops | Strong for a campaign ledger |
| Downtime | Days, upkeep, Earn Income, Subsist, Craft/Retrain | Partial; rituals and full crafting costs manual |
| Treasure | Parcels, audit, shops, tracked stock, transfers, wealth benchmarks | Strong; no Automatic Bonus Progression |
| Campaign log | Journal, handouts, quests, recap, knowledge, private notes | Strong |
| World clock | Golarion date, leap day, downtime, travel, sessions | Strong |
| Table | Maps, fog, walls, lighting, tokens, chat, dice, music, clocks | Strong |
| Archive/portability | JSON export/import, embedded assets, SQLite backup/restore, verified manifests | Strong |
| Safety/access | GM/player views, private limits, anonymous signal, admin moderation | Strong; no third-party anonymous channel |
| Adventure path | Arc chapters, level bands, encounters, treasure, NPCs, quests | Partial; no automated AP import |

---

## Remaining manual or missing

These are known boundaries, not silent failures. The sheet and UI label manual effects where possible.

### Optional variant rules

- **Automatic Bonus Progression** is not modeled. Use normal runes or manual notes.
- **Multiclass-archetype spellcasting** (for example, Wizard Dedication spellcasting feats) is not parsed into slots. Record the granted spells and slots manually.

These are optional campaign variants; the base Remastered rules do not require them.

### Rules automation

- Unusual feat, item, heritage, and class effects may remain prose-only. Automation badges are conservative.
- Compendium hazard statblocks and hazard actors are not implemented; hazards can be awarded as XP and run as custom statblocks/notes.
- Compendium affliction presets are not bundled; afflictions are entered manually.
- Some action-count spell variants, fixed-rank heightening, and data conflicts stay manual.
- Difficult terrain, elevation/flying, squeezing, forced movement, flanking automation, and token-to-token collision are not automated.
- AoE templates are visual, not target-resolution cards.

### Campaign depth

- No hex/pointcrawl map, automatic weather effects, chase track, or foraging/tracking checks.
- No external reminders, ICS export, time-zone scheduling, or recurring sessions.
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

See [BACKUP.md](BACKUP.md), [DEPLOY.md](DEPLOY.md), and [FIRST-CAMPAIGN.md](FIRST-CAMPAIGN.md) for operational steps.

---

## Rules references

- XP and advancement: <https://2e.aonprd.com/Rules.aspx?ID=2648>
- Encounter budgets: <https://2e.aonprd.com/Rules.aspx?ID=2716>
- Treasure by level: <https://2e.aonprd.com/Rules.aspx?ID=2656>
- Rest and daily preparations: <https://2e.aonprd.com/Rules.aspx?ID=2443>
- Victory points/subsystems: <https://2e.aonprd.com/Rules.aspx?ID=3028>
- Afflictions: <https://2e.aonprd.com/Rules.aspx?ID=2749>
- Bulk and encumbrance: <https://2e.aonprd.com/Rules.aspx?ID=2581>
- Automatic bonus progression: <https://2e.aonprd.com/Rules.aspx?ID=2741>
