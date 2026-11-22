# PF2e campaign readiness review

**Reviewed:** 18 November 2026  
**Scope:** PF2e Remastered campaign play from session zero through level 20, compared with GM Core/Player Core and common GM/player tooling expectations.  
**Artifacts:** `scripts/simulate-campaign.ts` (new), `scripts/lib/simHeroes.ts` (new), `npm run simulate:campaign`.

> **Current status (release pass, November 2026):** Many items from the original P0 audit are now implemented: condition modifiers, temp HP absorption, dying/unconscious life state, healing reconciliation, wounded-on-recovery, doomed death threshold, Hero Point reroll, Refocus, hidden-token initiative filtering, hidden-prop/wall/template filtering, linked-token HP preservation, and encounter cleanup/relaunch. Linked sheets and tokens now share one condition list, and open sheets plus party cards consume live character updates. Sheet rolls support target DC/AC, secret visibility, second/third-attack MAP, and critical damage. Common level-1 heritage mechanics now apply Skilled Human, Versatile Human, Ancient Elf, Aiuvarin, Dromaar, Nephilim, Changeling, Dhampir, Dragonblood, and Duskwalker choices, senses, and feat access; other heritages show manual notes. Level-1 starting wealth now covers gear plus carried coins, while imported/looted characters remain unbudgeted. Fixed class-choice grants now cover Druid orders, Bard muses, Wizard school focus plus rank-0/rank-1 curriculum, Sorcerer focus plus fixed level-1 bloodline gifts, and Cleric doctrines. Free class choices now cover Cleric domains, Champion devotion spells, Elemental Sorcerer elements, and Runelord sins; higher-level domains, second blessings, advanced bloodline gifts, and higher-rank sin curriculum remain manual. Cleric divine font is prepared and displayed as a separate pool from ordinary slots, dual-font deities require an explicit Heal or Harm choice, and granted spells no longer need to be added twice. The sheet now casts spells: it spends ordinary slots, Cleric font slots, focus points, and individual prepared/font copies, offers rank choices for spontaneous casters and a prepared rank for upcasting, and auto-computes structured interval damage when the printed heightening is safe. Heal, Harm, and Force Barrage expose 1/2/3-action formulas and rolls. Character sheets also track custom staged afflictions with a save, DC, interval, virulent successes, and automatic stage changes from stage saves. Dying characters get a start-of-turn recovery-check button that applies dying, wounded, and death outcomes; persistent damage entries roll their end-of-turn damage and per-entry flat checks from the sheet. Sorcerer/Oracle slots, tradition gating, cantrip caps, and core-only class-choice filtering are corrected. Sessions now stay current until marked played, session changes reach open dashboards live, and the Sessions calendar is the single source for the next-session date. Quest XP is gated to XP tracking mode and a paid reward cannot be reset by editing the handout. Secret chat and secret rolls use independent toggles. Still open for a first campaign: action-variant formulas beyond Heal/Harm/Force Barrage, prose-only spell heightening, compendium affliction presets, higher-level free class choices, cause sanctification enforcement, higher-rank Wizard curriculum lists. Linked PC sheets now carry fast healing/regeneration, apply it at turn start, cap dying while regeneration is active, and suppress it from matching typed or persistent damage. Round-based affliction onset and interval timers now tick at the end of the character's turn, and the stage save is rolled automatically when the interval reaches zero. Prepared casters now confirm today's spells after a long rest in a daily-preparation modal that enforces ordinary, divine-font, and Wizard curriculum slots and marks preparations pending until confirmed. Campaign advancement now supports fast/medium/slow thresholds, simple/complex hazard XP, accomplishment awards, and a GM-visible XP ledger. Treasure-by-level auditing, replacement-character wealth, and a settlement-level shop are implemented; persistent merchant stock, the permanent/consumable item-mix planner, and cost-of-living remain open. Linked-character turn automation resolves dying recovery and persistent damage when initiative advances, and unlinked monsters now carry fast healing, regeneration, and persistent damage seeded from their statblocks. Player movement now enforces turn order and remaining Speed during initiative, with GM override and snap-back errors. GM Hero Point controls now award 1-3 points to selected characters (capped at 3), reset the party to 1 for a new session, show each character's points on the party cards, and record awards/resets in the audit log; a dying character with points can use Heroic Recovery to stabilize at 0 HP without adding wounded, and turn automation defers the recovery check while that choice is available. The tables below preserve the original audit baseline; read the status labels alongside the README and ROADMAP for the current implementation.

---

## Verdict

Runehall is already a strong **campaign table**: invite → join → party roster → character sheet → map/fog/walls/lighting → encounter launch → initiative → chat/dice → loot → journal/handout → session recap is a real, working loop. The simulation played two complete 1–20 campaigns and found the campaign spine, progression plumbing, permissions, calendar, rest, loot, sessions, and export/import working as intended.

It is **not yet a full adventure-path runner or a complete exploration/downtime game**. The largest gaps are:

1. **Rules trust:** conditions, dying/wounded, and hero/focus points are automated; staged afflictions are tracked with stage saves, and round-based onset/interval timing is automatic, but compendium presets and non-round timers are manual. Spell heightening and most feat/item effects are still partly manual.
2. **Campaign economy:** advancement speed, hazard/accomplishment XP, a treasure-by-level audit including permanent/consumable item mix, replacement-character wealth, a settlement-level shop with optional tracked merchant stock, cost-of-living upkeep, and a downtime activity planner for Earn Income, Subsist, and projects are now supported. Full Craft cost/task-discovery automation is still missing.
3. **The other two-thirds of play:** weather effects, hex/pointcrawl mapping, social reputation/factions, and player knowledge need a first-class model. Travel now has a campaign journey planner with mileage, terrain, watches, weather metadata, and exploration activities; downtime has a planner for the common activities, but rituals and long-running projects remain manual.
4. **Campaign continuity:** the session-zero charter and private safety preferences are supported, but private player notes, AP chapter/level scaffolding, and a self-contained archive are still missing.

---

## What was verified

Two simulated campaigns were run against an isolated server with real accounts and sockets:

- **A: The Ashen Crown** — 4 players, XP advancement, levels 1–20.
  - Campaign creation/invite/join/ruleset inheritance.
  - Four classes (fighter, wizard, cleric, rogue) with real ancestry/background/equipment.
  - Token ownership, movement, hidden-token visibility, linked HP/AC.
  - Encounter budgets at levels 1/5/10/15/20 (trivial/low/moderate/severe/extreme), grouped initiative, condition duration ticking.
  - Fast (800 XP per level) advancement, GM-only party level-up, HP/AC growth, token sync, excess-XP carry, level-20 cap.
  - Complex/simple hazard XP, major accomplishment XP, and a GM-visible award ledger.
  - Long rest natural healing, condition reduction, temp HP clearing, token sync.
  - Treasure parcels (GM Core currency column), item-plus-coin parcel valuation, loot distribution, purse totals.
  - Loot audit at level 20 against the GM Core party budget, including each character's committed wealth and the permanent/consumable item mix.
  - Settlement shop buy/sell with server-side common-item level checks, full-price purchases, half-price gear sales, and ownership enforcement. The simulation also switches to tracked stock, buys it down, rejects an over-stock purchase, sells an item back, and round-trips stock through export/import.
  - Initiative advance resolves linked characters' start-of-turn dying recovery and end-of-turn persistent damage, with chat rolls and idempotency marks.
  - Unlinked monster tokens carry and resolve fast healing, regeneration, and persistent damage; encounter launch seeds these from statblock abilities.
  - Downtime grants/spending with per-character cost-of-living upkeep, Earn Income payouts, Subsist upkeep waivers, and Craft/Retrain project completion; Golarion month, year, and leap-day boundaries.
  - Sessions, attendance, check-ins, recap; shared vs GM-only handouts; one-time quest XP.
  - Player permission boundaries and optimistic revision conflicts.
  - Campaign export/import at level 20 (characters, levels, calendar, scenes, journal, loot, sessions, NPCs, XP mode, advancement speed).
- **B: The Quiet Ledger** — 2 players, milestone advancement.
  - Story level-ups from 1→20 with no XP requirement.
  - Quest XP one-time award in XP mode; milestone campaigns reject the award and keep the value for reference.
  - Live campaign metadata to a connected player.
  - Mid-campaign replacement character advanced to party level, then topped up to the level-10 lump-sum wealth benchmark.
  - Sessions/recap/handout in milestone play.

**Result (current release pass):** 85 passing checks, 0 failing checks, 1 recorded gap. Encounter cleanup is now exercised after every simulated act, milestone XP awards are verified as blocked, the fast advancement threshold, hazard XP, accomplishment XP, and award ledger are exercised, the loot audit (including permanent/consumable item counts) plus replacement-wealth grant are verified at level 20 and level 10, downtime spending charges upkeep and exercises Earn Income repetition, Subsist waivers, and project completion, the travel planner advances the calendar and persists watches/activities, session zero keeps a shared charter with private anonymous safety limits and a GM-only pause signal, the settlement shop is exercised with purchase, sale, above-level, ownership, tracked-stock decrement/replenish, and export/import checks, initiative advance is verified to roll dying recovery and resolve persistent damage exactly once, and unlinked monsters are verified to heal, take persistent damage, and seed regeneration from a statblock. Two linked-token bugs were found and fixed:

- Hiding a token after initiative was rolled still exposed its name in the player's initiative order. The server now filters hidden combatants from player snapshots and live initiative broadcasts, with a shared helper and unit coverage (`src/shared/initiative.ts`, `src/server/routes/table.ts`, `src/server/socket.ts`, `tests/initiative.test.ts`).
- Creating a token for a wounded character reset its current HP to full. New tokens now start at the sheet's current HP unless the GM explicitly supplies one (`src/server/socket.ts`).

The weekly character simulation was also run: 1,000 random characters plus the class/level matrix, all 288 subclass options, ancestry/background combinations, and 6,366 feat prerequisite checks produced **0 math problems**. Automation coverage remains the trust issue: across those builds, 2,614 feat selections were fully automated, 534 partly automated, and 19,713 manual. The character simulation exits non-zero when it finds a problem, so the weekly job cannot stay green while reporting failures.

The browser rehearsal suite now builds three complete level-1 characters through the real UI: a Human Fighter, a Human Cleric with split ordinary/divine-font preparation, and a Human Wizard relying on granted curriculum spells. It verifies granted focus/repertoire/curriculum spells cannot be duplicated from the picker, and casts from the sheet to check font, ordinary-slot, focus, Refocus, long-rest, and reload persistence for each resource pool. Additional browser coverage selects a Cloistered Cleric domain, filters Champion devotion spells by deity font, and chooses an Elemental Sorcerer element; Runelord sins and the full domain catalog are covered by unit tests.

Run it with:

```bash
npm run simulate:campaign
npm run simulate:campaign -- --report campaign-simulation-report.json
```

---

## Coverage against a PF2e campaign

| Lifecycle stage | PF2e need | Current support | Status |
| --- | --- | --- | --- |
| Session zero | Pitch/tone, content limits, safety tools, allowed sources, house rules, party hooks | Campaign description and ruleset; a shared Session zero tab with pitch, genre/tone/themes, expectations, house rules, content limits, safety tools, a GM checklist, private lines/veils, anonymous GM responses, and a pause/X-card signal; no automated source checklist or party-hook questionnaire | Partial |
| Scheduling | Cadence, time zones, RSVP, quorum, attendance, reminders | Sessions, check-ins, attendance, next-session date/teaser; no reminders/ICS/time zones | Partial |
| Player onboarding | Join, bring/create a character, ruleset inheritance | Invite links/codes, account flow, character assignment | Strong |
| Character build | 1–20 math, ancestry/heritage/background/class, feats/spells/gear/runes | Live math, prerequisites, slots, runes, companions roster, Pathbuilder import; common level-1 heritage mechanics, a gear-plus-coins starting budget, and curated fixed plus free class grants for Druid/Bard/Wizard/Sorcerer/Cleric/Champion | Strong with automation caveats |
| Advancement | Fast/medium/slow XP, party pool, catch-up, milestones, hazards/accomplishments | Milestone or XP mode with fast/medium/slow thresholds (800/1,000/1,200), per-character XP, GM-only level-up, hazard/accomplishment awards, and a GM award ledger; no shared party pool or catch-up doubling | Partial |
| Combat | Budgets, hazards, initiative, MAP/actions, conditions, dying, afflictions, cover, AoE | Budget/launch/waves/reinforcements, grouped initiative, conditions with durations, automatic dying recovery, fast healing/regeneration, and persistent damage for linked characters and unlinked monsters, regeneration suppression by typed damage, cover/concealment readout, lighting/vision, templates | Partial |
| Exploration | Travel pace, terrain, weather, watches, foraging/tracking, hex/pointcrawl, discovery | Scenes, fog, walls, light, measurement. A campaign Travel tab plans mileage from PF2e Travel Speed, tracks terrain and weather metadata, assigns four watches and exploration activities, and advances the calendar; no hex/pointcrawl map, automatic weather effects, foraging checks, or encounter checks | Partial |
| Social | NPCs, attitude, factions, reputation, rumors, shops, negotiation | NPC statblock library, dashboard threads, quest handouts, and a settlement shop; no relationships/reputation/factions/persistent merchants | Partial |
| Downtime | Day accounting, Earn Income, Craft, Retrain, rituals, cost of living, shopping | GM grants days; player spends days at a chosen cost of living with server-charged upkeep. Earn Income rolls and pays from table 4-2, Subsist can waive upkeep, and Craft/Retrain progress is tracked; rituals and full crafting costs remain manual | Partial |
| Treasure | Party budget by level, item levels, parcels, gems/art, wealth audit, ABP | Loot parcels with compendium items/coins, one recipient, sheet updates, item-plus-coin valuation, GM Core party budget and permanent/consumable item-mix audit, character wealth audit, replacement top-up, a settlement shop with optional tracked merchant stock, and sales that replenish stock; no ABP | Partial |
| Campaign log | Journal, handouts, quests, clues, recap, player knowledge | Journal/handouts with visibility/attachments, quest status/XP, recap draft, dashboard threads; no per-player knowledge or private notes | Partial |
| World clock | In-world date, downtime, afflictions, sessions | Golarion calendar with leap day and GM advance | Strong |
| Table | Maps, fog, walls/doors, lighting, tokens, conditions, chat, dice, music | Deep implementation; see table gaps below | Strong with caveats |
| Archive/portability | Self-contained backup, JSON, assets, restore | SQLite backup/restore drill; campaign JSON metadata; assets referenced by URL; import caps/ownership caveats | Partial |
| Safety/access | Private limits, consent, player-safe views | GM-only data is separated. Players can save private lines, veils, and notes, choose anonymity in the GM's response list, and send an anonymous GM-only pause signal; there is no separate anonymous third-party channel or content-warning automation | Partial |
| Adventure path | Chapters, level gates, encounter/quest pacing, AP import | None | Missing |

---

## Prioritized gap register

### P0 — trust and table correctness

These are the items most likely to make a sheet or combat state look right while being wrong.

| Gap | Why it matters | Status / effort |
| --- | --- | --- |
| Dying/wounded/unconscious/doomed state machine | HP 0 applies dying/unconscious; healing from dying adds or raises wounded; doomed lowers the death threshold. Advancing initiative automatically rolls linked characters' start-of-turn recovery checks and resolves end-of-turn persistent damage, with chat rolls and duplicate-run protection. Unlinked monsters carry fast healing/regeneration/persistent damage and resolve them on turn advance. Heroic Recovery spends all Hero Points to stabilize at 0 HP without adding wounded, and turn automation defers the dying recovery check while points remain so the player can choose. Linked PCs apply sheet fast healing/regeneration at turn start, cap dying while regeneration is active, and suppress it from matching typed or persistent damage. Stabilize actions, death effects, and Diehard remain manual. | Partial — M |
| Condition modifiers (frightened, off-guard, enfeebled, clumsy, drained, etc.) | Implemented in sheet and token math, with one shared condition list between a linked sheet and token, duration ticking, and legacy trailing-value normalization. | Done |
| Afflictions (poison/disease/curse) with onset, stages, interval, cure | The sheet tracks custom afflictions with type, save, DC, current and maximum stage, onset, stage interval, maximum duration, virulent successes, and notes. A stage-save button rolls the chosen save and applies the stage change automatically. Round-based onset and interval timers count down at the end of the character's turn and roll the stage save when the interval reaches zero; non-round units, cure effects, curse-specific removal checks, and compendium affliction presets remain manual. | Partial — M |
| Spell heightening and cast-time resource spending | The sheet Cast action spends ordinary slots, separate Cleric font slots, focus points, and individual prepared/font copies, so one prepared spell cannot be cast repeatedly from leftover aggregate slots. Prepared casters choose a rank when preparing (including upcasting), dual-font clerics lock in Heal or Harm for their font, spontaneous casters choose a heightened rank when casting, and structured interval damage is auto-computed for safe spells. Heal, Harm, and Force Barrage expose 1/2/3-action formulas and rolls with rank-scaled healing, damage, and shard counts. Other action-count variants, fixed/prose-only heightening, and known data conflicts stay manual. The rank-1 Wizard extra slot is restricted to curriculum spells; higher-rank curriculum lists are not curated yet. | Partial — M |
| Hero Point reroll, GM award/reset, session reset | Reroll, Refocus, and manual pips exist. The GM can award 1–3 points to selected characters (capped at 3) or reset the party to 1 for a new session; party cards show each character's points and awards/resets are audited. | Done |
| Focus/Refocus and daily preparations | Focus and Refocus exist. Prepared casters confirm today's spell list in a daily-preparation modal after a long rest; the modal enforces rank, divine-font, and Wizard curriculum limits, resets cast-copy counters, and marks preparations pending until confirmed. Non-spell daily preparations remain manual. | Done |
| Temp HP absorption | Implemented for token and sheet damage. | Done |
| Feat/item automation coverage and truthful badges | Only a curated subset of feats/items is automated; manual effects remain common. | Open — XL, ongoing |
| Encounter cleanup/relaunch | Launched tokens carry encounter provenance. A fresh launch replaces that encounter's earlier tokens on the scene, and **Clear launched** removes its tokens and initiative entries without touching linked or manual tokens. Tokens launched before this update require a one-time manual cleanup. | Done |
| Hidden data on the table | Hidden-token initiative, hidden props, hidden walls, and hidden area templates are filtered from player snapshots and live events. Hidden walls still block movement server-side but are excluded from player line of sight and cover. | Done |
| Movement enforcement | During initiative, player moves are server-checked against the active turn and remaining Speed, including straight-line moves and groups; rejected moves snap back with a clear error. The GM can move any token as an override. Difficult terrain, forced movement, elevation, reach, and token-to-token collision are still manual. | Done |

### P1 — campaign economy and continuity

| Gap | Recommendation | Effort |
| --- | --- | --- |
| Advancement speed | Fast/medium/slow XP thresholds (800/1,000/1,200) are stored per campaign and used by progress bars and level-up subtraction. | Done |
| Party XP pool and catch-up | Support a shared party total, per-character catch-up doubling, and absent-player awards. | M |
| Hazard and accomplishment XP | The Award XP dialog supports simple/complex hazard XP by level difference and minor/moderate/major accomplishments (10/30/80), with a GM-visible ledger. The encounter builder still has no hazard actor or XP budget row. | Done — award workflow |
| Treasure-by-level engine | Encodes GM Core table 10-9 total and coin budgets and shows parcel vs. budget value plus permanent/consumable item counts against the table's item bands. Still missing: level-tagged parcels and per-additional-PC scaling. | Partial — done for audit |
| New/replacement character wealth | Level-1 creation budgets gear plus coins. A GM can top up a replacement or catch-up character to the GM Core table 10-10 lump-sum benchmark; only the difference is granted. | Done |
| Shops and settlement levels | One shop per campaign with either open common stock up to the settlement level or a GM-curated finite merchant inventory. Buy/sell prices, quantity, ownership, and stock are server-validated; sales add items back to tracked stock. Multiple merchants per settlement, automatic restock schedules, and price overrides remain manual or missing. | Done — single merchant |
| Downtime activities | The character sheet runs Earn Income (server-side trained-skill roll, table 4-2 payout, repeat days), Subsist (upkeep waiver or fatigue), and Craft/Retrain day trackers with cost-of-living charges. Rituals, task discovery, and full crafting material costs stay manual. | Partial |
| Exploration/travel | The Travel tab covers origin/destination, PF2e speed and terrain mileage, weather metadata, four watches, per-character exploration activities, progress/ETA, and calendar-day advancement. Still missing: hex/pointcrawl mapping, automatic weather effects, foraging/tracking checks, encounter checks, and discovered/rumored sites. | Partial |
| Victory Point clocks | One generic clock/VP primitive for research, influence, chase, infiltration, reputation, and projects. | M |
| NPC/faction ledger | Attitude, location, faction, secrets, obligations, relationship history, rumors; ideally a graph. | L |
| Player knowledge layer | Private player notes, known/rumored/secret/disproven clues, per-player reveals, absentee recap. | L |
| Session zero and safety | A shared Session zero tab covers pitch, genre/tone/themes, expectations, house rules, content limits, safety tools, and a GM checklist. Each member can save private lines/veils/notes, hide their name from the GM's response list, and send an anonymous pause/X-card signal that reaches the GM as a live toast and GM-only chat card. Missing: allowed-source checklist, party-hook questionnaire, and a third-party anonymous channel. | Partial |
| AP scaffold | Chapters/books, level bands, encounter/quest pacing, treasure checkpoints, AP import/conversion. | L |
| Self-contained archive | Copy assets/audio into the export, validate URLs, remove import caps, preserve playback state and asset rows. | M |
| Ownership lifecycle | Leaving/kicking currently leaves `characters.campaign_id` set; add unassignment, GM transfer, co-GM, per-character portability. | S–M |
| Reminders/calendar | ICS/Discord/webhook reminders, recurring sessions, RSVP deadlines, time zones, per-player attendance history. | M |

### P2 — depth and scale

- Companions, familiars, eidolons, and summons as advancing actors with tokens and commands.
- Vehicles, mounted combat, kingdom building, mass combat/sieges.
- Homebrew editor with validation/versioning and shareable packs.
- Campaign templates, campaign wiki/graph/timeline, campaign-scoped audit.
- Mobile player view, offline/PWA, Postgres/S3/OAuth when local hosting is outgrown.

---

## Table-specific gaps worth calling out

The VTT is the strongest differentiator, but several PF2e combat expectations are still manual or advisory:

- **Turn economy:** the sheet has target-DC/AC resolution plus second/third-attack MAP and critical-damage shortcuts; there is still no 3-action/reaction tracker or full attack-target/cover integration.
- **Effects:** AoE templates are visual only; no target resolution, save/damage cards, auras, or persistent spell effects.
- **Conditions:** linked PC sheets and tokens now share one condition list and update each other live, including condition-driven AC/save/attack math.
- **Death/afflictions:** dying/unconscious and wounded-on-recovery are automated, staged afflictions have a sheet tracker with stage saves, linked characters' dying recovery and persistent damage resolve automatically when initiative advances, and unlinked monsters now run fast healing/regeneration/persistent damage from token effects. A dying character with Hero Points can use the sheet's Heroic Recovery button, and turn automation defers the recovery roll to that choice. Linked PCs apply fast healing/regeneration at turn start, regeneration caps dying below the death threshold, and matching typed or persistent damage suppresses it. Round-based affliction onset and interval timers tick automatically at the end of the character's turn; other units remain manual.
- **Movement/terrain:** no difficult terrain, squeezing, forced movement, elevation/flying, reach, flanking/off-guard, or token-to-token collision.
- **Hazards:** traps/hazards are custom combatants at best; simple/complex hazard XP can be awarded from the XP ledger, but the encounter builder has no hazard actor or hazard budget row.
- **Monster actions:** bestiary stats are display-only; no attack/ability buttons or recharge tracking.
- **Table hygiene:** scene deletion leaves ghost initiative entries. Hidden props, walls, and templates are server-filtered from players. Encounter relaunch and cleanup are handled for tokens launched after the provenance migration.
- **Exploration layer:** the Travel tab tracks mileage, terrain, weather metadata, watches, exploration activities, and calendar days. There is no hex/pointcrawl map, time-of-day lighting automation, automatic weather effect, chase track, or VP clock.

---

## Recommended sequence

### Sprint A — make the sheet and table trustworthy
Already completed: condition modifiers, temp HP/dying/unconscious, healing reconciliation, Hero Point reroll, Refocus, hidden-token/prop/wall/template filtering, PC token HP preservation, encounter cleanup/relaunch, round-based affliction onset/interval timers, and structured daily spell preparations.

Remaining:
1. Remaining spell heightening: action-count variants, fixed-rank effects, and prose-only data.
2. Tighten automation badges so “Automated” can never hide a manual bonus.

**Exit criteria:** a player can be dropped to 0 HP, stabilized, wounded, treated, and rested without a GM spreadsheet; frightened/off-guard/clumsy actually change rolls; a caster can cast at the correct heightened rank and spend the slot.

### Sprint B — campaign economy and progression
1. Party XP pool, catch-up, and absent-player awards. (Advancement speed and hazard/accomplishment awards are done.)
2. Permanent/consumable item-mix planner and level-tagged parcels. (The party budget, wealth audit, and replacement top-up are done.)
3. Persistent merchant stock and a richer downtime planner. (The settlement shop now supports tracked stock; task discovery, rituals, full crafting costs, multiple merchants, and restock schedules remain.)
4. Session-zero/safety checklist and private player notes. (The shared charter, private limits, anonymous responses, and pause signal are done; private player notes and a source checklist remain.)

**Exit criteria:** a GM can run a level without guessing treasure, equip a replacement PC correctly, and resolve a full downtime phase in-app.

### Sprint C — exploration, social, and continuity
1. Travel/weather/hex or pointcrawl layer + exploration activities + generic VP clocks. (The journey planner, watches, weather metadata, and exploration activities are done; hex/pointcrawl, automatic weather, encounter checks, and VP clocks remain.)
2. NPC/faction/reputation ledger and rumor/knowledge states.
3. Player knowledge base, per-player reveals, absentee recap.
4. Self-contained archive and ownership lifecycle.
5. AP chapter/level-gate scaffolding.

**Exit criteria:** a published AP can be prepped chapter by chapter with treasure, NPCs, clues, travel, and level gates in one place.

---

## Rules reference used

- XP and advancement speeds: <https://2e.aonprd.com/Rules.aspx?ID=2648>
- XP awards, hazards, accomplishments: <https://2e.aonprd.com/Rules.aspx?ID=2649>
- Group parity/party level: <https://2e.aonprd.com/Rules.aspx?ID=2653>
- Encounter threats/budgets: <https://2e.aonprd.com/Rules.aspx?ID=2716>, <https://2e.aonprd.com/Rules.aspx?ID=2717>
- Party treasure by level: <https://2e.aonprd.com/Rules.aspx?ID=2656>
- Treasure by encounter: <https://2e.aonprd.com/Rules.aspx?ID=2738>
- Character wealth: <https://2e.aonprd.com/Rules.aspx?ID=2662>
- Rest and daily preparations: <https://2e.aonprd.com/Rules.aspx?ID=2443>
- Victory points/subsystems: <https://2e.aonprd.com/Rules.aspx?ID=3028>
- Campaign structure: <https://2e.aonprd.com/Rules.aspx?ID=2668>
- Automatic bonus progression: <https://2e.aonprd.com/Rules.aspx?ID=2741>
- Session zero: <https://2e.aonprd.com/Rules.aspx?ID=2478>
- Exploration mode: <https://2e.aonprd.com/Rules.aspx?ID=469>
- Running downtime: <https://2e.aonprd.com/Rules.aspx?ID=2604>
- Pathfinder Society advancement: <https://paizo.com/pathfindersociety/getstarted>
