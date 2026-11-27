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
| Wizard higher-rank curriculum data | Partial | The engine supports rank-aware curriculum slots, but curated grants stop at rank 0/1. |
| Innate spell frequency | Open | Uses are inferred from spell prose; there is no granting-ability frequency field. |
| Commander tactics and Runesmith runes | Open | Need pickers and repertoire tracking. |
| Background prose-only grants | Open | Needs curated overrides for backgrounds whose choices exist only in prose. |

## Suggested next batches

1. **Data curation:** extend wizard curriculum grants by rank and add curated
   background grants. This is content work with focused rules tests.
2. **Commander and Runesmith:** add tactic/rune pickers, separate resources, and
   sheet tracking. Treat as a feature batch, not a data patch.
3. **Innate frequency:** add an explicit per-grant or per-spell frequency field
   and use it instead of prose inference.

Before starting a rules batch, check `git worktree list` and the open branches
so two sessions do not edit the same sheet or rules files concurrently.
