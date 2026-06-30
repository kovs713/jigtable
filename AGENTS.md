# Puzzle Shuffle Context

## Repo
- Monorepo: `server/` Bun + TS + grammy + Drizzle + S3, `client/` Vite + React + shadcn/Tailwind.
- Main WIP branch: `test`.
- `master` was clean baseline before e2e work.
- Never commit `node_modules` or `dist`.
- Current important WIP: full bot -> backend -> frontend -> backend render flow.

## Goal
- Telegram user sends images to bot.
- Bot stores images in S3 and DB batch.
- User runs `/commit`.
- Server creates shuffle layout JSON using `server/native/shuffle/src`.
- Bot returns frontend edit link or code.
- Frontend loads layout from backend, lets user edit visually.
- User builds final image.
- Backend renders final `.png`, `.jpg`, or `.jpeg` canvas image with user images placed in it.

## Server Flow
- Entry: `server/src/main.ts` starts grammy bot and Bun HTTP API.
- Bot commands: `server/src/bot/handlers/*`.
- `/new`: creates DB batch, sets `ctx.session.activeBatchId`, starts collecting.
- Photo handler: uploads Telegram file to S3, inserts `batch_photos`, stores dimensions/order.
- `/commit`: loads active batch photos, calls `shuffleImages`, saves layout, replies with client URL.
- `/reset`: cancels active batch, deletes uploaded S3 objects for that batch.
- `/list`: replies with recent ready/completed edit links.
- Session shape: `photos`, `isStarted`, `activeBatchId`.

## Server API
- File: `server/src/api/index.ts`.
- `GET /api/health`.
- `GET /api/batches/:batchId/layout?token=...`.
- `PATCH /api/batches/:batchId/layout?token=...`.
- `GET /api/batches/:batchId/images/:fileId?token=...`.
- `POST /api/batches/:batchId/render?token=...` body: `{ format, layout }`.
- `GET /api/batches/:batchId/rendered?token=...`.
- Auth is edit token in query string.
- CORS currently `*`.
- Bun S3 gotcha: do not `new Response(s3Client.file(key), init)`. Must `await s3Client.file(key).arrayBuffer()` then `new Response(body, init)`.

## DB
- Schemas in `server/src/infra/db/shemas/*`.
- `batches`: `batchId`, `userId`, `editToken`, `status`, `layout`, `outputKey`, `outputFormat`, timestamps.
- `batch_photos`: `fileId`, `batchId`, `objectKey`, `contentType`, `sortOrder`, `width`, `height`.
- Run after schema changes: `cd server && bun run db:push`.

## Storage
- S3 client: `server/src/infra/storage.ts`.
- Photo keys: `batches/{batchId}/photos/{fileId}` via `server/src/features/object-keys.ts`.
- Render key: `batches/{batchId}/render/canvas.{ext}`.
- Renderer: `server/src/features/render-layout.ts` uses `sharp`.
- Backend render uses `sharp.resize(width, height, { fit: "fill" })`, so aspect ratio may distort by design.

## Shuffle Algorithm
- Module: `server/native/shuffle/src/lib.rs`.
- Input: image id/src/width/height.
- Output: `{ canvas, items }` with `x/y/width/height/scale`.
- Deterministic grid candidate selection, balanced canvas, no overlap by default.
- Tests: `server/src/shuffle/index.test.ts`.

## Client UX Rules
- User must not see raw JSON, image ids, src URLs, batch ids, or other backend internals.
- No demo/sample layout in user UI.
- If no bot link params, show empty state, not fake images.
- User sees only final composition editor.
- Images are labeled `Image 1`, `Image 2`, etc.
- Main actions only: save edits, choose format, build image, download/open result.
- Frontend preview must use `object-fill`, not `object-cover`, so image distorts like backend render.
- Canvas resize scales all content by X/Y, not crop/clamp images.
- Image resize can distort image by changing frame width/height.
- Shift corner-resize keeps image ratio.

## Client Style Rules
- No rounded corners anywhere.
- No hardcoded component colors. Use theme vars and semantic Tailwind tokens only.
- One calm accent hue in theme vars is ok. Avoid purple/red combo.
- Thin borders. Global `.border*` width set to `0.5px` in `client/src/index.css`.
- Entire editor must fit viewport. No document scroll. Internal scroll only for panels/canvas.

## Env
- `server/.env.example` includes:
- `BOT_TOKEN`, S3 creds, `DB_URL`.
- `PORT=3000`.
- `CLIENT_URL=http://localhost:5173`.
- `PUBLIC_API_URL=http://localhost:3000`.
- Client optional env: `VITE_API_URL`, default `http://localhost:3000`.

## Checks
- Server typecheck: `cd server && bunx tsc --noEmit`.
- Server shuffle tests: `cd server && bun test src/shuffle/index.test.ts`.
- Client build: `cd client && bun run build`.
- Client lint: `cd client && bun run lint`.

## Known Runtime Needs
- Live e2e needs real Telegram bot token, S3, DB, and `bun run db:push`.
- Runtime with real services was not fully verified here.
- Build artifacts from checks should remain ignored, not committed.
