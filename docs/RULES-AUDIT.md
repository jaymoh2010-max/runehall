# Runehall rules and compendium audit

Date: 2026-11-23

Scope: the PF2e math in `src/shared/`, the table-facing rules helpers, and every
generated compendium file in `data/compendium/`. The comparison baseline is the
remastered rules in Player Core, Player Core 2, and GM Core, with Archives of
Nethys (2e.aonprd.com) used for class tables and condition text.

This pass both reviewed and repaired the project. The "Fixed in this pass"
section lists changes that are already in the code; "Remaining gaps" lists work
that needs a product or schema decision. The separate
[SPELLCASTING-REVIEW.md](SPELLCASTING-REVIEW.md) contains a deeper class-by-class
spellcasting roadmap; this audit additionally corrected the bard slot table and
the 19th-20th-level cleric divine font placement, which that review did not
catch.

---

## 1. Executive summary

The foundation is sound: the character math is centralized, the compendium is
real PF2e data, and the automated checks are meaningful. The largest problems
were not missing files; they were incorrect rules constants and corrupted rules
text in the generated data.

The highest-impact corrections were:

1. **Macro expansion was corrupting a large fraction of rules text.** The old
   `@Damage[...]` regex stopped at nested brackets and `@Check[...]` became the
   word "check", losing save types and DCs. The ingest now uses balanced-bracket
   parsing and the verifier rejects the old artifacts.
2. **Bards used the sorcerer's four-slot table.** They now use the official
   two/three-slot bard table, and their repertoire limits match.
3. **Cleric divine font was placed at 9th rank at levels 19-20.** The published
   table moves it to 10th rank beside the miraculous spell slot.
4. **Treat Wounds used the wrong master/legendary formulas and doubled the
   critical row.** It now uses the printed success/critical rows, and Stabilize
   uses the dying-based DC instead of a flat 15.
5. **Several condition and armor calculations were wrong.** Enfeebled now
   reduces Strength damage, Stupefied reduces Perception, Unconscious no longer
   penalizes Fortitude or Will, and full plate no longer loses its entire speed
   penalty when the wearer meets the Strength requirement.
6. **Monster defenses ignored physical/all-damage categories and applied
   weakness after resistance.** Both are corrected.
7. **The compendium was stale and remaster-only for creatures.** It is
   regenerated from Foundry `a70593f7`, adds the Feybound-era character options,
   adds 648 legacy creatures from the core and expansion bestiaries, and
   normalizes deity spell lists.

After regeneration the local compendium has **54 ancestries, 357 heritages,
547 backgrounds, 29 classes, 881 class features, 6,486 feats, 2,036 spells,
6,005 items, 483 deities, 43 conditions, 592 actions, and 2,384 creatures**.

---

## 2. Verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 errors; pre-existing hook warnings) |
| `npm run format:check` | Pass |
| `npm test` | 88 files, 696 tests pass |
| `npm run verify:data` | Pass |
| `npm run smoke` | Pass (two-user GM/player flow) |
| `npm run e2e` | 26 passed, 0 skipped |
| `npm run simulate:campaign` | 17 passed, 0 failed |
| `npm run build` | Pass |
| `npm run check:bundle` | Pass |

Rules and data tests were also run against the expanded compendium with
`--testTimeout=30000`. The repository's Vitest default is now 20s for the
compendium-integrity tests, which parse roughly 30 MB of JSON on slower disks.

---

## 3. Compendium coverage

### 3.1 Counts and sources

| Category | Entries | Notes |
| --- | ---: | --- |
| Ancestries | 54 | Includes Faun, Gremlin, Nymph, and other current remaster content |
| Heritages | 357 | 17+ versatile heritages; every non-versatile heritage has a valid ancestry |
| Backgrounds | 547 | Includes the current Feybound-era backgrounds |
| Classes | 29 | All current PF2e classes |
| Class features | 881 | Includes subclass options and proficiency subfeatures |
| Feats | 6,486 | 4,986 remastered |
| Spells | 2,036 | 174 rituals, 500 focus spells, 547 with structured damage |
| Equipment | 6,005 | 1,031 weapons, 222 armor, 126 shields, 176 runes, 153 treasure |
| Deities | 483 | 419 deities, 39 pantheons, 18 covenants, 7 philosophies |
| Conditions | 43 | The current remastered condition list |
| Actions | 592 | Includes basic, offensive, defensive, and interaction actions |
| Creatures | 2,384 | 1,736 remastered + 648 legacy/expansion creatures |
| Unique trait tags | 492 | Tags are searchable; no trait-description glossary yet |

Creature sources now include Monster Core, Monster Core 2, NPC Core, Bestiary
1-3, Lost Omens Bestiary, NPC Gallery, Battlecry, Howl of the Wild, Book of the
Dead, Rage of Elements, and War of Immortals. Adventure-path bestiaries remain
out of scope.

### 3.2 Data quality checks

- All IDs are unique and prefixed; manifest counts match.
- Every description is sanitized and free of unresolved Foundry macros.
- The verifier rejects `check save`, `check check`, `.level`, `floor(`,
  raw `[damage-type]` annotations, and `@Macro[` artifacts.
- Deity spell references are resolved to `spell:` IDs and names; the 7
  remaining entries with no spell list are philosophies.
- 189 equipment entries have no separate rules text (153 are treasure/gems;
  about 36 are mundane gear such as chalk, rations, and tents).
- 51 creatures have no public description (mostly variant or adventure entries).
- 46 creature attacks have no damage; these are control attacks such as web,
  tongue, and grab.

### 3.3 Known coverage gaps

These are real gaps versus a complete PF2e reference, but they are outside the
current data model or intentionally manual:

- **Hazards** (Foundry `hazards`), **vehicles/siege engines**, **familiar
  abilities**, **creature-family abilities**, and **boons/curses** are not
  ingested. The app has a separate GM hazard library on an unmerged branch, but
  not a compendium hazard browser.
- **Traits** are labels only. There is no trait glossary or per-trait rules text.
- **Domain descriptions** are not ingested. Deity pages list domains and their
  initial domain spells, but there is no standalone domain reference page.
- **Afflictions** are templates in the sheet; individual curse/disease statblocks
  are not part of the compendium.
- **Adventure-path bestiaries** (thousands of creatures) are not loaded. The
  core legacy and major expansion bestiaries now are, but the bestiary UI does
  not filter legacy creatures by campaign ruleset; all 2,384 are available.
- **Commander tactics** and **Runesmith runes** are class content without
  first-class pickers. The classes and feats are present; the build choices are
  manual.
- **Background grants:** 41 backgrounds have no trained skill and 78 have no
  granted/choice feat in the raw Foundry data. Some are genuinely choice-only or
  prose-only, but a curated override table would improve the builder.
- **Action categories:** 21 actions have an empty category; the Rules page still
  displays them, but category filters are inconsistent.

---

## 4. Rules findings fixed in this pass

### 4.1 Spellcasting

- **Bard slots and repertoire** (`src/shared/rules.ts`): bard now uses
  `bardSlots()` — 2 first-rank slots at 1st level, 3 thereafter, with the
  printed 3/3/2 progression. `spellRepertoireLimits()` no longer uses the
  sorcerer/oracle four-slot table, and the muse spell is treated as an extra
  rather than shrinking the player's choices.
- **Cleric divine font at 19th-20th level** (`src/shared/rules.ts`):
  `divineFontInfo()` now caps at 10th rank, matching the published cleric table
  (3 slots of each rank 1-9, then 7 tenth-rank slots: one miraculous + six font).
- **Sorcerer cantrip count:** the bloodline cantrip counts toward the five
  cantrips a sorcerer knows, so the chosen cantrip cap is 4, not 5.
- **Psychic and animist focus pools:** psychic reaches 3 at 5th level
  (Clarity of Focus); animist starts at 1 (vessel spell).
- **Focus casting:** a focus spell whose minimum rank is above half the
  character's level is no longer castable.
- **Prepared slots:** cantrips and focus spells can no longer be prepared in
  spell slots; imported illegal entries are now errors, not warnings.

### 4.2 Conditions and combat math

- **Enfeebled** now applies a status penalty to Strength-based damage rolls, in
  addition to Strength checks and melee attack rolls.
- **Stupefied** now penalizes Perception (a Wisdom-based check).
- **Unconscious** no longer applies its −4 status penalty to Fortitude or Will;
  it applies to AC, Perception, and Reflex only, plus off-guard.
- **Confused** now makes the character off-guard.
- **Blinded** note text was corrected; the numeric −4 Perception remains.
- **Drained** still reduces maximum HP; current-HP loss on gaining the
  condition remains manual (see remaining gaps).
- **Armor speed penalty:** meeting the armor's Strength requirement now reduces
  a −10 penalty to −5; it does not remove the entire penalty. Chain mail's −5
  still becomes 0.
- **Worn armor Bulk** is reduced by 1, matching the carried/worn rule.
- **Item bonus stacking:** resilient runes, Automatic Bonus Progression, and
  save-item bonuses now take the highest bonus instead of adding together; the
  same applies to AC item bonuses.
- **Save upgrades:** Evasion/Juggernaut/Will-save upgrades are now passed to the
  socket roll as `upgradeSuccess`, so a success can become a critical success.
- **Diehard:** the death threshold is dying 5 instead of dying 4, before doomed.
- **Massive damage:** a single blow of at least twice maximum HP now kills.
- **Nonlethal damage:** reaching 0 HP causes unconsciousness, not dying or
  death, in both the shared helper and the token socket path.

### 4.3 Recovery and rest

- **Treat Wounds / Battle Medicine table** (`src/shared/recovery.ts`):
  - DC 15: 2d8 success / 4d8 critical
  - DC 20: 2d8+10 / 4d8+10
  - DC 30: 2d8+30 / 4d8+30
  - DC 40: 2d8+50 / 4d8+50
  Critical success is a separate row, not “double the success healing”.
- **Stabilize** uses DC 15 + the target's dying value, is available untrained,
  and has no 1 HP critical-success rider. It removes dying, increases wounded,
  and leaves the target unconscious at 0 HP.
- **Wounded** is no longer removed immediately by healing to full HP. It ends on
  a successful Treat Wounds or after a full-HP rest.
- **Robust Health** is read from the target, not the healer, and uses the
  target's level for the extra HP.
- **Doomed** is removed when the character dies.

### 4.4 Encounters and table rules

- **Low encounter budget** per additional character is 15 XP, not 20.
- **Creatures five or more levels below the party** are worth 0 XP; the table
  previously awarded 10 XP to any deeper under-level creature.
- The shared encounter XP helper remains correct for trivial/low budgets; the
  campaign encounter-builder UI was removed from the current core in a separate
  product pass.
- **Low-light vision in darkness** is concealed (DC 5), not hidden (DC 11).
- **Damage defenses** now understand `physical`, `all-damage`, and
  `nonlethal-attacks`, apply exceptions, and use the correct order: weakness
  first, then resistance, then clamp at zero.

### 4.5 Data and import pipeline

- **Balanced macro parsing** for `@Damage`, `@Check`, `@Save`, and `@Template`.
  Actor- and level-dependent formulas fall back to the authored label or the
  damage type; raw `@actor.level` text no longer leaks into descriptions.
- **Verifier hardening** for malformed macro expansion.
- **Deity spells** are normalized to local spell IDs/names and rendered on the
  deity page. Published lists for Dammar, Inna, and Tolte Coatl are filled in
  where Foundry omits them.
- **Psychic key ability** is published as Intelligence or Charisma.
- **Legacy/expansion bestiaries** are ingested, and duplicates prefer Monster
  Core > NPC Core > other sources.
- **Compendium refresh** from Foundry `a70593f7` adds current ancestries,
  heritages, backgrounds, feats, spells, items, and actions.

---

## 5. Remaining rules gaps (prioritized)

### P0/P1 — correctness or table trust

1. **Prepared cantrips need a real prepared list.** A wizard's spellbook holds
   10 cantrips but the wizard prepares 5 plus a curriculum cantrip; the sheet
   currently treats every chosen cantrip as castable. Add
   `spells.preparedCantrips` and a daily-preparation cantrip section. The same
   split is needed for magus, cleric, druid, witch, and necromancer.
2. **Animist prepared and apparition slots are conflated.** The total table is
   correct, but `ordinarySpellSlotsFor` and `canPrepareSpellAtRank` treat every
   slot as prepared. At 19th level this allows four prepared spells at ranks
   1-8 instead of two, and permits preparing into the apparition-only 10th-rank
   slot. Model `{ prepared, apparition }` separately.
3. **Psychic conscious-mind grants and repertoire limits are missing.** The
   conscious mind should add an extra 1st-rank spell, two common psi cantrips,
   and higher-rank spells; the psychic should have a bounded repertoire limit.
4. **Oracle mystery spells and Divine Access are missing.** The base oracle
   repertoire is correct, but the mystery cantrip/1st-rank spell and later
   granted spells should be extras, not subtracted from the base limit.
5. **Spontaneous casters cannot represent a spell learned at more than one
   rank.** `known` is a flat set, so a sorcerer who legally learned a 5th-rank
   Fireball cannot cast it at 5th unless it is a signature spell. Move to
   rank-aware known entries.
6. **Drained current-HP loss.** Gaining drained reduces maximum HP but does not
   remove the level × value current HP. A 60/60 level-5 character who becomes
   drained 1 should show 55/55, not 60/55.
7. **Battle Medicine immunity is cleared by an 8-hour rest.** It should last
   1 day (or 1 hour with Robust Health); store an expiry rather than clearing on
   rest.
8. **Weapon traits that change damage are display-only:** two-hand, deadly,
   fatal, forceful, and backstabber. Add a two-hand wielding toggle and a
   critical-damage helper.
9. **Thrown melee weapons have only a melee profile.** Daggers, spears, and
   tridents with `thrown-N` should also emit a ranged profile (Dex to hit, Str
   to damage).
10. **Bulwark armor** still uses Dexterity for Reflex saves; it should offer +3
    on Reflex saves against damaging effects.
11. **Cover** grants +2/+4 AC but not the Reflex bonus against area effects.
12. **Persistent damage survives a long rest.** Clear it during rest, or advance
    its duration.

### P2 — class and data completeness

- Wizard higher-rank curriculum slots are unconstrained after rank 1; the data
  only curates rank-0/1 curriculum spells.
- Focus-only classes (monk, ranger, champion, etc.) use the global spell
  attack/DC; non-casters with focus or innate spells should derive their own.
- Innate spell frequency is inferred from the spell description instead of the
  granting ability, and innate spells use the class spell attack/DC.
- Commander tactics and Runesmith runes need pickers and repertoire tracking.
- Background skill/feat grants need curated overrides for the prose-only cases.
- Add hazards, vehicles, familiar abilities, afflictions, boons/curses, and a
  trait glossary as read-only compendium types.

---

## 6. Recommended order

1. Daily preparation loop: prepared cantrips, per-character rest, and a pending
   preparations banner. This fixes the most visible trust gap for prepared
   classes.
2. Animist split and psychic/oracle class grants.
3. Rank-aware spontaneous repertoire and innate spell attack/DC.
4. Drained current-HP loss and Battle Medicine expiry.
5. Weapon traits, thrown profiles, bulwark, and cover Reflex bonuses.
6. Add the missing reference types (hazards, vehicles, familiars, traits,
   afflictions) once the schema for a “reference entry” is settled.

---

## 7. References

- Archives of Nethys, Bard: https://2e.aonprd.com/Classes.aspx?ID=3
- Archives of Nethys, Cleric: https://2e.aonprd.com/Classes.aspx?ID=33
- Archives of Nethys, Sorcerer: https://2e.aonprd.com/Classes.aspx?ID=62
- Archives of Nethys, Psychic: https://2e.aonprd.com/Classes.aspx?ID=21
- Archives of Nethys, Animist: https://2e.aonprd.com/Classes.aspx?ID=64
- Archives of Nethys, Necromancer: https://2e.aonprd.com/Classes.aspx?ID=75
- Archives of Nethys, Medicine/Treat Wounds: https://2e.aonprd.com/Skills.aspx?ID=9
- Archives of Nethys, Dying: https://2e.aonprd.com/Rules.aspx?ID=377
- Archives of Nethys, Wounded: https://2e.aonprd.com/Conditions.aspx?ID=99
- Archives of Nethys, Heroic Recovery: https://2e.aonprd.com/Rules.aspx?ID=382
- Archives of Nethys, Automatic Bonus Progression: https://2e.aonprd.com/Rules.aspx?ID=2741
- Archives of Nethys, Encounter Budget: https://2e.aonprd.com/Rules.aspx?ID=498
- Archives of Nethys, Armor: https://2e.aonprd.com/Rules.aspx?ID=2166
- Archives of Nethys, Resistance: https://2e.aonprd.com/Rules.aspx?ID=2180
