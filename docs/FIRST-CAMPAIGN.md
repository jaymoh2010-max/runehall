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
   - `COOKIE_SECURE=1`
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

5. Put Caddy or Nginx in front for HTTPS. Do **not** publish port 3001 directly to the internet.
   See [DEPLOY.md](DEPLOY.md) for ready-to-copy proxy examples. Remove `BOOTSTRAP_TOKEN` from `.env`
   and recreate the container after the administrator exists.

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
3. If the character was imported, wait for the GM to approve it before play.

## GM: session 1 checklist

1. Open the campaign **Overview** and fill in the next session date/teaser if useful.
2. Open **Party** and confirm every approved character is present and at the expected level.
3. Open **Table**, pick or create a scene, and upload a map if needed.
4. Add character tokens from **Add token**, then place monsters from the bestiary or encounter
   builder.
5. Roll initiative when combat starts. The tracker handles grouped monsters, rounds, movement, HP,
   and conditions.
6. Use **Table talk** for shared chat, **GM only** for whispers, and the dice tray for public or
   secret rolls.
7. Use the **Soundtrack** panel to upload a track or add one from the bundled CC0 music library.
   Players click **Join audio** once; they can leave audio locally without pausing the table.
8. Distribute treasure from **Loot**, award XP only if using XP mode, and use **Long rest** when the
   party rests.
9. Record notes, handouts, and quests in **Journal**. Mark handouts visible when players should see
   them.
10. Before ending the night, write a short recap and take a backup.

## Known limits worth telling the table

- The builder is strong but not every feat, spell, or item effect is automated. Read the effect and
  apply manual bonuses when needed.
- Spell heightening/cast-time spending, afflictions, recovery-check automation, and forced movement
  are not fully automated. The GM review queue shows validation errors it can detect, but not every
  missing situational bonus.
- Only Pathbuilder imports go through the GM approval queue. A player who joins without a character
  can create one directly in the campaign; the GM should check the Party tab before play.
- Launch an encounter once per fight. Relaunching the same encounter on the same scene adds duplicate
  monster tokens; there is no automatic cleanup button yet.
- The character sheet autosaves after a short delay. Wait for the saved indicator before immediately
  leaving the sheet.
- There is no travel/weather/hex map layer, shop economy, or AP chapter importer yet.
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
