# PF2e compendium data

## Source

Runehall generates its local compendium from the [Foundry VTT PF2e system](https://github.com/foundryvtt/pf2e) repository, which is licensed under the **Apache License 2.0**.

The generated files live in `data/compendium/`. They are committed/generated separately from the SQLite database so they can be rebuilt without touching user data. `ritualData.json` holds the structured primary/secondary ritual checks that the spell rows do not carry; the server merges it into spell context at load time.

The generated compendium is currently tracked in Git so a fresh clone is runnable without a data download (about 40 MB). Re-running ingest replaces those files and can grow repository history; regenerate only when the source commit or normalization changes, or move the folder to Git LFS / a release artifact if history size becomes a problem.

### Packs used
- `ancestries`, `heritages`, `ancestry-features`
- `backgrounds`
- `classes`, `class-features`
- `feats`
- `spells`
- `equipment`
- `deities`
- `conditions`
- `actions`
- `pathfinder-monster-core`, `pathfinder-monster-core-2`, `pathfinder-npc-core`
- legacy/expansion bestiaries: `pathfinder-bestiary`, `pathfinder-bestiary-2`, `pathfinder-bestiary-3`, `lost-omens-bestiary`, `npc-gallery`, `battlecry-bestiary`, `howl-of-the-wild-bestiary`, `book-of-the-dead-bestiary`, `rage-of-elements-bestiary`, `war-of-immortals-bestiary`
- `hazards`, `vehicles`, `familiar-abilities`, `boons-and-curses`
- `journals` (`domains.json` for the domain reference)
- localization: `static/lang/en.json`, `re-en.json`, `action-en.json`

### Archives of Nethys reference files
The Foundry packs do not contain a trait glossary, afflictions, or the Runesmith
rune list. These files are generated separately from the live Archives of Nethys
index:

```bash
npm run ingest:aon
npm run ingest:runes
```

`ingest:aon` writes `traits.json` and `afflictions.json` and records an
`aonSource` block in `manifest.json`. `ingest:runes` reads the Runesmith rune
list, writes `runes.json`, and records `runesSource` plus the rune count in the
manifest. Afflictions include diseases, curses, and poisons. The remaining files
are Foundry-sourced. Trait, affliction, and rune rules text is Pathfinder ORC/OGL
content published by Paizo and indexed by Archives of Nethys; see
`THIRD_PARTY_NOTICES.md`.

## Rebuild the data

The source clone is intentionally not kept in the project directory. A sparse, blob-filtered clone keeps it manageable:

```powershell
$cache = Join-Path $env:TEMP "pf2e-data"
git clone --depth 1 --filter=blob:none --sparse https://github.com/foundryvtt/pf2e.git $cache
git -C $cache reset --hard origin/v14-dev
git -C $cache sparse-checkout set `
  packs/pf2e/ancestries `
  packs/pf2e/heritages `
  packs/pf2e/ancestry-features `
  packs/pf2e/backgrounds `
  packs/pf2e/classes `
  packs/pf2e/class-features `
  packs/pf2e/feats `
  packs/pf2e/spells `
  packs/pf2e/equipment `
  packs/pf2e/conditions `
  packs/pf2e/actions `
  packs/pf2e/deities `
  packs/pf2e/pathfinder-monster-core `
  packs/pf2e/pathfinder-monster-core-2 `
  packs/pf2e/pathfinder-npc-core `
  packs/pf2e/pathfinder-bestiary `
  packs/pf2e/pathfinder-bestiary-2 `
  packs/pf2e/pathfinder-bestiary-3 `
  packs/pf2e/lost-omens-bestiary `
  packs/pf2e/npc-gallery `
  packs/pf2e/battlecry-bestiary `
  packs/pf2e/howl-of-the-wild-bestiary `
  packs/pf2e/book-of-the-dead-bestiary `
  packs/pf2e/rage-of-elements-bestiary `
  packs/pf2e/war-of-immortals-bestiary `
  packs/pf2e/hazards `
  packs/pf2e/vehicles `
  packs/pf2e/familiar-abilities `
  packs/pf2e/boons-and-curses `
  packs/pf2e/journals `
  static/lang
```

Then from the project root:

```bash
npm run ingest
```

The ingest records the source Git commit, a short ref, and whether the working tree was dirty in `data/compendium/manifest.json`. Use those fields to reproduce a known-good compendium later:

```bash
git -C "$cache" checkout a70593f7d52ba6357c3bdc05c09dcb9d4f2765dc
npm run ingest
```

Or point at a clone elsewhere:

```bash
node scripts/ingest-pf2e.mjs --source "D:/data/pf2e"
```

The script writes:

| File | Contents |
| --- | --- |
| `ancestries.json` | Ancestry boosts, flaws, HP, speed, vision, languages, features |
| `heritages.json` | Heritage data and ancestry links |
| `backgrounds.json` | Background boosts, trained skills, lore, granted feats |
| `runes.json` | Runesmith runes from Archives of Nethys: level, traits, usage, passive and invocation text, diacritic flag |
| `classes.json` | Class chassis, feature references, feat levels, choice groups |
| `classFeatures.json` | Flattened class feature data and proficiency subfeatures |
| `feats.json` | Feats with category, level, traits, rarity, prerequisites, HTML text |
| `spells.json` | Spells with rank (cantrips normalized to rank 0), traditions, defense, damage, heightening |
| `equipment.json` | Weapons/armor/shields/consumables/gear with price, bulk, traits, mechanics |
| `deities.json` | Domains, divine font, skill, favored weapon, spells |
| `domains.json` | Domain descriptions, initial/advanced domain spells, deity and pantheon lists |
| `conditions.json` | Conditions |
| `actions.json` | Actions and activities |
| `monsters.json` | Bestiary/NPC data, attacks, abilities, stat block |
| `hazards.json` | Hazard level, complexity, stealth, disable/reset/routine, abilities |
| `vehicles.json` | Vehicle level, price, AC/HP, crew, speed, collision data |
| `familiarAbilities.json` | Familiar ability rules text |
| `boonsAndCurses.json` | Deity boons and curses by tier |
| `traits.json` | Trait glossary from Archives of Nethys |
| `afflictions.json` | Diseases, curses, and poisons with saves, onset, stages, and prices from Archives of Nethys |
| `manifest.json` | Counts, generated timestamp, source, `sourceCommit`, `sourceRef`, `sourceDirty` |

## Verify the data

Run:

```bash
npm run verify:data
```

The verifier checks manifest counts, unique and prefixed IDs, required fields, cross-references (heritage ancestries, background feats, class-feature options, skills), numeric ranges, unresolved Foundry macros, and the SQLite database (`PRAGMA integrity_check` and `PRAGMA foreign_key_check`). Missing descriptions, class-locked spells without a tradition, and non-damaging creature attacks are reported as warnings because those are legitimate content patterns, not structural errors.

## Normalization notes

- **Descriptions are sanitized** with `sanitize-html`; only safe structural HTML is kept.
- **Foundry inline macros** (`@UUID`, `@Localize`, `@Damage`, `@Check`, `@Template`, etc.) are converted to readable text or resolved through the English language packs. Nested macros such as `@Damage[4d6[fire]]` and `@Damage[(@actor.level)d6[bleed]]` use a balanced-bracket parser; actor- and level-dependent formulas fall back to the authored display label or the damage type instead of leaking raw `@actor.level` syntax. `@Embed` references are resolved against the loaded class-feature, feat, and equipment source items.
- **Deity spell lists** are resolved from Foundry UUIDs to local `spell:` IDs and names, and are shown on the deity page.
- **GM-facing rules text** is used as a fallback when a spell or item has an empty player-facing description. Those entries carry `gmDescription: true` and are labeled **GM source text** in the library.
- **Rituals** are marked with `ritual: true`; they live in the spell pack but have no magical tradition.
- **Source gaps remain visible.** Some generic gear, treasure, and a handful of creature entries have no separate rules text in the source export; the UI shows their structured statistics plus an explicit fallback instead of inventing rules text.
- **Traits:** visible traits live in `traits`; internal subclass tags live in `otherTags`. Class choice groups are derived from `system.traits.otherTags` and ChoiceSet tag filters.
- **Proficiency subfeatures and rules:** class features and subclass options can carry `subfeatures.proficiencies`, static `ActiveEffectLike` rank upgrades, and `MartialProficiency` rules. These are merged so the rules engine can apply expert/master/legendary upgrades at the correct level. Static skill-rank rules are also preserved as `skillRanks` for automatic upgrades such as Inventor Overdrive.
- **Ancestry features and speeds:** ancestry feature items resolve by name and UUID fallback; non-land speeds and land-speed override rules become `otherSpeeds` and `speed`.
- **Subclass skills:** fixed skill training from class-feature rules is copied to each choice option (`trainedSkills`). Choice-based skills remain selectable through the class's additional skill slots.
- **Granted features:** class features referenced by subclass options (for example, cleric doctrines and battle creeds) are resolved into `grantedFeatures` with their level, proficiencies, lore, and favored-weapon rank.
- **Background skill choices:** ChoiceSet skill rules become `skillChoices`; static skill rank rules are merged into `trainedSkills`. Rare/legacy backgrounds whose skill, Lore, or starting-feat choices exist only in prose are patched with `skillChoices`, `loreChoices`, `featChoices`, or fixed `lore`/`grantedFeats`. Runtime-only patches that would be overwritten by re-ingest live in `src/shared/backgroundGrants.ts`.
- **Spell damage:** Foundry `formula`/`type` damage entries and heightening formulas are normalized into `{ formula, type }` parts.
- **Deities:** primary and alternate domains are separated; the skill field remains an array because some deities offer a choice.
- **Versatile heritages:** heritages with no ancestry are marked `versatile` so they can be selected by any ancestry.
- **Vision:** Foundry's `low-light-vision` is normalized to `lowLight`.
- **Cantrips:** Foundry stores cantrip spell level as 1; Runehall normalizes anything with the `cantrip` trait to rank 0.
- **Background lore:** values that already end in “Lore” are not suffixed again.
- **Monsters:** source/license come from `system.details.publication`; attacks and abilities come from embedded items. Foundry icon paths are not copied, so tokens use initials unless the GM supplies art.
- **Deduplication:** monsters use name + level, preferring Monster Core over NPC Core; legacy/remaster duplicates remain available and default to remaster in most pickers.
- **Creature reconciliation:** `scripts/monster-overrides.json` applies AoN-verified HP, AC, saves, Perception, size, skills, and rarity corrections. Speed and attack-list differences are left to their source representation because they often encode alternate forms or abilities.
- **Equipment editions:** each item keeps its `remaster` flag, and the gear picker and character-sheet item browser display a Remastered or Legacy label so mixed-era prices and groups are explicit.
- **Vehicles:** when a source vehicle has no prose description, the UI derives a statblock summary (level, size, HP, AC, hardness, speed, crew, passengers, and price).

## Licensing

- Foundry VTT PF2e system: Apache-2.0. Retain the upstream license/attribution when redistributing generated data.
- Pathfinder Second Edition rules content: ORC License; Pathfinder and related marks are trademarks of Paizo Inc.
- Runehall includes no Paizo artwork. Map/token/portrait uploads are the uploader's responsibility.
- See `THIRD_PARTY_NOTICES.md` and `data/compendium/manifest.json` for source metadata.

The ORC License text and Paizo's compatibility statement are available from Paizo. Runehall is an independent, unofficial tool and is not endorsed by Paizo.
