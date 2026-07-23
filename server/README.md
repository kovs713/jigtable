# jigtable / server 🔥

the noisy little kitchen behind the quiet puzzle table.

Bun HTTP/WebSocket service for compositions, multiplayer rooms, player
history, Telegram auth, and the Telegram upload bot.

---

## what runs

| part                  | job                                                          |
| --------------------- | ------------------------------------------------------------ |
| HTTP API              | auth, compositions, sessions, rooms, results, and health     |
| WebSocket API         | room state, piece moves, cursors, chat, pings, and timers    |
| Telegram bot          | accepts source media and manages composition workflows       |
| PostgreSQL            | users, auth, compositions, bot sessions, events, and history |
| Redis                 | live room state and cached player sessions                   |
| S3-compatible storage | source and rendered composition images                       |
| Rust N-API library    | native composition layout engine                             |

Startup connects Redis first, then starts the API and the polling bot. A
missing Redis password is treated as a configuration error, not a suggestion.

## setup

### requirements

```text
Bun 1.3.14, Rust 1.88.0, Docker, Telegram bot, S3-compatible bucket
```

Install dependencies once from the repository root:

```bash
bun install --frozen-lockfile
cd server
```

Create `server/.env`. This is the smallest useful local shape; replace every
angle-bracket value:

```dotenv
PORT=3000
CLIENT_URL=http://localhost:5173
PUBLIC_API_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:5173

DB_USERNAME=postgres
DB_PASSWORD=<database-password>
DB_DATABASE=jigtable
DB_PORT=5432
DB_URL=postgresql://postgres:<database-password>@localhost:5432/jigtable

REDIS_PASSWORD=<redis-password>
REDIS_URL=redis://:<redis-password>@localhost:6379

BOT_TOKEN=<telegram-bot-token>
ADMIN_USER_ID=<telegram-user-id>

S3_ENDPOINT=<s3-endpoint>
S3_REGION=<s3-region>
S3_ACCESS_KEY_ID=<s3-access-key-id>
S3_SECRET_ACCESS_KEY=<s3-secret-access-key>
S3_BUCKET=<s3-bucket>
S3_PUBLIC_URL=<public-s3-base-url>
```

Start the bundled PostgreSQL and password-protected Redis, apply migrations,
then run the service:

```bash
docker compose up -d
bun run db:migrate
bun run dev
```

`bun run dev` builds the native Rust library before starting Bun in watch
mode. The generated `.node` file is local build output and should stay out of
Git.

## config notes

| variable             | detail                                                      |
| -------------------- | ----------------------------------------------------------- |
| `CLIENT_URL`         | client links and relative image URL base                    |
| `PUBLIC_API_URL`     | public composition image and render links                   |
| `CORS_ORIGIN`        | comma-separated non-local client origins                    |
| `DB_URL`             | PostgreSQL connection used by Bun SQL and Drizzle           |
| `REDIS_URL`          | Redis URL; must include a password                          |
| `BOT_TOKEN`          | Telegram bot and Telegram auth verification token           |
| `ADMIN_USER_ID`      | Telegram administrator ID                                   |
| `TELEGRAM_PROXY_URL` | optional proxy for Telegram API traffic                     |
| `S3_*`               | S3-compatible endpoint, credentials, bucket, and public URL |

Localhost origins are accepted by CORS automatically. The Compose-only
`DB_*` fields and `REDIS_PASSWORD` configure the local dependency containers;
the application itself connects through `DB_URL` and `REDIS_URL`.

## commands

| command                                  | purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `bun run dev`                            | build native code and run with file watching             |
| `bun run start`                          | build native code and run once                           |
| `bun run native:check`                   | run Cargo checks for the layout engine                   |
| `bun run native:build`                   | compile the release N-API library                        |
| `bun run typecheck`                      | check server TypeScript                                  |
| `bun run test:api`                       | test HTTP, WebSocket, services, mappers, and shared code |
| `bun run test:composition-layout-engine` | build and test the native engine                         |
| `bun run db:generate`                    | generate a Drizzle migration                             |
| `bun run db:migrate`                     | apply committed migrations                               |
| `bun run db:push`                        | push the schema directly to the configured database      |
| `bun run format`                         | format TypeScript, JSON, and Markdown                    |

Run an individual test with `bun test test/<path>.test.ts`. Bot and repository
tests are not included in `test:api`, so run affected files directly.

## observability and deploys

The API serves Prometheus metrics at `/metrics` and health at `/api/health`.
Production Compose, Caddy, Prometheus, and Grafana configuration lives in
[`../ops/`](../ops/).

Pushes to `master` that touch `server/` or `packages/` run checks, publish a
GHCR image, back up PostgreSQL, apply migrations, and recreate the VPS service.

> hot API, cold cache, tea somewhere in between.
