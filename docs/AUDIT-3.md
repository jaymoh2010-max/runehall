# Full-project audit — level 1–20 party simulation

Audit date: 2026-11-23

## Scope

- Whole-project verification: typecheck, lint, formatting, unit tests, production build,
  bundle budget, smoke test, browser e2e, data validation, and dependency audit.
- Character simulator coverage across all 29 remaster classes at levels 1, 5, 10, 15, and
  20, plus every class/subclass choice and the feat prerequisite sweep.
- Exhaustive builder matrix: every class at levels 1-20, every ancestry at levels 1-20,
  every class x ancestry at levels 1 and 5, every heritage, background, and valid divine
  deity pairing, plus every subclass choice at its unlock level and at level 20.
- Seven isolated campaigns with 29 distinct class slots, advanced from level 1 to 20 through
  the real campaign level-up and character-save APIs. At every level the server table summary
  was compared with the locally computed sheet, including HP, AC, Speed, Perception, saves,
  class DC, spell DC, attack formulas, and validation errors.
- Level-20 tokens were created for every character and checked for HP/AC sync.

## Fixes made during the audit

- **Simulation spell budgets were too generous.** The character simulator used a flat five
  cantrips and ignored repertoire/known limits. Sorcerer, Psychic, and Animist builds could
  fail their own validation. Cantrip and rank limits now use the same helpers as the sheet,
  including sorcerer bloodline grants and prepared-cantrip caps.
- **Trained skill picks could become redundant.** Feats such as Hellspawn grant fixed skills
  after the initial skill selection. The simulator now rebalances free skill picks after
  feats are chosen.
- **Animist attunement was missing.** After the Animist spellcasting split, the simulator now
  attunes the required two/three/four apparitions at each level and sets a primary apparition.
- **Invalid divine deity choices.** Clerics and champions could select philosophies with no
  domains or divine font, leaving Domain Initiate or devotion spells with no legal option.
  The deity picker now filters to deities that satisfy the class requirements, and validation
  explains an empty grant-choice group.
- **Deferred grant choices.** A regular class feat such as Domain Initiate can activate a
  choice group after the initial class-grant pass; the simulator now fills those groups too.
- **Skill increases** are chosen after feat-granted training is rebalanced, matching the final
  order used by character validation.
- **Apex item ability increases are applied.** Amulet of the Third Eye, Belt of Giant Strength,
  Bracers of Strength, and Bracers of Hammers now raise the selected ability modifier by 1 or to
  +4. Only one apex item applies, with a sheet warning when several are invested.
- **Simulation gear scales with level.** Simulated level 20 characters now receive the highest
  fundamental weapon and armor runes available at their level, so high-level AC and attack checks
  exercise the real rune math instead of level-1 gear.
- **General Training is resolved per selection.** Each selected General Training instance stores its
  own granted 1st-level general feat, so repeatable picks apply independently.
- **Companions are visible on the sheet.** The Details tab and print view now show the companion
  roster with kind, level, HP, AC, linked bestiary saves/attacks/abilities, and notes.
- **The character simulator is now reusable.** The deterministic level builder is exported,
  the CLI is entry-point guarded, and a focused unit test covers the previously failing
  classes.
- **New party simulator.** `npm run simulate:parties` runs seven campaigns with different
  class combinations through level 20 and checks server/local sheet parity at every level.
- **Party heroes advance continuously.** Each simulated hero keeps its ancestry, heritage,
  background, class, deity, early ability boosts, feats, skill picks, spells, and equipment
  from level to level. Only the choices unlocked by the new level are filled in, and the
  simulator asserts that the server round-trip preserves them.

## Results

| Command | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run smoke` | Pass |
| `npm run e2e` | 32 passed, 0 skipped |
| `npm run simulate` | 1000 characters, 0 problems |
| `npm run simulate:exhaustive` | 7,899 remaster + 10,529 all-content builds, 0 problems |
| `npm run simulate:campaign` | 17 passed, 0 failed |
| `npm run simulate:parties` | 22 checks passed, 0 failed; 29 classes across 7 campaigns |
| `npm run verify:data` | Pass; 4 expected data warnings |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Expected data warnings

- 46 creature attacks have no damage entry, mostly webs, tongues, and control attacks.
- 189 equipment entries have no separate description and use fallback text.
- 51 monsters have no separate description and use fallback text.
- 723 spells have no tradition: focus, ritual, and class-locked entries that are intentionally
  excluded from ordinary tradition-filtered pickers.

## Remaining opportunities

- The long tail of feat and item automation is still manual or partly automated because the
  compendium ships prose rather than structured rule elements.
- The party simulator advances one persistent build per hero from level 1 to 20. If a new
  feat later grants training in a skill that already had an early skill increase, the
  simulator retrains that increase rather than leaving an invalid sheet.
- Companion statistics, bestiary-linked companion tokens, and automatic companion advancement
  remain manual.
