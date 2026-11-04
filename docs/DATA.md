# PF2e compendium data

## Source

Runehall generates its local compendium from the [Foundry VTT PF2e system](https://github.com/foundryvtt/pf2e) repository, which is licensed under the **Apache License 2.0**.

The generated files live in `data/compendium/`. They are committed/generated separately from the SQLite database so they can be rebuilt without touching user data.

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
- localization: `static/lang/en.json`, `re-en.json`, `action-en.json`

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
  static/lang
```

Then from the project root:

```bash
npm run ingest
```

The ingest records the source Git commit, a short ref, and whether the working tree was dirty in `data/compendium/manifest.json`. Use those fields to reproduce a known-good compendium later:

```bash
git -C "$cache" checkout be611895ec16d4672f53d014527d9007b06cb409
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
| `classes.json` | Class chassis, feature references, feat levels, choice groups |
| `classFeatures.json` | Flattened class feature data and proficiency subfeatures |
| `feats.json` | Feats with category, level, traits, rarity, prerequisites, HTML text |
| `spells.json` | Spells with rank (cantrips normalized to rank 0), traditions, defense, damage, heightening |
| `equipment.json` | Weapons/armor/shields/consumables/gear with price, bulk, traits, mechanics |
| `deities.json` | Domains, divine font, skill, favored weapon, spells |
| `conditions.json` | Conditions |
| `actions.json` | Actions and activities |
| `monsters.json` | Bestiary/NPC data, attacks, abilities, stat block |
| `manifest.json` | Counts, generated timestamp, source, `sourceCommit`, `sourceRef`, `sourceDirty` |

## Normalization notes

- **Descriptions are sanitized** with `sanitize-html`; only safe structural HTML is kept.
- **Foundry inline macros** (`@UUID`, `@Localize`, `@Damage`, etc.) are converted to readable text or resolved through the English language packs.
- **Traits:** visible traits live in `traits`; internal subclass tags live in `otherTags`. Class choice groups are derived from `system.traits.otherTags` and ChoiceSet tag filters.
- **Proficiency subfeatures and rules:** class features and subclass options can carry `subfeatures.proficiencies`, static `ActiveEffectLike` rank upgrades, and `MartialProficiency` rules. These are merged so the rules engine can apply expert/master/legendary upgrades at the correct level. Static skill-rank rules are also preserved as `skillRanks` for automatic upgrades such as Inventor Overdrive.
- **Ancestry features and speeds:** ancestry feature items resolve by name and UUID fallback; non-land speeds and land-speed override rules become `otherSpeeds` and `speed`.
- **Subclass skills:** fixed skill training from class-feature rules is copied to each choice option (`trainedSkills`). Choice-based skills remain selectable through the class's additional skill slots.
- **Granted features:** class features referenced by subclass options (for example, cleric doctrines and battle creeds) are resolved into `grantedFeatures` with their level, proficiencies, lore, and favored-weapon rank.
- **Background skill choices:** ChoiceSet skill rules become `skillChoices`; static skill rank rules are merged into `trainedSkills`. Rare/legacy backgrounds whose skill, Lore, or starting-feat choices exist only in prose are patched with `skillChoices`, `loreChoices`, `featChoices`, or fixed `lore`/`grantedFeats`.
- **Spell damage:** Foundry `formula`/`type` damage entries and heightening formulas are normalized into `{ formula, type }` parts.
- **Deities:** primary and alternate domains are separated; the skill field remains an array because some deities offer a choice.
- **Versatile heritages:** heritages with no ancestry are marked `versatile` so they can be selected by any ancestry.
- **Vision:** Foundry's `low-light-vision` is normalized to `lowLight`.
- **Cantrips:** Foundry stores cantrip spell level as 1; Runehall normalizes anything with the `cantrip` trait to rank 0.
- **Background lore:** values that already end in “Lore” are not suffixed again.
- **Monsters:** source/license come from `system.details.publication`; attacks and abilities come from embedded items. Foundry icon paths are not copied, so tokens use initials unless the GM supplies art.
- **Deduplication:** monsters use name + level, preferring Monster Core over NPC Core; legacy/remaster duplicates remain available and default to remaster in most pickers.

## Licensing

- Foundry VTT PF2e system: Apache-2.0. Retain the upstream license/attribution when redistributing generated data.
- Pathfinder Second Edition rules content: ORC License; Pathfinder and related marks are trademarks of Paizo Inc.
- Runehall includes no Paizo artwork. Map/token/portrait uploads are the uploader's responsibility.
- See `THIRD_PARTY_NOTICES.md` and `data/compendium/manifest.json` for source metadata.

The ORC License text and Paizo's compatibility statement are available from Paizo. Runehall is an independent, unofficial tool and is not endorsed by Paizo.
