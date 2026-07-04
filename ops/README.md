# Jigtable Server Deploy

## Domains

- `jigtable.ru`: Vercel client, primary domain.
- `www.jigtable.ru`: Vercel client alias, redirect to `jigtable.ru`.
- `api.jigtable.ru`: VPS Caddy reverse proxy to server.

## DNS

- Point `jigtable.ru` to Vercel.
- Point `www.jigtable.ru` to Vercel.
- Point `api.jigtable.ru` `A` record to the VPS IPv4.

## Vercel Env

```env
VITE_API_URL=https://api.jigtable.ru
```

## VPS Bootstrap

1. Install Docker Engine and Docker Compose plugin.
2. Open firewall ports `22`, `80`, and `443`.
3. Create `/ops/jigtable` and make the deploy user own it.
4. Copy `ops/.env.example` to `/opt/jigtable/.env` and fill real values.
5. Optional dry-run: copy `ops/.env.dev.example` to `/opt/jigtable/.env.dev`.
6. Keep `DB_URL` pointed at `postgres:5432` inside Docker network.
7. Add the deploy user to the `docker` group.
8. Add GitHub secrets `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY`.

## Env Files

- `.env`: prod env used by default.
- `.env.dev`: VPS dry-run env, pass it explicitly with `--env-file .env.dev`.
- Never commit filled env files.

## VPS Dry Run

```bash
cd /opt/jigtable
cp .env.dev.example .env.dev
docker compose --env-file .env.dev -f docker-compose.prod.yml config
docker compose --env-file .env.dev -f docker-compose.prod.yml up -d postgres
```

## Required VPS Env

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=jigtable
DB_URL=postgresql://postgres:<strong-password>@postgres:5432/jigtable
TELEGRAM_PROXY_URL=http://xray:10809
CLIENT_URL=https://jigtable.ru
PUBLIC_API_URL=https://api.jigtable.ru
CORS_ORIGIN=https://jigtable.ru,https://www.jigtable.ru
BOT_TOKEN=<telegram-bot-token>
S3_ENDPOINT=<s3-endpoint>
S3_REGION=<s3-region>
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=<s3-access-key-id>
S3_SECRET_ACCESS_KEY=<s3-secret-access-key>
S3_BUCKET=<s3-bucket>
```

- `CORS_ORIGIN` accepts comma-separated origins.

## Telegram Proxy

- Prod Telegram outbound uses local Xray HTTP proxy, no system TUN routing.
- Copy `ops/xray/config.example.json` to `ops/xray/config.json` on VPS and fill VLESS values.
- Keep `ops/xray/config.json` uncommitted; it contains proxy secrets.
- `server` uses `TELEGRAM_PROXY_URL=http://xray:10809` in prod compose.

## Deploy

- Prod deploy is manual only through `Server Deploy` GitHub Actions workflow.
- Workflow is locked to `master`.
- Workflow builds `linux/amd64` image and pushes it to GHCR.
- VPS pulls the image, backs up Postgres, restarts Compose, then checks `/api/health`.

## Database

- Do not use `db:push` for prod.
- Finalize schema before first deploy.
- Generate committed Drizzle migrations with `cd server && bun run db:generate`.
- Run migrations manually until the migration policy is finalized.
- Restore test backup before trusting prod migration flow.

## Local Compose Smoke Test

```bash
cp ops/.env.example ops/.env
SERVER_IMAGE=jigtable-server:local docker build -f server/Dockerfile -t jigtable-server:local .
cd ops && SERVER_IMAGE=jigtable-server:local docker compose -f docker-compose.prod.yml up
```

## Compose Config Check

```bash
JIGTABLE_ENV_FILE=.env.example SERVER_IMAGE=jigtable-server:local POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_DB=jigtable docker compose -f ops/docker-compose.prod.yml config
```
