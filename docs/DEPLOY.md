# Deployment and hardening

Runehall is designed to run on one trusted machine first. This is the shortest supported production path.

## Option 1 — local production process

```bash
npm ci
npm run build
NODE_ENV=production COOKIE_SECURE=0 npm start
```

Open `http://localhost:3001`. This serves the built client and the API from the same Fastify process.

## Option 2 — Docker Compose

```bash
docker compose up -d --build
```

Open `http://localhost:3001`. The compose file uses `./data` for the SQLite database, compendium, and uploads, and `./backups` for backup archives. On Linux, make sure those directories are writable by the container user (UID 1000):

```bash
mkdir -p data/uploads backups
```

The production image is built and health-checked in CI. It uses Node 26 Alpine, runs as the non-root `node` user, writes only to `/app/data`, `/app/backups`, and an optional `/app/shipped` mount, and serves the compiled client and API from one process.

Useful commands:

```bash
docker compose logs -f runehall
docker compose exec runehall npm run backup
docker compose exec runehall npm run cleanup-assets
docker compose down
```

To use a different host port, set `RUNEHALL_PORT=8080` before `docker compose up`.

## HTTPS reverse proxy

Do not expose port 3001 directly to the internet. Put Caddy or Nginx in front and proxy both HTTP and WebSocket traffic.

### Caddy

```caddyfile
runehall.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3001
}
```

If Caddy runs in Compose on the same network, proxy to `runehall:3001` instead.

### Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name runehall.example.com;

  ssl_certificate     /etc/letsencrypt/live/runehall.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/runehall.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Runehall already enables `trustProxy`, so keep `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` intact.

## Required production settings

| Variable | Recommended | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Disables pretty logging and enables production defaults. |
| `COOKIE_SECURE` | `1` behind HTTPS | Prevents session cookies from being sent over plain HTTP. |
| `ENABLE_CSP` | `1` | Enables the Content Security Policy. It is on by default in production. |
| `REGISTRATION_MODE` | `invite` or `closed` on the internet | Controls who can create an account. Runtime changes in Hall controls override it. |
| `TRUSTED_ORIGINS` | Your public origin | Extra allowed origins for state-changing requests when using a split frontend. |
| `AUTH_RATE_LIMIT_MAX` | `30` | Login/register attempts per IP per window. |
| `UPLOAD_RATE_LIMIT_MAX` | `60` | Uploads per IP per window. |

Security headers are always sent: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and cross-origin isolation headers. Production also sends CSP; `COOKIE_SECURE=1` adds HSTS.

State-changing API requests from a foreign `Origin` are rejected in production. Same-origin requests and requests without an `Origin` header (CLI, health checks) are allowed.

## Data and backups

The Docker volume layout is:

```text
data/
  compendium/        local PF2e rules data
  runehall.db        SQLite database
  uploads/           maps, portraits, token art
backups/             backup archives created by npm run backup
```

Back up before updates and before the first asset cleanup:

```bash
docker compose exec runehall npm run backup
docker compose exec runehall npm run cleanup-assets
# then, when the report looks right:
docker compose exec runehall npm run cleanup-assets -- --delete
```

To update:

```bash
docker compose exec runehall npm run backup
docker compose build --pull
docker compose up -d
curl http://127.0.0.1:3001/api/health
```

## Registration, admin recovery, and audit

The first account created on a fresh install becomes the instance administrator. That account sees **Admin → Hall controls** in the top navigation.

Registration modes:

| Mode | Behavior |
| --- | --- |
| `open` | Anyone who reaches the hall can create an account. Good for a trusted LAN. |
| `invite` | New accounts need a single-use invite code created in **Hall controls**. |
| `closed` | No new accounts. Existing accounts still sign in. |

Set the default with `REGISTRATION_MODE` in the environment. A value saved in **Hall controls** overrides the environment on later boots. The first user is always allowed, even when the mode is `invite` or `closed`.

If an administrator loses access, run the local recovery command on the host:

```bash
# Inside Docker
docker compose exec runehall npm run reset-password -- --username alice
# Native install
npm run reset-password -- --username alice
```

The command prints a temporary password once, signs out every session for that account, and writes an audit entry. Add `--password "<value>"` to supply your own, `--admin` to grant administrator, or `--list` to list accounts.

Signed-in users can change their own password from **Account & security**. Other sessions are signed out.

The audit log records sign-ins, failed sign-ins, password changes, campaign creation/deletion, member removal, party level-ups, invite creation, and registration-mode changes. It is stored in SQLite and shown in **Hall controls**. Admins can filter it and export the current view as CSV.

Retention is configurable in **Hall controls** from 0 (keep forever) to 3650 days. The value is stored in `app_settings` and can be seeded with `AUDIT_RETENTION_DAYS`. Expired entries are pruned when retention is saved and at server startup. To preview or prune manually while the server is stopped:

```bash
npm run audit-prune
npm run audit-prune -- --days 180
npm run audit-prune -- --days 180 --delete
```

The command is a dry run unless `--delete` is present. Audit entries are not forwarded to an external log service.

Before exposing the hall to the internet, set `REGISTRATION_MODE=invite` or `closed`, or keep the reverse proxy behind a VPN/access list.

## Scheduled backups

`npm run backup` is safe while the server is running. Add `--keep N` to retain the newest N archives:

```bash
npm run backup -- --keep 14
```

Linux cron example (daily at 03:15, archives in `/srv/runehall/backups`):

```cron
15 3 * * * cd /srv/runehall && BACKUP_DIR=/srv/runehall/backups npm run backup -- --keep 14 >> /var/log/runehall-backup.log 2>&1
```

systemd timer:

```ini
# /etc/systemd/system/runehall-backup.service
[Unit]
Description=Runehall backup

[Service]
Type=oneshot
WorkingDirectory=/srv/runehall
Environment=BACKUP_DIR=/srv/runehall/backups
ExecStart=/usr/bin/npm run backup -- --keep 14
```

```ini
# /etc/systemd/system/runehall-backup.timer
[Unit]
Description=Daily Runehall backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

Windows Task Scheduler: create a daily task with the program `npm.cmd`, arguments `run backup -- --keep 14`, and start-in set to the project folder.

For Docker, run the same command from the host schedule:

```bash
docker compose exec -T runehall npm run backup -- --keep 14
BACKUP_DIR=./backups npm run ship-backup -- --to /mnt/nas/runehall --keep 14
```

`ship-backup` verifies the archive checksums, copies it, verifies the destination, and prunes old off-machine generations. For cloud APIs without a mounted filesystem, use rclone/restic or your normal sync tool after the local backup. A backup that only exists on the same disk is not a backup.

### Restore drill

Run this at least once after setup and before trusting the deployment:

Docker flow:

```bash
docker compose stop
docker compose run --rm runehall npm run restore -- --from /app/backups/<archive> --yes
docker compose start
```

Native flow:

1. Stop the server (`npm start`).
2. Move the current `data/` directory aside.
3. Restore the newest archive with `npm run restore -- --from <archive> --yes`.
4. Start the server and check `/api/health`.

Then complete the same checks for either flow:

1. Sign in, open a campaign, open a character sheet, and open a scene with an uploaded map.
2. Confirm the newest audit entries and journal handout images are present.
3. Delete the moved-aside directory only after the check passes.

## Compendium version pinning

`npm run ingest` now records `sourceCommit`, `sourceRef`, and `sourceDirty` in `data/compendium/manifest.json`. The current shipped data is pinned to Foundry PF2e commit `be611895ec16d4672f53d014527d9007b06cb409`. Re-run ingest against that commit for a reproducible rebuild, and compare the manifest after upgrades.

## Known hosting gaps

- SQLite is the only database adapter. One process and one machine is the supported deployment.
- Password recovery is local only; there is no email provider integration.
- Audit entries are stored locally with configurable retention and CSV export; they are not forwarded to an external log service.
- Uploaded assets live on local disk; use the backup archive to move them between machines.
- There is no built-in scheduler. Use cron, a systemd timer, or Task Scheduler.
