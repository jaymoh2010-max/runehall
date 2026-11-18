# Backup and restore

Campaign data is more valuable than any single feature. Runehall has two complementary backup paths.

## 1. Full local backup (recommended)

This snapshots the SQLite database and every uploaded map, portrait, token image, and soundtrack file.

```bash
npm run backup
```

Output goes to `backups/runehall-<timestamp>/` by default:

```
runehall-2026-11-03T19-42-05-738Z/
  runehall.db              consistent SQLite snapshot
  uploads/                 uploaded maps, portraits, token art, and audio
  compendium-manifest.json data version
  backup.json              manifest, per-file SHA-256 hashes, and archive digest
```

Optional flags:

```bash
npm run backup -- --dir D:\RunehallBackups
npm run backup -- --with-compendium
npm run backup -- --keep 14
```

`--keep N` keeps the newest N `runehall-*` archives in the backup directory and removes older ones after a successful snapshot. The fresh snapshot is never pruned.

The snapshot is created with SQLite `VACUUM INTO`, so it is safe to run while the server is active. Every file is hashed into `backup.json`, and the manifest digest covers the sorted file list.

### Off-machine shipping

Copy the newest archive to another disk, NAS mount, OneDrive folder, or other filesystem path:

```bash
npm run ship-backup -- --to "D:\RunehallBackups" --keep 14
BACKUP_SHIP_DIR=/mnt/nas/runehall npm run ship-backup -- --keep 14
```

Shipping verifies the source manifest, copies into a temporary folder, verifies every destination file, and only then moves the archive into place. Existing verified archives are reused. `--keep N` prunes older off-machine archives; `--keep 0` keeps all. For APIs that are not mounted as a filesystem, use rclone/restic after creating the local backup.

If Runehall runs in Docker, run shipping from the host against the bind-mounted backup folder:

```bash
BACKUP_DIR=./backups npm run ship-backup -- --to /mnt/nas/runehall --keep 14
```

The image also prepares `/app/shipped` as a writable mount point. To ship from inside the container, mount an off-machine folder there and run:

```bash
docker compose exec -T runehall npm run ship-backup -- --to /app/shipped --keep 14
```

### Restore

Stop Runehall first. Native installs refuse to restore while the local API port is accepting connections; for Docker, stop the `runehall` service first (the `docker compose run --rm` helper has its own loopback, so the port check cannot see the running service).

```bash
npm run restore -- --from "backups/runehall-2026-11-03T19-42-05-738Z" --yes
```

Restore:
- verifies the archive's SHA-256 manifest before changing anything; corrupted archives are refused,
- keeps a safety copy of the current database and uploads under `backups/pre-restore-<timestamp>/`,
- replaces `data/runehall.db`,
- replaces `data/uploads/`.

Legacy archives without checksums require explicit `--allow-unverified`. Use that only after inspecting the archive manually.

Then start the server again:

```bash
npm run dev
# or: npm run build && npm start
```

### Suggested rhythm
- After every session, or at least once per week during active play.
- Before updating the code or compendium data.
- Before deleting a campaign or doing a restore.
- Keep multiple generations; do not overwrite the only copy.

### Automation

Run the backup on a schedule and copy the archive off the machine. Examples:

```cron
# Linux cron: daily at 03:15, keep two weeks
15 3 * * * cd /srv/runehall && BACKUP_DIR=/srv/runehall/backups npm run backup -- --keep 14 >> /var/log/runehall-backup.log 2>&1
```

```ini
# /etc/systemd/system/runehall-backup.service
[Service]
Type=oneshot
WorkingDirectory=/srv/runehall
Environment=BACKUP_DIR=/srv/runehall/backups
ExecStart=/usr/bin/npm run backup -- --keep 14
```

```ini
# /etc/systemd/system/runehall-backup.timer
[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

On Windows, create a daily Task Scheduler entry with program `npm.cmd`, arguments `run backup -- --keep 14`, and start-in set to the project folder.

Docker:

```bash
docker compose exec -T runehall npm run backup -- --keep 14
```

Use `npm run ship-backup` for filesystem destinations. For cloud APIs without a mounted filesystem, run rclone, restic, or your normal sync tool after the local backup. A copy on the same disk does not survive disk failure.

### Restore drill

Run the automated drill after setup, whenever the host changes, and before trusting a new release:

```bash
npm run restore-drill
```

It starts an isolated server in a temporary directory, creates a campaign and uploads an asset, takes a live backup, ships it to a second directory, proves a corrupted copy is refused, restores into a fresh data directory, boots the restored server, and compares the campaign, invite code, and uploaded bytes. It never touches `data/` or `backups/`. CI runs the same command on a fresh runner.

For a real host, also do a manual drill once after setup and whenever the host changes:

Docker:

```bash
docker compose stop
docker compose run --rm runehall npm run restore -- --from /app/backups/<backup-directory> --yes
docker compose start
```

Native install:

1. Stop the server.
2. Move the current `data/` directory aside.
3. Restore the newest backup directory with `npm run restore -- --from <backup-directory> --yes`.
4. Start the server and open `/api/health`.

After either flow:

1. Sign in, open a campaign, a character sheet, and a scene with an uploaded map.
2. Check that recent audit entries and handout images are present.
3. Remove any moved-aside directory only after the check passes.

## 2. GM campaign export (portable JSON)

In **Campaign → Settings → Campaign archive**, the GM can export a JSON file containing:

- campaign and member information,
- full character drafts and summaries,
- scenes, tokens, and fog state,
- chat and dice log,
- journal entries and handouts,
- encounters, loot, dashboard, NPCs, and sessions,
- active scene and initiative state,
- an asset URL list.

The JSON is useful for moving a campaign, inspecting data, or attaching to a bug report. It does **not** embed binary map/portrait files; use the full backup for those.

Import an export from **My Campaigns → Import campaign**. Runehall creates a new campaign, remaps internal IDs, and matches player accounts by username. Characters whose owners do not have a local account are assigned to the importing GM. Uploaded images are not copied by the JSON import.

## 3. Unused asset cleanup

Deleting a scene, token, handout, or NPC does not immediately delete its image file. Review orphaned uploads first:

```bash
npm run cleanup-assets
```

The command scans every database table for `/uploads/` references. It is a dry run by default. To remove the reported files:

```bash
npm run cleanup-assets -- --delete
npm run cleanup-assets -- --delete --verbose
```

Run a full backup before the first cleanup on an established table.

## Hosting later

If Runehall is moved to a server:
- put backups on a different disk/account from the live database,
- encrypt backups if they leave the machine,
- test a restore before relying on the rotation,
- set `COOKIE_SECURE=1` behind HTTPS.
