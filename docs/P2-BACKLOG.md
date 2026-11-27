# P2 backlog

This is the working list for the P2 items in `docs/AUDIT.md` and
`docs/RULES-AUDIT.md`. Keep it current when a P2 item ships or moves.

## Polish and maintainability

| Item | Status | Notes |
| --- | --- | --- |
| Action filters expose toggle state | Done | Filters use `aria-pressed`. |
| Sheet document title restores on close | Done | The sheet restores the previous title on unmount. |
| Item price errors use formatted currency | Done | Purchase errors use `formatCopper`. |
| Campaign audit details include new settings | Done | Update details include Free Archetype, ABP, and player gear grants. |
| Action reference list stops at 120 | Done | The list shows a count and a "show more" control. |
| Condition math product decision | Done | Documented as "manual tracking, automatic math" in `PLAN.md`. |
| Local scratch demo files | Local only | `scripts/_demo-*` is ignored and excluded from checks. Do not commit or delete another session's scratch files. |
| Production dependency audit in CI | Done | `npm run audit:prod` runs in the verify job. |

## Class and data completeness

| Item | Status | Notes |
| --- | --- | --- |
| Focus-only class spell DC/attack | Done | Focus and innate spells derive their own DC/attack. |
| Read-only compendium types | Done | Hazards, vehicles, familiars, boons/curses, traits, and afflictions are in the library. |
| Wizard higher-rank curriculum data | Done | The generated school data includes ranks 0-9 and is wired into class grants. |
| Innate spell frequency | Done | `spells.innateMax` stores an explicit daily maximum; the builder exposes 1-5/day and prose remains the fallback. |
| Commander tactics | Done | Folio and daily preparation limits, builder picker, sheet prepared-tactics list, and validation. Tactic tiers stay manual. |
| Runesmith runes | Done | 44 Impossible Magic runes with repertoire, etching, diacritic, and invocation tracking in the builder and sheet. Individual rune effects remain prose. |
| Background prose-only grants | Done | Runtime overrides in `src/shared/backgroundGrants.ts` fill the remaining structured skill and feat choices for 14 backgrounds. Deity-, rival-, campaign-, and past-life-dependent choices stay manual, as do category-wide picks such as Kaiju Stalker's Athletics feat. |

## Suggested next batches

All P2 items are closed. Continue with `docs/P3-BACKLOG.md` for post-P2 work.

Before starting a rules batch, check `git worktree list` and the open branches
so two sessions do not edit the same sheet or rules files concurrently.
