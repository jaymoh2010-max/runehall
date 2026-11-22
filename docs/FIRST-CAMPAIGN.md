# First campaign handoff guide

This is the short checklist for the friend hosting Runehall and for the GM running the first session.

## Host

1. Clone the public repository on a small Linux server with Docker and Docker Compose:

   ```bash
   git clone https://github.com/jaymoh2010-max/runehall.git
   cd runehall
   ```

2. Create the environment file and edit it:

   ```bash
   cp .env.example .env
   ```

   For an internet-facing server:

   - `BOOTSTRAP_TOKEN=<long random one-time setup token>`
   - `COOKIE_SECURE=0` temporarily for localhost/SSH-tunnel setup
   - `REGISTRATION_MODE=invite` (or `closed` once everyone has an account)
   - `TRUSTED_ORIGINS=https://your-domain.example`
   - Keep `RUNEHALL_BIND=127.0.0.1` so port 3001 is not public.

3. Prepare the persistent folders and start the stack:

   ```bash
   mkdir -p data/uploads backups
   sudo chown -R 1000:1000 data backups
   docker compose up -d --build
   curl http://127.0.0.1:3001/api/health
   ```

4. Create the **first account from the server itself or through an SSH tunnel**, using the
   `BOOTSTRAP_TOKEN`. That account becomes the instance administrator. Create it **before** exposing
   the site through the proxy, because the first account is always allowed.

5. Set `COOKIE_SECURE=1`, remove `BOOTSTRAP_TOKEN` from `.env`, and recreate the container. Then put
   Caddy or Nginx in front for HTTPS. Do **not** publish port 3001 directly to the internet.
   See [DEPLOY.md](DEPLOY.md) for ready-to-copy proxy examples.

6. Use **Admin → Hall controls** to create single-use registration invite codes for your friends,
   then take a backup before the first session:

   ```bash
   docker compose exec runehall npm run backup -- --keep 14
   ```

7. Schedule a daily backup on the host (cron, systemd timer, or Task Scheduler) and copy archives
   off the server. A backup that only lives on the same disk is not a backup.

## GM: session zero

1. Sign in and create a campaign from **My Campaigns**.
2. Choose the ruleset:
   - **Core Remastered** for a new group using Player Core / Player Core 2.
   - **Expanded Remastered** to include the wider local compendium.
   - **Legacy + Remastered** only if the table intentionally wants older content.
3. Decide **Milestone** or **XP tracking** advancement. Milestone hides XP and leaves level-ups to
   the GM; neither mode levels anyone automatically.
4. Open the invite dialog and copy the **invite link** or seven-character code.
5. Tell players whether to build a character in Runehall or import a Pathbuilder 2e JSON export.
   Imported join requests wait in **Campaign → Settings → Join requests** for approval.
6. Create any registration invite codes your friends need from **Admin → Hall controls**.

## Player: before session 1

1. Open the invite link, create an account or sign in, then choose:
   - **Create a new character**, or
   - **Import from Pathbuilder** and submit it for GM approval, or
   - **Bring an existing character** if one is already in the library.
2. Review the character in the builder. The Review step lists missing choices and warnings.
3. In **Equipment**, spend the 15 gp starting budget on gear, then use **Take remaining as coins** to
   carry unspent wealth. Imported characters keep their own purse and are not held to that budget.
4. If the character was imported, wait for the GM to approve it before play.

## GM: session 1 checklist

1. Open **Sessions** and schedule the next gathering. That calendar is the single source for the
   Overview's next-session date; add a shared teaser and GM notes on **Overview** if useful.
2. Open **Party** and confirm every approved character is present, at the expected level, and not
   marked **Needs choices**. If a card is marked, the player can open **Edit** and the pinned
   checklist links to every unresolved chapter.
3. Open **Table**, pick or create a scene, and upload a map if needed.
4. Add character tokens from **Add token**, then place monsters from the bestiary or encounter
   builder.
5. Roll initiative when combat starts. The tracker handles grouped monsters, rounds, movement, HP,
   and conditions. A condition applied to a PC token updates that player's sheet automatically.
6. Use **Table talk** for shared chat, **GM only** for whispered messages, and the dice tray's
   **Secret GM roll** toggle for private rolls. The two toggles are independent. On a character
   sheet, set a target DC/AC to see degrees of success, tick **Secret roll** for private checks, and
   use the attack row's **2nd**, **3rd**, and **Crit ×2** buttons for MAP and critical damage.
7. Use the **Soundtrack** panel to upload a track or add one from the bundled CC0 music library.
   Players click **Join audio** once; they can leave audio locally without pausing the table. After
   a reload, the GM also gets **Join audio** when shared playback is already running.
8. Distribute treasure from **Loot**, award XP only if using XP mode, and use **Long rest** when the
   party rests. Quest XP can only be paid out in XP tracking mode; milestone campaigns store the
   value for reference. A direct HP correction applies dying/unconscious at 0 and wounded when the
   character is healed back above 0, without consuming temporary HP.
9. Record notes, handouts, and quests in **Journal**. Mark handouts visible when players should see
   them. A paid quest keeps its reward marker even if the handout is edited later.
10. When combat ends, use **Clear launched** in the encounter launch dialog if monster tokens should
    leave the scene. A fresh launch also replaces that encounter's earlier tokens on the same scene.
11. Before ending the night, write a short recap, mark the session played in **Sessions**, and take a
    backup.

## Known limits worth telling the table

- The builder is strong but not every feat, spell, or item effect is automated. Read the effect and
  apply manual bonuses when needed.
- Spell heightening/cast-time spending and the common Heal/Harm/Force Barrage action variants are
  automated. Other action variants, affliction onset timers, automatic token-turn
  dying/persistent-damage hooks, fast healing/regeneration, and forced movement are not fully
  automated. The sheet can roll dying recovery checks and persistent damage end-of-turn checks
  manually, and staged afflictions have a stage-save tracker. The GM review queue shows validation
  errors it can detect, but not every missing situational bonus.
- Only Pathbuilder imports go through the GM approval queue. A player who joins without a character
  can create one directly in the campaign; the GM should check the Party tab before play.
- Encounter cleanup only knows tokens launched after this update. Tokens created by older launches
  have no encounter tag, so remove any existing duplicates once by hand.
- **Clear launched** removes every token that encounter placed across the campaign's scenes. It
  intentionally leaves character, NPC, and manually created tokens on the table.
- The character sheet autosaves after a short delay. Wait for the saved indicator before immediately
  leaving the sheet.
- The Travel tab tracks a journey, watches, weather, and exploration activities, but there is no hex/pointcrawl map, automatic weather or encounter checks, or AP chapter importer yet.
- The soundtrack is one shared track list, not per-player playlists. Sync is on play/pause/track
  change and is not sample-accurate.
- Campaign JSON exports carry metadata; uploaded audio/image files are restored from
  `data/uploads`, so use the backup archive to move a campaign between machines.
- Password recovery is local-shell only. Use `docker compose exec runehall npm run reset-password --
  --username <name>` if the admin loses access.

## Emergency commands

```bash
docker compose logs -f runehall
docker compose exec runehall npm run backup -- --keep 14
docker compose exec runehall npm run restore-drill
docker compose restart runehall
```

For updates: take a backup, `git pull`, `docker compose build --pull`, then
`docker compose up -d`, and finally check `/api/health`.
