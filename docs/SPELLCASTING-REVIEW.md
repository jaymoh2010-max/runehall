# Spellcasting support review and sprint plan

Date: 2026-11-23

Status: review complete. Sprint 1 (the daily spellcasting loop), the class-grant portion of Sprint 2, the first table-magic pass of Sprint 3, the magus studious-slot pass of Sprint 4, the animist prepared/spontaneous split of Sprint 5, the spontaneous known-at-rank pass of Sprint 6, the psychic psi-amp pass of Sprint 7, the table Sustain-reminder pass of Sprint 8, the higher-slot downcast pass of Sprint 9, the scroll-spellcasting pass of Sprint 10, the Magic Wand spellcasting pass of Sprint 11, the fixed-spell specific-wand pass of Sprint 12, the expanded/advanced domain pass of Sprint 13, the flexible-wand pass of Sprint 14, the staff/trait-restricted wand pass of Sprint 15, the ritual-detail pass of Sprint 16, the spell-source label pass of Sprint 17, the staff-slot/repeated-domain pass of Sprint 18, the oracle mystery-domain pass of Sprint 19, the Learn-a-Spell pass of Sprint 20, the last-staff-list pass of Sprint 21, the multiclass-dedication pass of Sprint 22, the multiclass-slot pass of Sprint 23, the variable-tradition dedication pass of Sprint 24, the heightening/starting-budget pass of Sprint 25, the higher-rank class-choice pass of Sprint 26, the later-domain-feat pass of Sprint 27, the structured-ritual-data pass of Sprint 28, the spellbook-budget pass of Sprint 29, the staff-effect-visibility pass of Sprint 30, and the full ritual-coverage pass of Sprint 31 were implemented on 2026-11-23 through 2026-11-27. The findings below describe the pre-Sprint state; the implementation status sections record what changed, and the remaining class and table gaps stay in the backlog.

> **Follow-up (2026-11-23):** `docs/RULES-AUDIT.md` corrected two table errors
> this review did not catch: bards use the 2/3 full-caster slot table (not the
> sorcerer/oracle 3/4 table), and cleric divine font moves to 10th rank at
> 19th-20th level. The broader spellcasting gaps below still apply.

## Scope

This review covers every class that gains spellcasting, focus spells, or innate spells, plus the table-facing spell loop:

- Spell slots and daily preparations
- Prepared vs. spontaneous casting
- Cantrips and heightening
- Divine font, wizard curriculum, and other class resources
- Focus spells, focus points, and Refocus
- Innate spells and innate uses
- Rituals
- Spellbook / repertoire bookkeeping
- The character builder, character sheet, and campaign rest flow

The audit is based on the Player Core / remastered rules, with class-specific checks against the local compendium data. Rules references are listed at the end.

## Executive summary

The foundation is good. Runehall already has:

- Correct full-caster, spontaneous full-caster, bounded-caster, and animist slot tables
- Prepared copies at specific ranks, including duplicate preparations and upcasting
- Cleric divine font, including a dual-font lock-in
- Wizard curriculum slots and rank-aware validation
- Focus points, innate uses, and cantrip/focus automatic heightening
- Structured spell damage heightening for safe interval formulas
- A single Cast action that spends the selected resource and posts to chat

The largest correctness gap at review time was the **daily preparation loop**. The data model recorded `spells.preparationsPending`, and the campaign long-rest route set it for prepared casters, but no UI read it. The old `DailyPreparationsModal` was removed when the table was simplified in `f4d23aa`. A wizard could long-rest, see no reminder, keep casting the previous day's list, and never be prompted to prepare. Sprint 1 restored the workflow.

There were also several class-specific approximations. The first two are fixed; the rest remain open:

- Prepared cantrips are not a daily choice; the builder treats all selected cantrips as always castable. (Fixed in Sprint 1.)
- Wizard and magus cantrip caps conflate spellbook size with the number prepared per day. (Fixed in Sprint 1.)
- Psychic has no repertoire limit, no conscious-mind grants, no psi cantrips, and no Clarity of Focus increase.
- Necromancer has no grave-spell grants.
- Magus has no studious spell slots.
- Summoner has no link spell or link cantrip.
- Animist combines prepared and spontaneous apparition slots into one prepared pool.
- Focus and innate spells use the class spell attack/DC, which is wrong for non-spellcasters and for innate spells on any character.
- Spontaneous casters cannot represent a spell learned at more than one rank.
- The sustain module is implemented but unused by the UI.
- Rituals are a list and a link, not a castable workflow.

The recommended first sprint is therefore the **daily spellcasting loop**, not broad class automation. Once rest, pending preparations, prepared cantrips, and spell-use reconciliation are correct, every prepared class benefits immediately and the later class-specific work has a stable base.

## Sprint 1 implementation status (2026-11-23)

Sprint 1 is implemented:

- Character sheets can take a long rest, preview the reset, and open daily preparations when the rest finishes.
- `preparationsPending` is surfaced in the sheet, the builder, the party rail, the campaign party cards, and the dashboard character cards.
- Prepared cantrips are a separate daily choice with class-specific known and prepared limits. Wizard curriculum cantrips get their extra slot; magus spellbooks can hold eight cantrips.
- A Restore action undoes a cast's slot, font, focus, or innate use and keeps prepared-copy usage in sync.
- The campaign party rest still sets the pending flag server-side. The client toast for that flow was deferred because `CampaignPage.tsx` is being edited by another session; the summary badges already surface the reminder.

Remaining work stays in Sprint 2 and Sprint 3 below.

## Sprint 2 implementation status (2026-11-23)

The class-specific grant pass is implemented:

- Focus and innate spell attack/DC are derived separately from class spellcasting. Focus-only classes (champion, monk, ranger, and other focus sources) get their own spell DC/attack, and innate spells use their Charisma-based trained/expert profile. The sheet uses the correct attack modifier and shows focus/innate DC on the row.
- The "spellcasting class feature" prerequisite now requires actual spell slots, so focus-only classes no longer qualify accidentally.
- Psychic has a bounded spontaneous repertoire limit, conscious-mind 1st-rank grants, and granted psi cantrips. Clarity of Focus already raises the pool at 5th level. Psi amps are tracked in Sprint 7.
- Necromancer grants Necrotic Bomb and the grim fascination grave spell, with a focus pool of 2.
- Summoner grants Evolution Surge and the at-will Boost Eidolon link cantrip. The link cantrip does not count toward the focus pool.
- Cleric deity spells are included in the available cleric list and can be prepared through the normal daily-preparation workflow.

Still open after this pass: item spellcasting, rituals, sustain, and multiclass archetype casting.

## Sprint 3 implementation status (2026-11-23)

The first table-magic pass is implemented:

- Casting a spell whose text uses Sustain now records it in the sheet's sustained-spell list. Sustained spells can be ended from the list or from the spell row, and Restore removes the active sustain when it undoes the cast.
- Ritual rows expose a **Primary check** action. When the generated description names a known skill, the sheet rolls that skill modifier and posts the check. Many generated ritual descriptions omit the primary-check skill, so those rituals explicitly fall back to manual resolution instead of guessing.
- The ritual helper now rejects prose matches such as "Primary Check to cast..." and unknown Lore names.

Still open: item spellcasting, spellbook learning, and multiclass archetype casting.

## Sprint 4 implementation status (2026-11-23)

Magus studious slots are implemented:

- Two special slots appear at 7th level, become 3rd rank at 11th, and 4th rank at 13th.
- The allowed list combines Gecko Grip, Haste, Fly, and the chosen hybrid study's 7th/11th/13th studious spells.
- Studious spells are prepared separately in the builder and daily-preparations modal.
- Casting spends a studious use, Restore returns it, and long rests reset the uses.
- The sheet shows a separate studious slot row and offers the studious resource alongside ordinary slots.

Still open: item spellcasting, spellbook learning, structured ritual data, and multiclass archetype casting.

## Sprint 5 implementation status (2026-11-23)

The animist prepared/spontaneous split is implemented:

- Animist spellcasting uses the prepared-slot column, while apparition spellcasting uses a separate spontaneous-slot pool.
- The 14 War of Immortals apparitions have curated cantrip and rank 1-9 spell lists, including their vessel focus spells.
- The builder and daily-preparations modal choose two apparitions at 1st level, three at 7th, and four at 15th, with one primary apparition.
- Attuned apparition spells form a spontaneous repertoire. Every apparition spell is a signature spell and can heighten into any available apparition slot.
- The primary apparition's vessel spell is granted as a focus spell, and the focus pool rises at 7th and 15th level.
- Apparition slots are tracked and restored separately from prepared slots; long rests and daily preparations clear both pools.
- The sheet lists attuned apparitions, apparition slots, and the apparition repertoire, and casting an apparition spell never spends a prepared animist slot.

## Sprint 6 implementation status (2026-11-23)

Spontaneous known-at-rank copies are implemented:

- `spells.knownRanks` records the ranks at which each spontaneous spell is known; legacy drafts fall back to the spell's printed rank.
- The builder lets a spontaneous caster add the same spell again at a higher rank, and each rank copy counts against that rank's repertoire limit.
- Cast options offer only the learned ranks for non-signature spells. Signature spells heighten upward from their lowest learned rank.
- Casting a rank copy spends the matching slot and Restore returns it.
- The sheet shows every learned rank in the spell's cast selector.

Still manual: using a higher-rank slot to cast a lower-rank spell without heightening it.

## Sprint 7 implementation status (2026-11-23)

Psychic psi amps are implemented:

- The builder lists the three granted psi cantrips from the chosen conscious mind with curated amp summaries and heightened notes.
- Psi cantrips remain at-will cantrips. An **Amp (1 Focus)** cast option appears beside the normal cantrip cast.
- Casting an amp spends 1 Focus Point; Restore returns it, and an empty pool blocks amping while leaving the base cantrip castable.
- The sheet shows the amp summary on each psi cantrip and marks the cast as amped in chat and toast output.
- Higher-level unique psi cantrips beyond the granted surface cantrip remain manual.

## Sprint 8 implementation status (2026-11-23)

The table Sustain reminder is implemented:

- When the active combatant is a character with sustained spells, the table shows a Sustain reminder below the initiative bar.
- The reminder lists each sustained spell with its cast rank and offers a one-click **Sustain** acknowledgement for the current turn.
- Players who own the character and the GM can end a sustained spell directly from the reminder.
- The reminder resets on the next turn or round and disappears when the character has no sustained spells.
- Opening the character sheet from the reminder is one click away.

## Sprint 9 implementation status (2026-11-23)

Spontaneous higher-slot downcasting is implemented:

- A non-signature spontaneous spell can use a higher-rank slot to cast at a lower rank the character knows, without heightening it.
- Cast options label the slot rank and the effective cast rank, and the sheet tracks the slot spent.
- Signature spells continue to heighten upward normally instead of showing redundant downcast options.
- The sheet toast and chat log record the effective spell rank and the slot rank used.
- Sustained spells started by a downcast record the effective rank.

## Sprint 10 implementation status (2026-11-23)

Scroll spellcasting is implemented:

- Scrolls expose a **Cast scroll** action from the sheet's inventory.
- The scroll picker is filtered to the scroll's rank and the character's spell list, so prepared and spontaneous casters can use spells outside their prepared list or repertoire.
- Casting consumes one scroll and removes the item when the last copy is used.
- Scroll casts use the character's spell DC/attack profile and post the spell name and rank to chat; they do not spend slots, focus, or prepared copies.
- Wands and staves remain manual for now.

## Sprint 11 implementation status (2026-11-23)

Generic Magic Wand spellcasting is implemented:

- Generic **Magic Wand (Nth-Rank Spell)** items expose a **Cast wand** action from the sheet's inventory.
- The wand picker is filtered to the wand's rank and the character's spell list, like scroll casting.
- Casting records the wand's daily use; the row shows **Used today** until daily preparations or a long rest resets item uses.
- Wand casts use the character's spell DC/attack profile and post the spell name and rank to chat; they do not spend slots, focus, or prepared copies.
- Generic wands are treated as charged activations rather than expendable consumables, so activating one no longer spends the inventory stack.
- The wand's chosen spell is not stored on the inventory entry, so the caster selects it when casting. Specific wands and staves remain manual.

## Sprint 12 implementation status (2026-11-23)

Fixed-spell specific wands are implemented:

- Specific wands whose prose names one spell, such as a **Wand of Smoldering Fireballs**, expose a direct **Cast wand** action from the sheet's inventory.
- The sheet reads the spell name and cast rank from the wand's name and description, including heightened wording such as "4th-rank Darkness" and "at 2nd rank".
- Fixed-spell wands share the generic wand daily-use tracker and chat output; a long rest resets them.
- The fixed spell must be on the character's spell list. Flexible wands that let the wielder choose or adjust an arbitrary spell, wands whose spell cannot be read from the data, and staves remain manual.

## Sprint 13 implementation status (2026-11-23)

The cleric domain chain is implemented:

- **Domain Initiate** grants the chosen domain's initial focus spell, limited to the deity's domains and alternate domains.
- **Expanded Domain Initiate** appears at 4th level and grants an initial spell from one of the deity's alternate domains.
- **Advanced Domain** appears at 8th level and grants a rank-4 advanced focus spell from a domain the character already has an initial spell for.
- The Class step shows the new choice groups automatically, and the focus pool grows with the additional focus spells.
- Later domain feats, repeated Advanced Domain picks, and oracle Domain Acumen/Fluency remain manual.

## Sprint 14 implementation status (2026-11-23)

Flexible wands are implemented:

- Wands whose prose says the wielder casts a chosen spell at a listed rank, such as a **Wand of Widening** or **Wand of Reaching**, expose the wand spell picker at that rank.
- Casting records the wand's daily use and posts to chat, with a reminder to apply the wand's own effect; the effect itself stays manual.
- Trait-restricted **Cyrusian wands** and staves remain manual.

## Sprint 15 implementation status (2026-11-24)

Staff spellcasting and trait-restricted wands are implemented:

- Staves expose **Charge** and **Cast staff** actions from the sheet's inventory.
- The sheet reads the staff's spell list, groups it by rank, and spends charges equal to the spell's rank; cantrips are free.
- Charging records a manual pool of up to 5 charges. The player chooses the spell-slot rank and still marks the spent slot manually if the table tracks it.
- A long rest empties staff charges, so the staff must be recharged during daily preparations.
- **Cyrusian wands** now use the wand picker filtered to illusion spells.
- Staves with no readable spell list and casting a staff spell with a spell slot instead of charges remain manual.

## Sprint 16 implementation status (2026-11-24)

Ritual detail cards are implemented:

- Ritual rows expose a **Details** action with the ritual's rank, action time, cost, requirements, and full rules text.
- The card shows the primary-check skill detected from the prose and lets the player override it with any trained skill or lore.
- Manual primary-check choices persist on the character and are used by the ritual's **Primary check** roll.
- The sheet can therefore resolve rituals whose generated data omits the primary-check skill.

## Sprint 17 implementation status (2026-11-24)

Prepared spell-source labels are implemented:

- Wizards and magi see **spellbook**, witches see **familiar**, and necromancers see **dirge**.
- Clerics, druids, and animists see **spell list** instead of a spellbook label.
- Spontaneous casters keep **repertoire**, focus-only classes use **focus spells**, and non-casters use **spells**.
- Builder headings, add/remove labels, and daily-preparation empty states use the correct source name.
- The underlying `spells.known` list is still shared by prepared and spontaneous casters; a full spellbook/known split and Learn a Spell accounting remain open.

## Sprint 18 implementation status (2026-11-24)

Staff slot-casting and repeated Advanced Domain picks are implemented:

- Staff spell rows offer a **Slot** action that spends a normal spell slot of the spell's rank instead of charges.
- The sheet checks ordinary slot capacity, excluding divine font, and records the spent slot in the normal slot pips.
- Advanced Domain can be selected more than once; the choice group expands to one advanced-domain pick per selected copy of the feat.
- Advanced-domain options remain limited to domains the character already has an initial spell for, so multiple picks require Expanded Domain Initiate or another initial-domain source.

## Sprint 19 implementation status (2026-11-24)

Oracle mystery-domain choices are implemented:

- **Domain Acumen** offers only the domains associated with the chosen oracle mystery and grants the selected initial domain spell.
- **Domain Fluency** offers advanced domain spells for mystery domains in which the oracle already has an initial spell.
- Domain Acumen can be taken multiple times; each pick must be a different mystery domain.
- Later oracle domain feats and non-mystery domain access remain manual.

## Sprint 20 implementation status (2026-11-26)

Learn a Spell is implemented for spellbook, familiar, and dirge classes:

- The sheet's Spells tab exposes **Learn spell**.
- The picker shows the cost and DC for the selected spell before confirming.
- Cost is 1 gp per rank for common spells, 2 gp for uncommon, 5 gp for rare, and 10 gp for unique; cantrips use rank-1 pricing.
- The rank-based DC follows the Learn a Spell table.
- Confirming deducts the gold and adds the spell to the character's known list. The check remains manual; remove the spell if the check fails.
- Starting-spellbook value, the two-free-spells-per-level budget, and a full spellbook/known split remain open. (The budget is implemented in Sprint 29; the shared known/book field remains.)

## Sprint 21 implementation status (2026-11-26)

The last two staff lists are implemented:

- Plain-text staff lists such as the Staff of Sverenagati are parsed, including multiple spells at one rank and parenthetical restrictions.
- Bounty's Light resolves the spell list of the Staff of Fire (Greater) it references.

## Sprint 22 implementation status (2026-11-26)

Multiclass spellcasting dedications are partly implemented:

- Fixed-tradition dedications are recognized: Bard, Cleric, Druid, Magus, Oracle, Psychic, Wizard, Necromancer, and Animist.
- The builder shows a dedication-cantrip card with the correct cantrip limit and tradition.
- Selected dedication cantrips are stored separately from the primary class's cantrips.
- The sheet casts dedication cantrips with their own spell DC and attack bonus, derived from the dedication's key ability.
- Basic/Expert/Master Spellcasting slots, and dedications whose tradition depends on a bloodline, patron, or eidolon, remain manual.

## Sprint 23 implementation status (2026-11-26)

Multiclass spellcasting slots are implemented for fixed-tradition dedications:

- Basic Spellcasting grants rank-1/2/3 slots at 4th/6th/8th level.
- Expert Spellcasting grants rank-4/5/6 slots at 12th/14th/16th level.
- Master Spellcasting grants rank-7/8 slots at 18th/20th level.
- The builder tracks dedication spells separately and limits the list to the available slot count.
- The sheet spends dedication slots independently of the primary class's slots and restores them on a long rest.
- Variable-tradition dedications (sorcerer, witch, summoner) and archetype spell heightening remain manual.

## Sprint 24 implementation status (2026-11-26)

Variable-tradition dedications are implemented:

- Sorcerer, Witch, and Summoner dedications now appear alongside the fixed-tradition dedications.
- The builder asks for the dedication's tradition before allowing cantrip or ranked-spell picks.
- Changing the tradition clears the dedication selections to avoid stale invalid spells.
- Validation warns until the tradition is chosen and rejects spells outside it.
- Archetype spell heightening is implemented; other dedication details remain manual.

## Sprint 25 implementation status (2026-11-26)

Multiclass heightening and starting-spellbook guidance are implemented:

- Dedication spells offer every available slot rank at or above the spell's printed rank, so a rank-1 dedication spell can use a higher-rank dedication slot.
- The selected slot rank is recorded and used as the effective cast rank.
- Spellbook/familiar/dirge classes see a starting-contents card with their starting cantrips, ranked spells, gold budget, and two-spells-per-level guidance.
- Current cantrip and ranked-spell counts are shown for comparison; the budget is advisory rather than enforced.

## Sprint 26 implementation status (2026-11-26)

Higher-rank class spell choices are implemented:

- All 18 sorcerer bloodlines grant their bloodline gifts at every rank. Elemental influence, genie type, and draconic exemplar choices fill in the variable ranks.
- Advanced Bloodline and Greater Bloodline grant their focus spells when the feats are selected.
- All 11 oracle mysteries grant their listed mystery spells. Advanced Revelation and Greater Revelation grant their focus spells.
- All wizard schools grant rank-0 through rank-9 curriculum spells. Runelord sins grant their full sin curricula, and Rooted Wisdom branches grant their additional curriculum.
- Imperial's advanced bloodline spell Extend and Corentyn Armada's 3rd-rank aquatic arsenal are absent from the compendium, so those two entries remain explicit notes rather than guessed ids.
- Unified Magical Theory's free 1st-level feat and spell remain manual.

## Sprint 27 implementation status (2026-11-26)

Later domain feats are implemented:

- Domain Spirit offers the initial domain spell for a domain tied to the character's domain spirit; the spirit bond and which domains are legal remain table decisions.
- Advanced Domain Spirit offers the advanced spell for the domain chosen with Domain Spirit.
- Domain Focus is documented as a complete focus-pool refill on Refocus; Refocus itself remains a table action.
- Both feats work through the generic grant-choice framework, so they are available to any class that takes the Rivethun Emissary archetype.

## Sprint 28 implementation status (2026-11-26)

Structured ritual data is implemented:

- The compendium ingest now writes `ritualData.json` with each ritual's primary check, secondary-caster count, and secondary checks from the PF2e source.
- The server merges that data into spell context; the sheet uses it before falling back to prose detection.
- Ritual detail cards show the printed primary check and the secondary casters/checks, and the primary-check picker keeps every printed skill option.
- Rolling a ritual uses the character's override first, then the first printed skill the character actually has.
- 168 of 174 rituals had structured data in Sprint 28; Sprint 31 filled the six newer rituals in rank subfolders, so all 174 now have structured checks. Costs and outcomes remain prose.

## Sprint 29 implementation status (2026-11-26)

Spellbook budget accounting is implemented:

- Wizard, magus, witch, and necromancer track their free starting contents (10/8/10/8 cantrips and five ranked spells) plus two free ranked spells per level.
- The builder's starting-contents card shows free picks against the budget, paid Learn a Spell additions, and granted extras.
- Validation warns when free picks exceed the starting or level-up budget; paid additions do not count.
- Learn a Spell now marks newly added spells in `spells.learned`, so later budget checks exclude them.
- Curriculum, patron, studious, and other class-granted spells are excluded from the free count.
- The shared `known` list still stores both a book caster's book and a spontaneous caster's repertoire; a dedicated `spellbook` field remains a future migration.

## Sprint 30 implementation status (2026-11-26)

Staff special effects are visible at the table:

- Staves expose an **Effects** action that shows the non-spell prose from the item's description before its Activate block.
- The modal calls out that bonuses and triggered effects remain manual and links to the full item page.
- Staff spell lists, charges, charge spending, and spell-slot casting remain tracked as before.

## Sprint 31 implementation status (2026-11-27)

Ritual coverage is complete:

- The six rituals stored in rank subfolders now have structured primary and secondary checks.
- All 174 ritual entries resolve to structured data with no missing primary checks.
- The data test now requires every ritual in the compendium to have a structured entry.

## Rules baseline

### Core spellcasting

- **Prepared casters** choose spells during daily preparations. Each prepared spell is tied to a slot of a specific rank and is expended after one casting. Preparing the same spell twice is how you cast it twice. Cantrips are the exception: a prepared caster prepares a limited number of cantrips each day, and those cantrips are then cast at will. A cantrip cannot occupy a spell slot.
- **Spontaneous casters** refresh their spell slots during daily preparations but do not change their repertoire. They can cast any spell in their repertoire using a slot of the spell's rank. To heighten a spell, they must know it at the higher rank or use a signature spell. They can also spend a higher-rank slot to cast a lower-rank spell without heightening it.
- **Heightening** raises the spell's effective rank to the slot used or the rank at which it was prepared. Specific heightened entries only apply at the listed ranks or intervals.
- **Cantrips** are automatically heightened to half the caster's level, rounded up. A typical caster's cantrips are therefore the same rank as their highest spell slot.
- **Focus spells** are gained from class features and feats, not chosen from a tradition list. Casting one costs 1 Focus Point. Focus spells are automatically heightened to half the caster's level, rounded up. The focus pool maximum is the number of focus spells known, capped at 3. Only spells that actually cost Focus Points count; a bard's composition cantrips and a summoner's link cantrips do not. Focus Points refill during daily preparations and can be regained with Refocus.
- **Focus spells from non-spellcasters** use the proficiency, spell attack modifier, spell DC, and tradition granted by the ability that gave the focus spell. They do not make the character a spellcaster for feat prerequisites.
- **Innate spells** are refreshed during daily preparations and have their own frequency. Innate cantrips are at will and automatically heightened. Non-cantrip innate spells cannot normally be heightened. Innate spells use their own spell attack modifier and spell DC: trained, increasing to expert at 12th level, usually using Charisma.
- **Daily preparations** happen after 8 hours of rest and take about an hour. They refresh spell slots, Focus Points, per-day abilities, and magic item uses. Prepared casters choose their spells; characters equip gear and invest up to 10 worn magic items.

### Class-specific expectations

| Class | Casting model | Key spell resources |
| --- | --- | --- |
| Wizard | Full prepared arcane | Spellbook; 10 starting cantrips; prepares 5 cantrips plus 1 curriculum cantrip; extra curriculum spell slot at each rank; Drain Bonded Item |
| Cleric | Full prepared divine | Divine font (heal or harm) at the highest rank; deity spells added to the divine list; doctrine proficiencies; Battle Creed variant |
| Druid | Full prepared primal | Druid order focus spell; 5 prepared cantrips |
| Witch | Full prepared, patron tradition | Familiar holds the spell list; patron spells; hex focus spells |
| Animist | Full prepared animist slots plus spontaneous apparition slots | Apparitions grant a separate repertoire and spontaneous slots; the two pools are not interchangeable |
| Magus | Bounded prepared arcane | Spellbook; 8 starting cantrips; prepares 5 cantrips; conflux focus spells; studious spell slots from 7th level |
| Necromancer | Bounded prepared occult | Dirge spell list; grave focus spells; focus pool 2 |
| Bard | Full spontaneous occult | Repertoire; muse grants a repertoire spell; composition cantrips; signature spells |
| Sorcerer | Full spontaneous, bloodline tradition | Repertoire; bloodline cantrip, gifts at every rank, initial focus spell, and advanced/greater bloodline focus spells; signature spells |
| Oracle | Full spontaneous divine | Repertoire; mystery granted spells and initial/advanced/greater revelation focus spells; curse; signature spells |
| Psychic | Bounded spontaneous occult | 3 regular cantrips plus 3 psi cantrips; amps spend Focus Points; focus pool 2, increasing to 3 with Clarity of Focus; signature spells; 10th-rank capstone |
| Summoner | Bounded spontaneous, eidolon tradition | Repertoire; link spell (focus) and link cantrip (no Focus Point cost); signature spells |
| Champion | Focus only, divine | Devotion spells use the focus pool; no spell slots |
| Monk, Ranger, and other focus classes | Focus only | Ki, warden, and similar focus spells use the class that granted them for proficiency and tradition |

## Current implementation map

- `src/shared/types.ts` - `CharacterDraft["spells"]` and `DerivedCharacter` spell fields.
- `src/shared/rules.ts` - caster progression, slot tables, prepared entries, divine font, curriculum validation, focus pool, spell attack/DC, repertoire limits.
- `src/shared/spellcasting.ts` - cast options, resource spending, heightening, action variants.
- `src/shared/rest.ts` - long rest and daily reset rules.
- `src/shared/innate.ts` - innate uses.
- `src/shared/sustain.ts` - sustained spell helpers.
- `src/shared/ritual.ts` - ritual primary-check hint.
- `src/shared/classGrants.ts` and `classGrantChoices.ts` - class-granted spells and focus spells.
- `src/client/components/builder/steps/SpellsStep.tsx` - builder spellbook/repertoire and preparation UI.
- `src/client/components/sheet/CharacterSheetView.tsx` - sheet slots and Cast action.
- `src/server/routes/campaigns.ts` - party long rest.
- `tests/dailyPreparations.test.ts`, `tests/prepared.test.ts`, `tests/spellcasting.test.ts` - current coverage.

## Support matrix

Legend: Yes = modeled and usable; Partial = some support with known gaps; No = not modeled.

| Area | Status | Notes |
| --- | --- | --- |
| Full-caster slot tables | Yes | Wizard, cleric, druid, bard, witch, and animist use the full-caster table; sorcerer and oracle use the spontaneous table |
| Spontaneous full-caster slots | Yes | Sorcerer and oracle use the correct table |
| Bounded-caster slots | Yes | Magus, summoner, psychic, and necromancer; psychic/necromancer get the 10th-rank capstone |
| Prepared copies by rank | Yes | Duplicates, upcasting, and rank-aware validation |
| Divine font | Yes | Rank, slot count, dual-font choice, separate usage |
| Wizard curriculum | Partial | Extra slot and rank-aware validation; all schools grant rank-0 through rank-9 curriculum, including Runelord sins and Rooted Wisdom branches; Unified Magical Theory's free feat/spell remains manual |
| Prepared cantrips | Yes | Daily prepared list, class caps, and the wizard curriculum extra |
| Spell source presentation | Partial | Class-specific spellbook/familiar/dirge/spell-list/repertoire labels and starting-contents guidance; the full spellbook/known data split remains open |
| Learn a Spell | Partial | Cost by rank/rarity, rank DC, gold deduction, known-list addition, and starting-contents guidance; the check and strict starting budget remain manual |
| Spontaneous repertoire limits | Yes | Bard, oracle, sorcerer, summoner, and psychic; rank copies count against each learned rank |
| Spontaneous heightening by learned rank | Yes | Known ranks are tracked; signature spells heighten upward and non-signature spells can downcast from higher slots |
| Signature spells | Yes | One per rank, level 3 gate, validation |
| Focus points and focus casting | Partial | Separate focus spell DC/attack works; psi amps now spend focus, while some feat-granted pools remain manual |
| Focus spells from feats/archetypes | Partial | Advanced Bloodline, Greater Bloodline, Advanced Revelation, and Greater Revelation are automatic; other archetype focus spells remain manual |
| Innate spells and uses | Partial | Uses and casting work; innate attack/DC is derived separately |
| Cleric deity spells | Yes | Deity spells are offered to prepare; higher-rank deity spells appear as level permits |
| Cleric domains | Partial | Domain Initiate, Expanded Domain Initiate, repeated Advanced Domain picks, and Domain Spirit/Advanced Domain Spirit grant focus spells; Domain Focus is documented; other later domain feats remain manual |
| Oracle mystery domains | Partial | Mystery granted spells, Domain Acumen/Fluency, and Advanced/Greater Revelation are automatic; the curse, mystery skill, and deity access remain manual |
| Psychic conscious minds | Partial | 1st-rank spell, psi cantrips, and amp casting are granted; higher-level unique cantrips remain manual |
| Necromancer grave spells | Partial | Necrotic Bomb and grim fascination spells granted; thralls and effects manual |
| Summoner link spells | Yes | Evolution Surge and Boost Eidolon granted; eidolon actions remain manual |
| Magus studious slots | Yes | Two special slots at 7th, rank 3 at 11th, rank 4 at 13th; hybrid-study list and preparation UI |
| Animist prepared/spontaneous split | Yes | Prepared animist slots and spontaneous apparition slots, attunement, repertoire, and vessel focus spells |
| Rituals | Partial | Structured primary and secondary checks for all 174 rituals, with manual override; costs and outcomes remain prose |
| Sustained spells | Yes | Casting starts sustain, the sheet and table list active spells, Sustain/End actions are available, and Restore clears them |
| Spellbook capacity and learning | Partial | Starting contents and the two-free-spells-per-level budget are tracked; paid Learn a Spell additions are marked and excluded; the shared `known` list still serves as both book and repertoire |
| Item spellcasting | Partial | Scrolls cast from the character's spell list and consume on use; generic Magic Wands cast at their rank once per day; fixed-spell specific wands cast directly; flexible wands cast a chosen spell at their listed rank; staves track parsed spell lists, charge pools, spell-slot casting, and show their special-effect prose; bonuses and triggered effects remain manual |
| Multiclass spellcasting archetypes | Partial | Spellcasting dedications grant cantrips, ranked spells, Basic/Expert/Master slot pools, variable traditions, and higher-slot heightening; other archetype details remain manual |

## Findings

### F1. The daily preparation reminder is not surfaced (P0)

Status: fixed in Sprint 1.

Evidence:

- `CharacterDraft["spells"].preparationsPending` exists in `src/shared/types.ts`.
- `applyLongRest` sets it for prepared casters in `src/shared/rest.ts`.
- The campaign long-rest route passes `preparedCaster: isPreparedCasterClass(...)` in `src/server/routes/campaigns.ts`.
- No client component reads `preparationsPending`. A repository search finds it only in the builder's class reset, normalization, tests, and the campaign simulation.

Impact: A wizard, cleric, druid, witch, magus, necromancer, or animist can long-rest and receive no prompt to prepare spells. The flag is dead state.

Fix: Restore a daily preparations workflow in the sheet and builder. The old `DailyPreparationsModal` from commit `773588f` is a good starting point; it was removed in `f4d23aa`. It already supports prepared copies, rank limits, divine font, and clearing the pending flag. It needs prepared cantrips added and integration with the current sheet's save queue.

### F2. There is no per-character long rest (P0)

Status: fixed in Sprint 1.

Evidence:

- The only rest entry point is `POST /api/campaigns/:id/long-rest`, and it is GM-only (`src/server/routes/campaigns.ts`).
- `CharacterSheetView` has HP, condition, slot, and focus controls, but no Rest or Daily preparations action.
- Characters outside a campaign have no rest flow at all.

Impact: A player cannot run their own daily preparations, and a solo/offline character cannot reset slots or focus without manually editing pips. This is the main reason the reminder gap is visible in play.

Fix: Add a Long rest action to the sheet for editors. Preview the existing `applyLongRest` summary (HP, slots, font, focus, conditions), then persist. For prepared casters, open the daily preparations modal immediately after rest, or show a prominent pending banner.

### F3. Prepared cantrips are not modeled (P0/P1)

Status: fixed in Sprint 1.

Evidence:

- `CharacterDraft["spells"]` has one `cantrips` array. There is no prepared-cantrip list.
- The builder treats every selected cantrip as available (`SpellsStep.tsx`).
- The sheet's `Cantrips` group uses `draft.spells.cantrips` directly (`CharacterSheetView.tsx`).
- `spellCastOptions` always returns a cantrip option at `cantripCastRank(level)` (`src/shared/spellcasting.ts`).

Rules: A prepared caster prepares a specific number of cantrips each day; those are then cast at will. A wizard prepares five cantrips plus one curriculum cantrip. A magus prepares five. Cleric, druid, witch, and necromancer prepare five; animist prepares its own number.

Impact: A wizard with 10 spellbook cantrips can cast all 10. The "prepare spells" reminder is incomplete because the most-used spells at low levels are cantrips.

Fix: Add `spells.preparedCantrips: string[]`. Keep `spells.cantrips` as the known list/spellbook/repertoire. For prepared casters, only `preparedCantrips` are castable; for spontaneous casters, `cantrips` remain the repertoire. Add a daily-preparation cantrip section with the correct class cap and the wizard's extra curriculum cantrip.

### F4. Cantrip caps conflate spellbook size and prepared count (P1)

Status: fixed in Sprint 1 for known vs. prepared caps and the magus spellbook.

Evidence: `CANTRIP_LIMITS` in `src/shared/rules.ts` uses:

- Wizard: 10
- Magus: 5
- Psychic: 3

Rules:

- Wizard: 10 spellbook cantrips, prepares 5 plus 1 curriculum cantrip.
- Magus: 8 spellbook cantrips, prepares 5.
- Psychic: 3 regular occult cantrips plus 3 psi cantrips.

Impact: The builder's `Add cantrip` button blocks a magus at 5 known cantrips even though the spellbook should hold 8. The wizard cap is correct for the spellbook but is then used as the castable limit. Psychic's psi cantrips are not represented at all.

Fix: Split `cantripKnownLimitFor(classData)` from `cantripPreparedLimitFor(classData, level)`. Use the known limit for the spellbook/repertoire picker and the prepared limit for the daily list. Handle wizard curriculum and psychic psi cantrips separately.

### F5. Spellbook, known list, and repertoire are one data field (P1)

Status: partly addressed in Sprint 1 and Sprint 17. Prepared cantrips are separate, and the builder now uses class-specific spellbook/familiar/dirge/spell-list labels. The data model still shares `spells.known` for the spellbook and repertoire, and Learn a Spell accounting remains open.

Evidence:

- `draft.spells.known` is used for both a prepared caster's spellbook and a spontaneous caster's repertoire.
- The builder switches the label between "spellbook" and "repertoire" but not the behavior (`SpellsStep.tsx`).
- Cleric, druid, and animist also see "spellbook" labels even though they prepare from a class spell list, not a book. (Fixed in Sprint 17.)
- There is no spellbook capacity check for wizard, magus, witch, or necromancer.

Impact: The data model cannot distinguish "in my book" from "I can prepare this today", and class-specific spellbook rules (starting contents, two spells per level, Learn a Spell, familiar) are not enforceable.

Fix: At minimum, introduce labels by class (`spellbook`, `familiar`, `dirge`, `spell list`, `repertoire`) and add prepared cantrips. A full split into `spellbook` vs `prepared` can follow as a migration, but the UI should stop claiming every prepared class has a spellbook.

### F6. Several class resources are missing or hard-coded (P1)

Status: partly fixed in Sprint 2, Sprint 4, Sprint 5, Sprint 7, Sprint 13, and Sprint 26. Psychic, necromancer, summoner, cleric deity spells and domains, magus studious slots, the animist prepared/spontaneous split, psychic psi amps, and the higher-rank bloodline, mystery, and curriculum lists are now granted or tracked.

- **Psychic**: repertoire limits, conscious-mind 1st-rank spells, psi cantrips, and amp casting are granted; amps spend focus and show their summaries in the builder and sheet. Higher-level unique psi cantrips remain manual.
- **Necromancer**: Necrotic Bomb, grim fascination grave spells, and the focus pool are granted. Thralls and full grave-spell effects remain manual.
- **Magus**: studious slots are tracked at 7th/11th/13th level with the hybrid-study spell list. Spellstrike, Arcane Cascade, and conflux spell recharge remain manual.
- **Summoner**: `evolution surge` and `boost eidolon` are granted; the link cantrip does not count toward the focus pool. Eidolon actions remain manual.
- **Animist**: prepared animist slots and spontaneous apparition slots are separate. Attuned apparitions supply a curated repertoire, the primary apparition grants its vessel focus spell, and apparition slots reset during daily preparations. Invocations and wandering-feat retraining remain manual.
- **Wizard**: rank-0 through rank-9 curriculum spells are granted for each school, including Runelord sins and Rooted Wisdom branches, so the extra slot is restricted at every rank. Unified Magical Theory's free feat and spell remain manual.
- **Sorcerer/oracle**: bloodline gifts are granted at every rank, including the Elemental, Genie, and Draconic variable choices; advanced and greater bloodline spells are granted by their feats. Oracle mysteries grant their listed spells, and Advanced/Greater Revelation are granted by their feats. Oracle curse effects and mystery skills remain manual.
- **Cleric**: deity spells are resolved and offered through the normal preparation workflow. Domain Initiate, Expanded Domain Initiate, and Advanced Domain grant their domain focus spells; repeated Advanced Domain picks are supported. Domain Spirit and Advanced Domain Spirit grant a spirit-linked initial and advanced domain spell, and Domain Focus is documented. Other later domain feats remain manual.

Impact: These classes are usable only with manual bookkeeping for their remaining niche resources.

Fix: Treat class completeness as a separate sprint. Start with grants and caps that can be curated from existing class-choice descriptions; avoid a generic parser until the curated path is stable.

### F7. Focus and innate spell attack/DC are wrong (P1)

Status: fixed in Sprint 2. Focus-only classes use a separate focus profile, and innate spells use their own Charisma-based trained/expert profile.

Evidence:

- `computeCharacter` derives one `spellDc` and one `spellAttack` from the class caster profile (`src/shared/rules.ts`).
- For a non-caster, both are `null`, even if the character has focus spells or innate spells.
- The sheet always uses the global spell attack for an attack roll (`CharacterSheetView.tsx`).
- The global spell DC uses the class spellcasting ability and proficiency, including for innate spells.

Rules: Innate spells use their own attack/DC (trained, expert at 12, usually Charisma). Focus spells from a non-spellcaster use the source's proficiency and tradition. A wizard's innate spell does not use the wizard's Intelligence and master proficiency.

Impact: A monk with ki spells has no focus spell DC or attack. A wizard with an innate spell rolls the wrong attack modifier and shows the wrong DC. A champion is treated as having a spellcasting class feature for prerequisites even though it only has focus spells.

Fix: Add separate derived profiles for class, focus, and innate casting. At minimum expose `focusSpellDc`, `focusSpellAttack`, `innateSpellDc`, and `innateSpellAttack`, and use the row's source in the sheet. Change the "spellcasting class feature" prerequisite check to require spell slots, not focus progression.

### F8. Spontaneous heightening is incomplete (P1)

Status: fixed in Sprint 6 for learned-rank copies and Sprint 9 for higher-slot downcasting. Signature heightening, known ranks, and non-heightened downcasts are now distinct.

Evidence:

- `spellCastOptions` offers a spontaneous spell only at its printed rank unless it is a signature spell (`src/shared/spellcasting.ts`).
- The data model stores `spells.known` as one flat list of spell IDs.

Rules: A spontaneous caster can learn the same spell at multiple ranks. They can cast it at any rank they know it. A signature spell can be freely heightened. They can also use a higher-rank slot to cast a lower-rank spell without heightening it.

Impact: A sorcerer who learns Fireball at 3rd and 5th rank cannot represent both copies. The only workaround is to mark Fireball as a signature spell, which is a different resource and is limited to one spell per rank.

Fix: Add rank-aware known spells, analogous to `preparedByRank`, or a `knownByRank` map. Use it for repertoire limits and cast options. Keep the flat `known` list as a compatibility mirror during migration. Add the "cast at known rank using a higher slot" option later if the table needs it.

### F9. Slot pips and prepared usage can desynchronize (P1)

Status: fixed in Sprint 1 with the Restore action.

Evidence:

- The sheet's slot pips update only `spells.slotsUsed`.
- Casting increments both `spells.slotsUsed` and `spells.preparedUsed` (and font usage).
- Restoring a pip on the sheet does not restore `preparedUsed`.

Impact: After casting the only prepared copy of a spell, clicking the slot pip back to unused leaves `preparedUsed` at 1. The spell still cannot be cast because the prepared copy is exhausted. The user sees a free slot but no available spell.

Fix: Add an explicit restore/undo action per cast, or store a small daily cast ledger and derive the counters. A ledger is the durable fix; a per-row Restore action is a reasonable sprint-sized fix.

### F10. The sustain subsystem is unused (P2)

Status: fixed in Sprint 8. The sheet starts, lists, and ends sustained spells, and the table now shows a turn reminder with a one-click Sustain acknowledgement and per-spell End.

`src/shared/sustain.ts` implements `beginSustainedSpell`, `endSustainedSpell`, `sustainedSpellFor`, and a 12-spell UI safety cap. Casting a sustain spell now records it, Restore clears it, and the Spells tab lists active sustained spells with an End action.

Impact: The sheet now starts and ends sustained spells, but the table still has no automatic turn prompt to remind the player to spend the Sustain action.

Fix: The table reminder now appears below the initiative bar for an active character with sustained spells, with Sustain and End controls. Further automation can add action-pip spending once the table tracks actions.

### F11. Rituals are a stub (P2)

Status: partly fixed in Sprint 3, Sprint 16, and Sprint 28. Ritual rows expose a Details card and a Primary check action. The card shows the structured primary check and secondary casters when the compendium provides them, falls back to prose detection, and lets the player override the skill.

`src/shared/ritual.ts` reads structured `ritualData` first and falls back to the printed prose. The compendium now provides structured checks for all 174 rituals. Costs and outcomes remain prose.

Impact: Any ritual can be given a usable primary check at the table, and most now use structured source data.

Fix: Structured primary and secondary checks are ingested for the rituals the source provides; the remaining prose fallback stays for newer rituals and unusual checks. Keep the detail card as the table-facing reference.

### F12. Item spellcasting is not modeled (P2)

Status: partly fixed in Sprint 10, Sprint 11, Sprint 12, Sprint 14, Sprint 15, Sprint 18, and Sprint 21. Scrolls are castable from the sheet and consumed; generic Magic Wands are castable at their rank once per day; fixed-spell specific wands cast directly; flexible wands use the wand picker; staves track parsed spell lists, charge pools, and spell-slot casting. Fine-grained staff special effects remain manual.

Impact: Scrolls, wands, and most staves are spellcasting resources at the table; other magic items remain inventory entries.

Fix: Scroll casting opens the spell picker at the scroll's rank, filters by the character's tradition, and consumes the scroll on confirmation. Generic wand casting uses the same picker, records a daily use, and resets it on a long rest. Specific wands with a readable fixed spell cast directly, flexible wands open the picker at their listed rank, and staves expose their parsed spell list with charge and slot casting. The remaining item work is fine-grained staff special effects.

### F13. Multiclass spellcasting archetypes are not modeled (P2)

Status: partly fixed in Sprint 22, Sprint 23, Sprint 24, and Sprint 25. Spellcasting dedications grant a separate dedication-cantrip list, ranked dedication spells, Basic/Expert/Master slot pools with their own spell DC/attack bonus, and higher-slot heightening. Variable traditions are chosen in the builder.

`casterInfo` reads only `context.classData`. Spellcasting dedication feats now add dedication cantrips, ranked spells, and delayed slots.

Impact: A fighter with a wizard dedication can track and cast the archetype's cantrips and ranked spells with the correct DC and slots, including casting them from higher-rank dedication slots.

Fix: Variable traditions are now chosen in the builder, and dedication spells can use higher-rank dedication slots. Do not fake archetype casting by changing the primary class's progression.

### F14. Spellbook capacity and spell learning are not enforced (P2)

Status: partly fixed in Sprint 20, Sprint 25, and Sprint 29. The sheet's Learn a Spell picker computes the rank/rarity cost and DC, deducts gold, adds the spell to the known list, and marks it as a paid addition. Spellbook/familiar/dirge classes see starting-contents guidance, current free-pick counts, the two-free-spells-per-level budget, paid additions, and granted extras. Validation warns when free picks exceed the budget. The shared `known` field still serves as both a book caster's book and a spontaneous caster's repertoire.

## Sprint plan

### Sprint 1 - Daily spellcasting loop (recommended next)

Goal: A prepared caster can rest, be reminded to prepare, choose ranked spells and cantrips, and cast from the correct resources. The loop works on the sheet and in the builder for every prepared class.

Estimated effort: 4-6 focused development days.

#### Task 1. Restore long rest and daily preparations in the sheet

- Restore `src/client/components/DailyPreparationsModal.tsx` from commit `773588f` and adapt it to the current sheet's props and save queue.
- Add a Long rest action in `CharacterSheetView` for users with `canEdit`.
- Preview the `applyLongRest` summary, including HP, slots restored, font restored, focus, conditions, and pending preparations.
- Persist the rest result and immediately open the daily preparations modal for prepared casters.
- Keep the campaign GM long rest as the party-wide path; add a toast that prepared casters still need to choose spells.
- Update the builder's "Reset slots" wording so it says spell uses reset on a long rest or daily preparations, not "between sessions".

Acceptance:

- A wizard can rest from the sheet and sees a "Preparations pending" banner.
- Applying preparations clears `preparationsPending`.
- A non-prepared caster does not see the preparation prompt.
- A read-only viewer cannot rest.

#### Task 2. Make pending preparations visible everywhere

- Add an optional `spellPreparationsPending` to `CharacterSummary` and populate it from `draft.spells.preparationsPending`.
- Show a badge in the party rail and any campaign character list.
- Show a banner in `SpellsStep` and on the sheet's Spells tab with a direct action.
- Add a clear "Prepare today's spells" button for prepared casters; use the pending state to make it primary.

Acceptance:

- The pending state survives a reload and appears in the party rail.
- A GM long rest produces a visible reminder for every prepared character.
- The reminder disappears after preparations are applied.

#### Task 3. Add prepared cantrips

- Add `spells.preparedCantrips: string[]` to the draft, defaults, normalization, class-change reset, and importer if needed.
- Add helpers in `src/shared/rules.ts`: known cantrip limit, prepared cantrip limit, legality, add/remove, and a legacy fallback.
- Builder: show known cantrips and a "Prepared today" selection. Prepared casters can only cast prepared cantrips; spontaneous casters keep the current repertoire behavior.
- Daily preparations modal: add a cantrip section with the correct class cap. Wizard gets five plus one curriculum cantrip; magus gets five; cleric, druid, witch, and necromancer get five; animist uses its own cap.
- Sheet: label the prepared-caster group "Prepared cantrips" and hide unprepared spellbook cantrips from the cast list, or show them with no Cast action.
- Validation: warn when a prepared caster has no prepared cantrips, and reject duplicate or over-cap selections.

Acceptance:

- A wizard with 10 spellbook cantrips can prepare 5 plus 1 curriculum cantrip and only cast those.
- A magus can hold 8 spellbook cantrips and prepare 5.
- A spontaneous caster's cantrip behavior is unchanged.
- Existing drafts still load; legacy cantrip lists default to the known list until the first daily preparation.

#### Task 4. Fix cantrip caps and labels

- Replace the single `CANTRIP_LIMITS` use with separate known and prepared limits.
- Wizard known limit 10; magus known limit 8; psychic known limit 3 regular cantrips, with psi cantrips as a separate future list.
- Use class-specific labels: spellbook, familiar, dirge, spell list, repertoire.
- Update the picker and builder validation to use the known limit, not the prepared limit.

Acceptance:

- The "Add cantrip" button no longer blocks a magus at 5.
- The builder shows both "in spellbook" and "prepared today" counts for prepared classes.
- The label matches the class.

#### Task 5. Reconcile cast usage with prepared copies

- Add a Restore/Undo action for a prepared spell cast on the sheet, or add a small daily cast ledger if the implementation stays clean.
- Restoring a cast must decrement the correct rank's `slotsUsed` and the spell's `preparedUsed`; restore `divineFontUsed` and `fontUsed` for font casts.
- Ensure the manual slot pips and the per-spell remaining count agree after cast, restore, and reload.
- Add a unit test for cast, restore, and cast again.

Acceptance:

- After casting the only prepared copy, restoring the slot makes the spell castable again.
- Font casts restore both the font pool and the font copy count.
- A reload preserves the reconciled state.

#### Task 6. Verification and documentation

- Unit tests:
  - Pending flag set/clear behavior.
  - Prepared cantrip caps and wizard curriculum cantrip.
  - Cantrip casting only from prepared list.
  - Slot/prepared restore.
- E2E:
  - Wizard long rest from the sheet, pending banner, prepare ranked spells and cantrips, cast.
  - Cleric long rest, font choice, prepare font and ordinary spells.
  - Spontaneous caster is not prompted.
- Campaign simulation:
  - Party long rest sets pending only for prepared casters.
  - Applying preparations clears it.
- Docs: update `README.md` and `docs/ROADMAP.md` so they no longer claim a rest flow that is absent, and describe the new daily loop.

Gate: `npm run check`, `npm run smoke`, `npm run e2e`, and `npm run simulate:campaign`.

### Sprint 2 - Class-specific casting correctness

Goal: Each spellcasting class's signature resource is either automated or explicitly labeled manual.

Tasks:

1. **Focus and innate casting profiles**
   - Add separate spell attack/DC for class, focus, and innate sources.
   - Use the correct source in sheet rows and roll buttons.
   - Fix the "spellcasting class feature" prerequisite to require spell slots, not focus progression.
   - Add a focus pool increase for Clarity of Focus.

2. **Psychic**
   - Add psychic to bounded spontaneous repertoire limits.
   - Curate conscious-mind grants: the 1st-rank spell, two common psi cantrips, and the unique psi cantrip.
   - Model psi cantrips separately from regular cantrips.
   - Add amp metadata and an Amp action that spends 1 Focus Point. (Implemented in Sprint 7.)
   - Add Clarity of Focus at 5th level.

3. **Necromancer and Magus**
   - Add Necrotic Bomb and grim fascination grave spells.
   - Add magus studious spell slots and their specific spell options.
   - Correct the magus spellbook cantrip cap.

4. **Summoner**
   - Add `evolution surge` as a focus spell and `boost eidolon` as a link cantrip that does not count toward the focus pool.
   - Ensure the eidolon choice drives the tradition and any granted spells.

5. **Cleric, Wizard, Sorcerer, Oracle**
   - Resolve `deity.spells` UUIDs and add deity spells to the cleric's available list.
   - Curate higher-rank wizard curriculum spells from the arcane-school descriptions. (Implemented in Sprint 26, including Runelord sins and Rooted Wisdom branches.)
   - Curate higher-rank bloodline and mystery gifts, or keep them explicit manual notes. (Implemented in Sprint 26, including advanced and greater focus spells.)

6. **Animist**
   - Separate prepared animist slots from spontaneous apparition slots.
   - Add apparition attunement and the apparition repertoire.
   - If the full split is too large, label the current combined tracker as manual and prevent it from implying that all slots are prepared.

7. **Spontaneous known-at-rank** (implemented in Sprint 6, with downcasting in Sprint 9)
   - Add `knownByRank` (or a rank-aware known list) and migrate the flat list.
   - Use it for repertoire limits, cast options, and signature validation.
   - A non-signature spontaneous spell can also use a higher-rank slot to cast at a lower known rank without heightening; the slot and effective rank are recorded separately. (Implemented in Sprint 9.)

### Sprint 3 - Table magic depth

Goal: Spells are usable at the table beyond the cast button.

Tasks:

1. **Sustain**
   - Add Start/End Sustain controls to relevant spell rows.
   - Show active sustained spells and a turn reminder to spend the Sustain action.
   - Clear sustained spells on rest (already done in `applyLongRest`).

2. **Rituals**
   - Add a ritual workflow that reads the primary check, rolls the chosen skill, and posts the result. (Implemented in Sprint 3 and Sprint 16.)
   - Keep cost, secondary casters, and consequences manual but visible in the detail card.

3. **Item spellcasting**
   - Cast from scrolls, wands, and staves with the correct charges and DC. (Scrolls implemented in Sprint 10; generic Magic Wands in Sprint 11; fixed-spell specific wands in Sprint 12; flexible wands in Sprint 14; staves in Sprint 15.)
   - Consume scrolls and track wand daily uses and staff charge pools; staves without readable lists and fine-grained staff special effects remain manual; respect daily preparations.

4. **Spellbook and learning**
   - Add starting spellbook contents and two-spells-per-level accounting.
   - Add a way to add a found scroll to the book.

5. **Multiclass spellcasting**
   - Add a secondary caster profile for spellcasting dedication feats.
   - Keep the primary class and dedication slots separate.

## Decisions to make before Sprint 1

1. **Prepared cantrip legacy behavior**: default old drafts to all known cantrips until the first daily preparation, or immediately require a legal prepared list? Recommendation: legacy fallback, then materialize on first apply.
2. **Cleric/druid spell access**: keep the current `known` shortlist as a practical filter, or add a full class-list picker for daily preparation? Recommendation: keep the shortlist for Sprint 1; revisit with the spellbook split.
3. **Cast ledger vs. per-row restore**: a ledger is more correct but larger. Recommendation: per-row restore in Sprint 1; ledger if the team wants undo history.
4. **Animist scope**: a true prepared/spontaneous split is a larger rules-engine task. Recommendation: Sprint 2, not Sprint 1.
5. **Archetype spellcasting**: confirm whether multiclass dedications are in scope for the next few sprints or stay manual.

## Rules references

- Prepared Spells: <https://2e.aonprd.com/Rules.aspx?ID=271>
- Spontaneous Spells: <https://2e.aonprd.com/Rules.aspx?ID=272>
- Heightened Spells: <https://2e.aonprd.com/Rules.aspx?ID=273>
- Heightened Spontaneous Spells: <https://2e.aonprd.com/Rules.aspx?ID=274>
- Cantrips: <https://2e.aonprd.com/Rules.aspx?ID=275>
- Focus Spells: <https://2e.aonprd.com/Rules.aspx?ID=276>
- Spellcasters with Focus Spells: <https://2e.aonprd.com/Rules.aspx?ID=277>
- Non-Spellcasters with Focus Spells: <https://2e.aonprd.com/Rules.aspx?ID=278>
- Innate Spells: <https://2e.aonprd.com/Rules.aspx?ID=279>
- Daily Preparations: <https://2e.aonprd.com/Rules.aspx?ID=536>
- Rest and Daily Preparations: <https://2e.aonprd.com/Rules.aspx?ID=2443>
- Wizard: <https://2e.aonprd.com/Classes.aspx?ID=39>
- Magus: <https://2e.aonprd.com/Classes.aspx?ID=17>
- Psychic: <https://2e.aonprd.com/Classes.aspx?ID=21>
- Sorcerer: <https://2e.aonprd.com/Classes.aspx?ID=62>
- Summoner: <https://2e.aonprd.com/Classes.aspx?ID=18>
