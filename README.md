# jigtable 🧩

photos in, jigsaw puzzle night out.

Jigtable turns Telegram photos into editable compositions and shared,
real-time jigsaw rooms.

---

## what it does

| step     | detail                                                             |
| -------- | ------------------------------------------------------------------ |
| collect  | send photos or stickers to the Telegram bot                        |
| compose  | arrange the uploaded images in the browser editor                  |
| create   | choose a composition, piece count, and room settings               |
| solve    | move and snap pieces together with shared cursors, chat, and pings |
| remember | keep solved-room history, timings, and player results              |

## workspace

| path                                   | job                                                      | main tools                                 |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| [`client/`](client/)                   | editor and puzzle room SPA                               | React 19, Vite, PixiJS, Tailwind CSS       |
| [`server/`](server/)                   | HTTP/WebSocket API and Telegram bot                      | Bun, grammY, Drizzle, PostgreSQL, Redis    |
| [`packages/core/`](packages/core/)     | puzzle generation, grouping, snapping, protocol, history | TypeScript                                 |
| [`packages/shared/`](packages/shared/) | shared routes, schemas, and transport types              | TypeScript                                 |
| [`ops/`](ops/)                         | production proxy, containers, and observability          | Docker Compose, Caddy, Prometheus, Grafana |

The workspace packages export TypeScript source directly. No little build farm
is hiding between them.

## local setup

### requirements

```text
Bun 1.3.14, Rust 1.88.0, Docker
```

Clone and install once from the repository root:

```bash
git clone https://github.com/kovs713/jigtable.git
cd jigtable
bun install --frozen-lockfile
```

The client can start immediately and defaults to `http://localhost:3000` for
its API:

```bash
cd client
bun run dev
```

The server also needs PostgreSQL, password-protected Redis, Telegram, and S3
configuration. Its complete local setup lives in
[`server/README.md`](server/README.md).

```bash
cd server
docker compose up -d
bun run db:migrate
bun run dev
```

Client environment and Vercel notes live in
[`client/README.md`](client/README.md).

## useful commands

Run package scripts from their package directory; the root intentionally has
none.

| cwd              | command                                  | purpose                            |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| root             | `bun install --frozen-lockfile`          | install the whole workspace        |
| `client/`        | `bun run lint`                           | lint the SPA                       |
| `client/`        | `bun run typecheck`                      | check client types                 |
| `client/`        | `bun run build`                          | validate env, typecheck, and build |
| `server/`        | `bun run native:check`                   | check the Rust layout engine       |
| `server/`        | `bun run typecheck`                      | check server types                 |
| `server/`        | `bun run test:api`                       | run API-focused tests              |
| `server/`        | `bun run test:composition-layout-engine` | build and test the native engine   |
| `packages/core/` | `bun test test/snap.test.ts`             | test core snapping logic           |

## deploy shape

The SPA is configured for Vercel with `client` as its root directory. Server
changes on `master` are tested, built into GHCR, migrated, and deployed to a
Docker Compose stack behind Caddy.

Prometheus reads the server's `/metrics` endpoint inside the stack; Caddy does
not expose that endpoint publicly.

> bring your own tea. the table already has enough pieces.
