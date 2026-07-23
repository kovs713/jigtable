# jigtable / client ☕

the soft-lit half of the puzzle table.

React SPA for editing photo compositions, creating rooms, and solving jigsaws
together on a PixiJS canvas.

---

## views

| path                       | view                                   |
| -------------------------- | -------------------------------------- |
| `/`                        | project landing page                   |
| `/editor`                  | composition layout editor              |
| `/rooms/new`               | composition picker and room setup      |
| `/rooms/:roomId`           | live multiplayer puzzle room           |
| `/profile`                 | player profile and solved-room history |
| `/profile/history/:roomId` | detailed room result                   |
| `/privacy`                 | privacy policy                         |

Routing is a small pathname matcher in `src/app/routes.ts`; there is no router
library. Pages are lazy-loaded from `src/app/App.tsx`.

## inside

| area         | detail                                                          |
| ------------ | --------------------------------------------------------------- |
| UI           | React 19, Tailwind CSS, Radix UI, Lucide icons                  |
| canvas       | PixiJS puzzle rendering and interaction                         |
| multiplayer  | WebSocket pieces, cursors, locks, chat, pings, and timer state  |
| auth         | Telegram WebApp, Telegram Login Widget, and localhost dev login |
| shared logic | `@jigtable/core` and `@jigtable/shared` workspace packages      |

## setup

Install the workspace from the repository root, then start Vite:

```bash
bun install --frozen-lockfile
cd client
bun run dev
```

Vite listens on all interfaces. With no env file, the client uses
`http://localhost:3000` as its API and derives the WebSocket URL from it.

For Telegram-backed flows, copy the example and replace its values:

```bash
cp .env.example .env.local
bun run dev
```

## config

| variable                     | behavior                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| `VITE_API_URL`               | API base URL; defaults to `http://localhost:3000` locally    |
| `VITE_TELEGRAM_BOT_USERNAME` | bot username used by Telegram login and editor links         |
| `VITE_JIGSAW_WS_ENABLED`     | multiplayer is enabled unless this is exactly `false`        |
| `VITE_JIGSAW_WS_URL`         | explicit room socket URL; otherwise derived from the API URL |
| `VITE_DEV_TELEGRAM_ID`       | optional Telegram ID sent by localhost dev login             |

Non-local production pages reject a local or non-HTTPS API URL. Vercel builds
also require `VITE_API_URL` and `VITE_TELEGRAM_BOT_USERNAME`; an explicit
WebSocket URL must use `wss://`.

## commands

| command             | purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `bun run dev`       | start the Vite development server                     |
| `bun run lint`      | run ESLint                                            |
| `bun run typecheck` | run TypeScript without emitting files                 |
| `bun run build`     | validate deployment env, typecheck, and build `dist/` |
| `bun run preview`   | serve the production build locally                    |
| `bun run format`    | format TypeScript and TSX files                       |

The production build also writes `dist/stats.html` with a bundle visualization.

## vercel

Set the Vercel root directory to `client`.

`vercel.json` installs with Bun, builds to `dist/`, rewrites SPA routes to
`index.html`, caches fingerprinted assets, and adds the project's security
headers.

> fewer tabs, more table.
