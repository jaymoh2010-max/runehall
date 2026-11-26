# Compendium and database accuracy review

Date: 2026-11-26

Scope: every generated file in `data/compendium/` and the local SQLite database
schema/data. Sources checked against the live Archives of Nethys (AoN) search
index and individual AoN entries, plus the pinned Foundry VTT PF2e source
commit recorded in `data/compendium/manifest.json`
(`a70593f7d52ba6357c3bdc05c09dcb9d4f2765dc`).

This review found and fixed a number of concrete data errors. It also identifies
places where the local data intentionally differs from AoN because the local
compendium keeps both legacy and remastered content.

## Method

1. Ran `npm run verify:data` to check counts, IDs, cross-references, required
   fields, unresolved Foundry macros, and SQLite integrity/foreign keys.
2. Pulled the live AoN search documents for ancestries, classes, backgrounds,
   feats, spells, weapons, armor, shields, equipment, deities, conditions,
   actions, and creatures.
3. Compared the structured fields (level/rank, HP, AC, saves, traditions,
   domains, fonts, bulk, price, traits, action costs, ranges, and so on) using
   exact source matching. Source matching preserves "(Remastered)" so a
   remastered entry is never compared with its legacy version.
4. Opened individual AoN entry pages for every mismatch that could affect play
   (spell rank/action/range, deity font/sanctification/skill/domains, item bulk,
   background choices) because the AoN search document sometimes omits
   conditional text that the page contains.
5. Applied confirmed corrections through `scripts/compendium-overrides.mjs` so a
   future `npm run ingest` keeps them. `npm run apply:data-overrides` repairs an
   existing checkout without a full source clone.

## What was fixed

### Monsters

- Foundry stores both melee and ranged NPC strikes as item type `melee`; the
  only reliable ranged marker is a positive range increment. The ingest now
  publishes 481 ranged attacks as `type: "ranged"` and the remaining 4,620 as
  `type: "melee"`. The verifier now rejects an attack whose type disagrees with
  its range.

### Spells

Corrected action costs, ranks, traditions, ranges, and rarity for entries where
the Foundry item disagreed with the published AoN page:

- Action costs: Gloom Mantle, Metal Merged, Wish Market, Far-Flung Fetch,
  Timely Reminder, Cup of Dust, Warning Stripes, Channel Arrogance, Ember
  Doppelgänger, Howling Blizzard, Sawtooth Terrain, Spiritual Torrent, Patron's
  Protector, Theogeny, Summon Oliphaunt of Jandelay, Glimpse the Netherworld, and
  The Night is Mine.
- Rank: Pin the Spears in the Lamb (2), Tenebrous Freedom (4), Theatrical
  Throwdown (5).
- Range: Flame Barrier (60 feet), Thief of Fortune (30 feet).
- Traditions: Guiding Star, Unending Tears, Incarnate Draconic Legion.
- Rarity: Adapt Self (uncommon).

Splinter Volley was deliberately left as "2 or 3" actions: its AoN page says the
caster can spend a third action to attack a second target, so the Foundry
variable-action value is more precise than the AoN stat-block label.

### Deities

The Foundry deity export contained a cluster of drifted values. Corrected
attributes, primary/alternate domains, divine fonts, skills, and sanctification
for the entries where the AoN page was unambiguous, including:

- Sanctification: Pazuzu, Myr, Thremyr, Cixyron, Diomazul, Droskar, Husk, The
  Circle of the Damned, Bharnarol, Immaculate Growth, Charg, Chavazvug, Kitumu,
  Lorthact, Alocer, Angazhan, Essence Dancers, and Lissala.
- Divine font: Cixyron, Cormion, Diomazul, Imot, Ketephys, Lissala, Scal,
  Srikalis/Sritaming/Sribaril, Telvrys, Thamir, Treerazer, Umarik, Uskyeria,
  Vavaalrav, and Ylimancha.
- Divine attribute: Baphomet, Corosbel, Jezelda, Kabriri, Laudinmio, Lissala,
  Shawnari, Shyka, The Perplexing Jest, and Tolte Coatl.
- Domains/skills: Alocer, Daikitsu, Dajermube, Droskar, Elion, Laudinmio,
  Lissala, Lao Shu Po, Mazludeh, Sorrow's Sword, Conqueror Worm, and Thremyr.

Deity weapons were stored as Foundry slugs (`sawtooth-saber`,
`flintlock-musket`, and 92 others). They are now published as normal names, and
the rules engine normalizes punctuation before comparing a deity's favored
weapon to an inventory item. This fixes favored-weapon proficiency for every
hyphenated weapon name.

### Ancestries

- Kashrishi now has the Kashrishi language in addition to Common.
- Dragonet, Fleshwarp, and Poppet now include their own ancestry traits.

### Backgrounds

Added structured choices that were only present in prose:

- Noble: Genealogy Lore or Heraldry Lore.
- Street Urchin: a Lore skill for the character's home city.
- Gold Falls Regular: Cooking Lore or Volcano Lore.
- Streetfood Vendor: Crafting or Society.
- Second Chance Champion: Athletics (the Foundry item incorrectly granted
  Acrobatics).
- Archival Assistant and Chitterwood Refugee: corrected ability boosts.

### Equipment

- Switchscythe Bulk 2 (was 0).
- Polytool Bulk L (was 1).
- Donchak now has the Reload 1 trait.
- Clockwork Macuahuitl now has the Clockwork trait.
- Rotary Bow, Taw Launcher, and Tri-bladed Katar now use the published weapon
  groups (bow, bow, and brawling respectively).

### Verifier hardening

`npm run verify:data` now also rejects:

- ranged/melee attack types that disagree with the range increment;
- unknown divine fonts or malformed sanctification data;
- deity weapon slugs that still contain hyphens;
- spells whose `actionType` and `actions` disagree.

## Verification after the fixes

| Command | Result |
| --- | --- |
| `npm run verify:data` | Pass; 4 expected content warnings |
| `npm run check` | Pass; 823 tests, typecheck, lint, format, build, bundle budget |
| `npm run smoke` | Pass |
| `npm run e2e` | 37 passed |
| `npm run simulate:campaign` | 18 passed, 0 failed |

The SQLite database in the main checkout passes `PRAGMA integrity_check` and
`PRAGMA foreign_key_check`, and the migration ledger contains migrations 1-57
across 39 tables with no duplicates. The database contains no users, campaigns,
or characters, so there is no user content to reconcile.

## Known remaining differences

These are real differences between the local compendium and AoN that were not
changed because they need a product decision or a schema/UI change:

1. **Awakened Animal is variable.** The ancestry's HP depends on its chosen size
   (6/8/10), its size is chosen from Tiny/Small/Medium/Large, and its Speed comes
   from its heritage. The current data stores Medium/6 HP and cannot represent
   the choice.
2. **Class skill choices.** Fighter (Acrobatics or Athletics) and Runesmith
   (Arcana, Nature, Occultism, or Religion) grant one fixed choice that the class
   schema does not represent; the builder currently offers only the additional
   skill slots. Cleric and Champion deity skills are handled separately through
   the deity data.
3. **Prose-only background grants.** About 80 backgrounds have a Lore skill
   whose exact name is chosen in prose (for example "a Lore skill for your
   home city"). The builder can accept a custom Lore entry, but the compendium
   cannot enumerate every legal name.
4. **Creature stat drift.** Most creatures match AoN exactly. A small set,
   especially in Monster Core 2, differs in HP/AC/saves/size/speed. Examples
   include Totum Font (Foundry 104 HP vs AoN 325), Adlet (level 10 vs 9), Zebub
   (30 vs 45 HP), and Oread Guard (16/15 vs 20/17 HP/AC). These look like
   upstream data-entry differences; they should be reconciled against the
   printed books before changing, because AoN is not always the newer source.
5. **Legacy/remaster equipment.** Some Guns & Gears and Treasure Vault items
   have legacy prices/levels alongside remastered groups or bulk. The local
   compendium intentionally keeps both eras, so source matching can show a
   difference without the local value being wrong.
6. **Conditional sanctification.** Hei Feng can choose unholy, and can choose
   holy only for tengu. The schema has no conditional sanctification field, so
   the local entry remains permissive.
7. **Reference coverage.** Traits are labels only; hazards, vehicles, familiar
   abilities, afflictions, and a trait glossary are still outside the compendium.

## References

- Archives of Nethys search API: https://elasticsearch.aonprd.com/aon/_search
- Archives of Nethys: https://2e.aonprd.com/
- Foundry VTT PF2e source: https://github.com/foundryvtt/pf2e
- Pinned source commit: `a70593f7d52ba6357c3bdc05c09dcb9d4f2765dc`
- Example corrected pages:
  - Pazuzu: https://2e.aonprd.com/Deities.aspx?ID=434
  - Lissala: https://2e.aonprd.com/Deities.aspx?ID=407
  - Tenebrous Freedom: https://2e.aonprd.com/Spells.aspx?ID=2951
  - Theatrical Throwdown: https://2e.aonprd.com/Spells.aspx?ID=2952
  - Flame Barrier: https://2e.aonprd.com/Spells.aspx?ID=1805
  - Sawtooth Saber: https://2e.aonprd.com/Weapons.aspx?ID=386
