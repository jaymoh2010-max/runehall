# PF2e campaign readiness review

**Reviewed:** 18 November 2026  
**Scope:** PF2e Remastered campaign play from session zero through level 20, compared with GM Core/Player Core and common GM/player tooling expectations.  
**Artifacts:** `scripts/simulate-campaign.ts` (new), `scripts/lib/simHeroes.ts` (new), `npm run simulate:campaign`.

> **Current status (release pass, November 2026):** Many items from the original P0 audit are now implemented: condition modifiers, temp HP absorption, dying/unconscious life state, healing reconciliation, wounded-on-recovery, doomed death threshold, Hero Point reroll, Refocus, hidden-token initiative filtering, hidden-prop filtering, linked-token HP preservation, and encounter cleanup/relaunch. Linked sheets and tokens now share one condition list, and open sheets plus party cards consume live character updates. Sheet rolls support target DC/AC, secret visibility, second/third-attack MAP, and critical damage. Common level-1 heritage mechanics now apply Skilled Human, Versatile Human, Ancient Elf, Aiuvarin, Dromaar, Nephilim, Changeling, Dhampir, Dragonblood, and Duskwalker choices, senses, and feat access; other heritages show manual notes. Level-1 starting wealth now covers gear plus carried coins, while imported/looted characters remain unbudgeted. Fixed class-choice grants now cover Druid orders, Bard muses, Wizard school focus plus rank-0/rank-1 curriculum, Sorcerer focus plus fixed level-1 bloodline gifts, and Cleric doctrines, with free choices left as explicit notes. Cleric divine font is prepared and displayed as a separate pool from ordinary slots, and granted spells no longer need to be added twice. Sorcerer/Oracle slots, tradition gating, cantrip caps, and core-only class-choice filtering are corrected. Sessions now stay current until marked played, session changes reach open dashboards live, and the Sessions calendar is the single source for the next-session date. Quest XP is gated to XP tracking mode and a paid reward cannot be reset by editing the handout. Secret chat and secret rolls use independent toggles. Still open for a first campaign: afflictions, full spell heightening/cast-time spending, recovery-check automation, free class-choice grants (Cleric domains, Champion devotion, Elemental Sorcerer gifts, Runelord sins, higher-rank gifts/curriculum), Wizard curriculum-slot enforcement, hidden walls/templates review, and enforced movement. The tables below preserve the original audit baseline; read the status labels alongside the README and ROADMAP for the current implementation.

---

## Verdict

Runehall is already a strong **campaign table**: invite → join → party roster → character sheet → map/fog/walls/lighting → encounter launch → initiative → chat/dice → loot → journal/handout → session recap is a real, working loop. The simulation played two complete 1–20 campaigns and found the campaign spine, progression plumbing, permissions, calendar, rest, loot, sessions, and export/import working as intended.

It is **not yet a full adventure-path runner or a complete exploration/downtime game**. The largest gaps are:

1. **Rules trust:** conditions, dying/wounded, afflictions, hero/focus points, spell heightening, and most feat/item effects are still manual.
2. **Campaign economy:** no treasure-by-level budget, item-level parcels, new-character wealth, shops, or cost of living.
3. **The other two-thirds of play:** exploration/travel/weather, downtime activities, social reputation/factions, and player knowledge all need a first-class model.
4. **Campaign continuity:** no session-zero/safety tools, private player notes, AP chapter/level scaffolding, or self-contained archive.

---

## What was verified

Two simulated campaigns were run against an isolated server with real accounts and sockets:

- **A: The Ashen Crown** — 4 players, XP advancement, levels 1–20.
  - Campaign creation/invite/join/ruleset inheritance.
  - Four classes (fighter, wizard, cleric, rogue) with real ancestry/background/equipment.
  - Token ownership, movement, hidden-token visibility, linked HP/AC.
  - Encounter budgets at levels 1/5/10/15/20 (trivial/low/moderate/severe/extreme), grouped initiative, condition duration ticking.
  - 1,000 XP per level, GM-only party level-up, HP/AC growth, token sync, excess-XP carry, level-20 cap.
  - Long rest natural healing, condition reduction, temp HP clearing, token sync.
  - Treasure parcels (GM Core currency column), loot distribution, purse totals.
  - Downtime grants/spending; Golarion month, year, and leap-day boundaries.
  - Sessions, attendance, check-ins, recap; shared vs GM-only handouts; one-time quest XP.
  - Player permission boundaries and optimistic revision conflicts.
  - Campaign export/import at level 20 (characters, levels, calendar, scenes, journal, loot, sessions, NPCs, XP mode).
- **B: The Quiet Ledger** — 2 players, milestone advancement.
  - Story level-ups from 1→20 with no XP requirement.
  - Quest XP one-time award in XP mode; milestone campaigns reject the award and keep the value for reference.
  - Live campaign metadata to a connected player.
  - Mid-campaign replacement character advanced to party level.
  - Sessions/recap/handout in milestone play.

**Result (current release pass):** 68 passing checks, 0 failing checks, 5 recorded gaps. Encounter cleanup is now exercised after every simulated act, and milestone quest XP is verified as blocked. Two linked-token bugs were found and fixed:

- Hiding a token after initiative was rolled still exposed its name in the player's initiative order. The server now filters hidden combatants from player snapshots and live initiative broadcasts, with a shared helper and unit coverage (`src/shared/initiative.ts`, `src/server/routes/table.ts`, `src/server/socket.ts`, `tests/initiative.test.ts`).
- Creating a token for a wounded character reset its current HP to full. New tokens now start at the sheet's current HP unless the GM explicitly supplies one (`src/server/socket.ts`).

The weekly character simulation was also run: 1,000 random characters plus the class/level matrix, all 288 subclass options, ancestry/background combinations, and 6,366 feat prerequisite checks produced **0 math problems**. Automation coverage remains the trust issue: across those builds, 2,614 feat selections were fully automated, 534 partly automated, and 19,713 manual. The character simulation exits non-zero when it finds a problem, so the weekly job cannot stay green while reporting failures.

The browser rehearsal suite now builds three complete level-1 characters through the real UI: a Human Fighter, a Human Cleric with split ordinary/divine-font preparation, and a Human Wizard relying on granted curriculum spells. It also verifies that granted focus/repertoire/curriculum spells cannot be duplicated from the picker.

Run it with:

```bash
npm run simulate:campaign
npm run simulate:campaign -- --report campaign-simulation-report.json
```

---

## Coverage against a PF2e campaign

| Lifecycle stage | PF2e need | Current support | Status |
| --- | --- | --- | --- |
| Session zero | Pitch/tone, content limits, safety tools, allowed sources, house rules, party hooks | Campaign description; ruleset/content mode; first-run checklist | Partial |
| Scheduling | Cadence, time zones, RSVP, quorum, attendance, reminders | Sessions, check-ins, attendance, next-session date/teaser; no reminders/ICS/time zones | Partial |
| Player onboarding | Join, bring/create a character, ruleset inheritance | Invite links/codes, account flow, character assignment | Strong |
| Character build | 1–20 math, ancestry/heritage/background/class, feats/spells/gear/runes | Live math, prerequisites, slots, runes, companions roster, Pathbuilder import; common level-1 heritage mechanics, a gear-plus-coins starting budget, and curated fixed class grants for Druid/Bard/Wizard/Sorcerer/Cleric | Strong with automation caveats |
| Advancement | Fast/medium/slow XP, party pool, catch-up, milestones, hazards/accomplishments | Milestone or 1,000-XP mode, per-character XP, GM-only level-up; no speed setting, party pool, catch-up, hazard/accomplishment rows | Partial |
| Combat | Budgets, hazards, initiative, MAP/actions, conditions, dying, afflictions, cover, AoE | Budget/launch/waves/reinforcements, grouped initiative, conditions with durations, cover/concealment readout, lighting/vision, templates | Partial |
| Exploration | Travel pace, terrain, weather, watches, foraging/tracking, hex/pointcrawl, discovery | Scenes, fog, walls, light, measurement; no travel/weather/hex/exploration activities | Missing |
| Social | NPCs, attitude, factions, reputation, rumors, shops, negotiation | NPC statblock library, dashboard threads, quest handouts; no relationships/reputation/factions/shops | Partial |
| Downtime | Day accounting, Earn Income, Craft, Retrain, rituals, cost of living, shopping | GM grants days; player spends days; activities remain manual | Partial |
| Treasure | Party budget by level, item levels, parcels, gems/art, wealth audit, ABP | Loot parcels with compendium items/coins, one recipient, sheet updates; no budget/wealth audit/shops/ABP | Partial |
| Campaign log | Journal, handouts, quests, clues, recap, player knowledge | Journal/handouts with visibility/attachments, quest status/XP, recap draft, dashboard threads; no per-player knowledge or private notes | Partial |
| World clock | In-world date, downtime, afflictions, sessions | Golarion calendar with leap day and GM advance | Strong |
| Table | Maps, fog, walls/doors, lighting, tokens, conditions, chat, dice, music | Deep implementation; see table gaps below | Strong with caveats |
| Archive/portability | Self-contained backup, JSON, assets, restore | SQLite backup/restore drill; campaign JSON metadata; assets referenced by URL; import caps/ownership caveats | Partial |
| Safety/access | Private limits, consent, player-safe views | GM-only data is separated; no safety profile or content-limit channel | Missing |
| Adventure path | Chapters, level gates, encounter/quest pacing, AP import | None | Missing |

---

## Prioritized gap register

### P0 — trust and table correctness

These are the items most likely to make a sheet or combat state look right while being wrong.

| Gap | Why it matters | Status / effort |
| --- | --- | --- |
| Dying/wounded/unconscious/doomed state machine | HP 0 applies dying/unconscious; healing from dying adds or raises wounded; doomed lowers the death threshold; recovery checks and stabilize actions remain manual. | Partial — M |
| Condition modifiers (frightened, off-guard, enfeebled, clumsy, drained, etc.) | Implemented in sheet and token math, with one shared condition list between a linked sheet and token, duration ticking, and legacy trailing-value normalization. | Done |
| Afflictions (poison/disease/curse) with onset, stages, interval, cure | Common in APs and hazards; currently entirely manual. | Open — L |
| Spell heightening and cast-time resource spending | Rank-by-rank slots, class cantrip caps, Sorcerer/Oracle slots, tradition gating, separate Cleric font preparation, and granted curriculum/gift spells exist; casting does not yet spend slots/focus or heighten automatically, and the Wizard's extra curriculum slot is not restricted to curriculum spells. | Partial — M |
| Hero Point reroll, GM award/reset, session reset | Reroll, Refocus, and manual pips exist; GM award/session reset workflow is missing. | Partial — S–M |
| Focus/Refocus and daily preparations | Focus and Refocus exist; structured daily preparation is still manual. | Partial — M |
| Temp HP absorption | Implemented for token and sheet damage. | Done |
| Feat/item automation coverage and truthful badges | Only a curated subset of feats/items is automated; manual effects remain common. | Open — XL, ongoing |
| Encounter cleanup/relaunch | Launched tokens carry encounter provenance. A fresh launch replaces that encounter's earlier tokens on the scene, and **Clear launched** removes its tokens and initiative entries without touching linked or manual tokens. Tokens launched before this update require a one-time manual cleanup. | Done |
| Hidden data on the table | Hidden-token initiative and hidden props are filtered; review hidden walls/templates before relying on them. | Partial — S–M |
| Movement enforcement | Straight-line moves and off-turn movement are warned about but not enforced; speed is advisory. | Open — M |

### P1 — campaign economy and continuity

| Gap | Recommendation | Effort |
| --- | --- | --- |
| Advancement speed | Add fast/medium/slow XP thresholds (800/1,000/1,200) per campaign. | S |
| Party XP pool and catch-up | Support a shared party total, per-character catch-up doubling, and absent-player awards. | M |
| Hazard and accomplishment XP | Add simple/complex hazard rows and 10/30/80 accomplishment awards to the encounter/XP workflow. | M |
| Treasure-by-level engine | Encode GM Core Table 10-9: 2 permanent L+1, 2 permanent L, 2 consumables L+1/L/L−1, currency; show awarded vs. budget. | M |
| New/replacement character wealth | Level-1 creation now budgets gear plus carried coins. Still missing: the Table 10-10 starting package or a level-appropriate lump sum; the simulation showed a level-10 replacement with 10 gp instead of ~2,300 gp. | Partial — S–M |
| Shops and settlement levels | Persistent merchants with item level/price/stock, buy/sell, and settlement purchase limits. | M |
| Downtime activities | Earn Income, Craft, Retrain, rituals, cost of living, per-character queues and approvals. | L |
| Exploration/travel | Pace/terrain/weather, watches, foraging/tracking, hex/pointcrawl, ETA, encounter checks, discovered/rumored sites. | L |
| Victory Point clocks | One generic clock/VP primitive for research, influence, chase, infiltration, reputation, and projects. | M |
| NPC/faction ledger | Attitude, location, faction, secrets, obligations, relationship history, rumors; ideally a graph. | L |
| Player knowledge layer | Private player notes, known/rumored/secret/disproven clues, per-player reveals, absentee recap. | L |
| Session zero and safety | Campaign pitch template, content limits, lines/veils/X-card, anonymous safety channel, source/house-rule checklist. | S–M |
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
- **Death/afflictions:** dying/unconscious and wounded-on-recovery are automated; recovery checks, persistent damage, fast healing/regeneration, and poison/disease stages remain manual.
- **Movement/terrain:** no difficult terrain, squeezing, forced movement, elevation/flying, reach, flanking/off-guard, or token-to-token collision.
- **Hazards:** traps/hazards are custom combatants at best; no hazard XP or simple/complex hazard model.
- **Monster actions:** bestiary stats are display-only; no attack/ability buttons or recharge tracking.
- **Table hygiene:** scene deletion leaves ghost initiative entries; hidden props/walls/templates are sent to players. Encounter relaunch and cleanup are handled for tokens launched after the provenance migration.
- **Exploration layer:** no time-of-day/weather, hex/travel map, shops, chase tracks, or VP clocks.

---

## Recommended sequence

### Sprint A — make the sheet and table trustworthy
Already completed: condition modifiers, temp HP/dying/unconscious, healing reconciliation, Hero Point reroll, Refocus, hidden-token/prop filtering, PC token HP preservation, and encounter cleanup/relaunch.

Remaining:
1. Full recovery-check/doomed and affliction automation.
2. GM Hero Point award/session reset; structured daily preparations.
3. Spell heightening and cast-time resource spending.
4. Hidden-wall/template review and movement enforcement.
5. Tighten automation badges so “Automated” can never hide a manual bonus.

**Exit criteria:** a player can be dropped to 0 HP, stabilized, wounded, treated, and rested without a GM spreadsheet; frightened/off-guard/clumsy actually change rolls; a caster can cast at the correct heightened rank and spend the slot.

### Sprint B — campaign economy and progression
1. Advancement speed, party XP pool, catch-up, hazard/accomplishment XP.
2. Treasure-by-level budget, item-level parcels, new-character wealth, wealth audit.
3. Shops/settlement levels, cost of living, downtime activity planner.
4. Session-zero/safety checklist and private player notes.

**Exit criteria:** a GM can run a level without guessing treasure, equip a replacement PC correctly, and resolve a full downtime phase in-app.

### Sprint C — exploration, social, and continuity
1. Travel/weather/hex or pointcrawl layer + exploration activities + generic VP clocks.
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
