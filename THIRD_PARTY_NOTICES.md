# Third-party notices

## Foundry VTT PF2e system

Rules data in `data/compendium/` is primarily generated from:

- https://github.com/foundryvtt/pf2e
- Copyright the PF2e for Foundry VTT contributors
- Licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0

The generated compendium preserves `source`, `license`, and `remaster` metadata from the upstream items.

## Archives of Nethys

The trait glossary (`traits.json`) and afflictions (`afflictions.json`, covering
diseases, curses, and poisons) are generated from the Archives of Nethys index:

- https://2e.aonprd.com
- Pathfinder Second Edition rules content, published by Paizo under the ORC License.
- No Paizo artwork is copied; only rules text and structured statblock fields are stored.

## Pathfinder Second Edition

This product is an independent, unofficial tool compatible with Pathfinder Second Edition. It is not affiliated with, endorsed by, or sponsored by Paizo Inc.

- Pathfinder and all related marks are trademarks of Paizo Inc.
- Pathfinder Second Edition rules content is published under the ORC License. See Paizo's ORC License page for the license text and compatibility statement.
- No Paizo artwork is included. User-uploaded maps, portraits, and token art remain the responsibility of the uploader and their table.

## Fonts

- **Cinzel** — SIL Open Font License 1.1, via `@fontsource/cinzel`.
- **Source Sans 3** — SIL Open Font License 1.1, via `@fontsource/source-sans-3`.

## Bundled music library

The optional campaign music library in `public/audio-library/` contains tracks released under
Creative Commons Zero 1.0 (CC0). CC0 does not require attribution; the credits below are kept so
tables can find the original works. Files were downloaded from OpenGameArt on 2026-11-18.

- **Battle Theme A** — cynicmusic — CC0 1.0 — https://opengameart.org/content/battle-theme-a
- **JRPG Epic Rock Battle** — HydroGene — CC0 1.0 — https://opengameart.org/content/jrpg-epic-rock-battle-theme-1
- **Fighting Is Not an Option** — Cleyton Kauffman — CC0 1.0 — https://opengameart.org/content/rpg-battle-theme-ii
- **A New Town** — cynicmusic — CC0 1.0 — https://opengameart.org/content/a-new-town-rpg-theme
- **Magic Town** — controllerhead — CC0 1.0 — https://opengameart.org/content/magic-town
- **Mystical Town** — symphony — CC0 1.0 — https://opengameart.org/content/mystical-rpg-maker-town-theme
- **Tavern** — yd — CC0 1.0 — https://opengameart.org/content/tavern-0
- **The Old Tower Inn** — RandomMind — CC0 1.0 — https://opengameart.org/content/medieval-the-old-tower-inn
- **Heavenly Loop** — isaiah658 — CC0 1.0 — https://opengameart.org/content/heavenly-loop
- **Ambient Relaxing Loop** — isaiah658 — CC0 1.0 — https://opengameart.org/content/ambient-relaxing-loop
- **Town Theme** — cynicmusic — CC0 1.0 — https://opengameart.org/content/town-theme-rpg
- **Dark Cavern** — Paul Wortmann — CC0 1.0 — https://opengameart.org/content/dark-cavern-ambient
- **Dungeon Deep** — Eldritch Grim — CC0 1.0 — https://opengameart.org/content/dungeon-deep-0
- **Whispers in the Fog** — Ruhinre — CC0 1.0 — https://opengameart.org/content/whispers-in-the-fog

The DM/table can remove library tracks from a campaign without deleting the bundled file. Uploaded
audio remains the responsibility of the uploader.

## Bundled map, portrait, and token art

The built-in art libraries use openly licensed work. Full credits and license links live beside
the files:

- `public/maps/ATTRIBUTION.md` — Dyson Logos, Free Fantasy Maps, and mbround18 VTT maps.
- `public/portraits/ATTRIBUTION.md` — built-in portrait art.
- `public/tokens/creature/ATTRIBUTION.md` — creature token icons.

Check each file before redistributing the bundled art. User-uploaded art remains the
responsibility of the uploader and their table.

## Software

Runehall uses open-source npm packages including React, Vite, Fastify, Socket.IO, Zustand, React Router, Lucide, sanitize-html, and TypeScript. Their licenses remain with their respective authors; see `node_modules/<package>/LICENSE` after installation.
