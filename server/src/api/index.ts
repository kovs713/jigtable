import { serve } from "bun"
import { and, asc, eq } from "drizzle-orm"
import sharp from "sharp"

import type {
  CreatePuzzleRoomResponse,
  PuzzleSession,
} from "@puzzle-shuffle/puzzle-core"

import {
  readAuthToken,
  TelegramAuthService,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
} from "../auth/telegram"
import { normalizeRenderFormat, renderLayout } from "../features/render-layout"
import { clientPuzzleRoomUrl, publicApiUrl } from "../features/urls"
import { db } from "../infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "../infra/db/shemas"
import { s3Client } from "../infra/storage"
import {
  createPuzzleSafeAssetRef,
  PuzzleHistoryStore,
} from "../puzzle-room/history-store"
import type {
  CreatePuzzleRoomInput,
  PuzzleSocketData,
} from "../puzzle-room/room-manager"
import { PuzzleRoomManager } from "../puzzle-room/room-manager"
import {
  PuzzleSessionStore,
  toSessionResponse,
} from "../puzzle-room/session-store"
import type { ShuffleItem, ShuffleResult } from "../shuffle"

interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: ShuffleResult
  outputUrl: string | null
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
}

interface PuzzleServices {
  rooms: PuzzleRoomManager
  sessions: PuzzleSessionStore
  history: PuzzleHistoryStore
  auth: TelegramAuthService
}

export function startApiServer(): void {
  const port = Number(process.env.PORT)
  const puzzleSessions = new PuzzleSessionStore()
  const puzzleHistory = new PuzzleHistoryStore()
  const telegramAuth = new TelegramAuthService()
  const puzzleRooms = new PuzzleRoomManager(puzzleSessions, puzzleHistory)

  const server = serve<PuzzleSocketData>({
    port,
    fetch(request, server) {
      const url = new URL(request.url)

      if (url.pathname === "/api/puzzle/ws") {
        if (server.upgrade(request, { data: {} })) {
          return undefined
        }

        return json({ error: "WebSocket upgrade failed" }, 400)
      }

      return handleRequest(request, {
        rooms: puzzleRooms,
        sessions: puzzleSessions,
        history: puzzleHistory,
        auth: telegramAuth,
      }).catch((error) => {
        console.error("API fatal error", error)
        return json(
          { error: error instanceof Error ? error.message : "Internal error" },
          500
        )
      })
    },
    routes: {},
    websocket: {
      message(socket, message) {
        void puzzleRooms.handleMessage(socket, message).catch((error) => {
          console.error("Puzzle websocket error", error)
          socket.send(
            JSON.stringify({
              type: "error",
              code: "internal_error",
              message: "Internal error",
            })
          )
        })
      },
      close(socket) {
        puzzleRooms.handleClose(socket)
      },
    },
  })

  console.log(`API listening on :${server.port}`)
}

async function handleRequest(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const url = new URL(request.url)
    const parts = url.pathname.split("/").filter(Boolean)

    if (url.pathname === "/api/health") {
      return json({ ok: true })
    }

    if (parts[0] === "api" && parts[1] === "auth") {
      if (request.method === "POST" && parts[2] === "telegram-webapp") {
        return handleTelegramWebAppAuth(request, puzzle)
      }

      if (request.method === "POST" && parts[2] === "telegram-widget") {
        return handleTelegramWidgetAuth(request, puzzle)
      }

      if (request.method === "GET" && parts[2] === "me") {
        return handleGetAuthMe(request, puzzle.auth)
      }

      if (request.method === "POST" && parts[2] === "logout") {
        return handleAuthLogout(request, puzzle.auth)
      }
    }

    if (
      parts[0] === "api" &&
      parts[1] === "me" &&
      parts[2] === "puzzle-history" &&
      request.method === "GET"
    ) {
      return handleGetPuzzleHistory(request, puzzle)
    }

    if (parts[0] === "api" && parts[1] === "puzzle") {
      if (parts[2] === "sessions") {
        if (request.method === "POST" && !parts[3]) {
          return handleRestorePuzzleSession(request, puzzle.sessions)
        }

        if (request.method === "GET" && parts[3] === "current") {
          return handleGetPuzzleSession(request, puzzle.sessions)
        }

        if (request.method === "PATCH" && parts[3] === "current") {
          return handlePatchPuzzleSession(request, puzzle)
        }
      }

      if (parts[2] === "rooms") {
        if (request.method === "POST" && !parts[3]) {
          return handleCreatePuzzleRoom(request, puzzle.rooms)
        }

        if (request.method === "GET" && parts[3]) {
          return handleGetPuzzleRoom(decodeURIComponent(parts[3]), puzzle.rooms)
        }
      }
    }

    if (parts[0] !== "api" || parts[1] !== "batches" || !parts[2]) {
      return json({ error: "Not found" }, 404)
    }

    const batchId = parts[2]

    if (parts[3] === "layout") {
      if (request.method === "GET") {
        return handleGetLayout(batchId, url)
      }

      if (request.method === "PATCH") {
        return handlePatchLayout(batchId, url, request)
      }
    }

    if (parts[3] === "images" && parts[4] && request.method === "GET") {
      return handleGetImage(batchId, decodeURIComponent(parts[4]), url)
    }

    if (parts[3] === "render" && request.method === "POST") {
      return handleRender(batchId, url, request)
    }

    if (parts[3] === "rendered" && request.method === "GET") {
      return handleGetRendered(batchId, url)
    }

    return json({ error: "Not found" }, 404)
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message }, error.status)
    }

    console.error("API error", error)
    return json(
      { error: error instanceof Error ? error.message : "Internal error" },
      500
    )
  }
}

async function handleCreatePuzzleRoom(
  request: Request,
  puzzleRooms: PuzzleRoomManager
): Promise<Response> {
  const body = await readOptionalJson(request)
  const imageUrl = (
    readOptionalNonEmptyString(body?.imageUrl, "imageUrl") ?? "/test_puzzle.png"
  ).trim()
  const pieceCount = readOptionalBoundedInteger(
    body?.pieceCount,
    "pieceCount",
    150,
    4,
    2_000
  )
  const sourceWidth = readOptionalPositiveInteger(
    body?.sourceWidth,
    "sourceWidth"
  )
  const sourceHeight = readOptionalPositiveInteger(
    body?.sourceHeight,
    "sourceHeight"
  )
  const sourceSize =
    sourceWidth && sourceHeight
      ? { width: sourceWidth, height: sourceHeight }
      : await readImageSize(imageUrl)
  const assetId =
    readOptionalNonEmptyString(body?.assetId, "assetId")?.trim() ?? "room-image"
  const input = {
    imageUrl,
    assetId,
    assetRef: createPuzzleSafeAssetRef({ imageUrl, assetId }),
    sourceSize,
    pieceCount,
  } satisfies CreatePuzzleRoomInput
  const state = puzzleRooms.createRoom(input)

  return json({
    roomId: state.roomId,
    joinUrl: clientPuzzleRoomUrl(state.roomId),
    state,
  } satisfies CreatePuzzleRoomResponse)
}

async function handleGetPuzzleRoom(
  roomId: string,
  puzzleRooms: PuzzleRoomManager
): Promise<Response> {
  const state = puzzleRooms.getRoomSnapshot(roomId)

  if (!state) {
    return json({ error: "Room not found or expired" }, 404)
  }

  return json({ state })
}

async function handleTelegramWebAppAuth(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  const body = await readOptionalJson(request)
  const initData = readOptionalNonEmptyString(body?.initData, "initData")

  if (!initData) {
    throw new ApiError("initData is required", 400)
  }

  try {
    const profile = validateTelegramWebAppInitData(initData)

    return handleTelegramLogin(body, puzzle, profile)
  } catch (error) {
    throw new ApiError(readErrorMessage(error), 401)
  }
}

async function handleTelegramWidgetAuth(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  const body = await readOptionalJson(request)

  if (!body) {
    throw new ApiError("Telegram payload is required", 400)
  }

  try {
    const profile = validateTelegramLoginWidget(body)

    return handleTelegramLogin(body, puzzle, profile)
  } catch (error) {
    throw new ApiError(readErrorMessage(error), 401)
  }
}

async function handleTelegramLogin(
  body: Record<string, unknown> | null,
  puzzle: PuzzleServices,
  profile: ReturnType<typeof validateTelegramWebAppInitData>
): Promise<Response> {
  const anonSessionToken = readOptionalNonEmptyString(
    body?.anonSessionToken,
    "anonSessionToken"
  )?.trim()
  const anonSession = anonSessionToken
    ? await puzzle.sessions.getSession(anonSessionToken)
    : null
  const auth = await puzzle.auth.login(profile, {
    name: anonSession?.player.name,
    color: anonSession?.player.color,
  })

  if (anonSessionToken) {
    await puzzle.sessions.linkSessionToUser(anonSessionToken, auth.user.id)
    await puzzle.history.linkAnonSessionToUser(anonSessionToken, auth.user.id)
  }

  return json(auth)
}

async function handleGetAuthMe(
  request: Request,
  auth: TelegramAuthService
): Promise<Response> {
  const user = await requireAuthenticatedUser(request, auth)

  return json({ user })
}

async function handleAuthLogout(
  request: Request,
  auth: TelegramAuthService
): Promise<Response> {
  const token = readAuthToken(request)

  if (token) {
    await auth.logout(token)
  }

  return json({ ok: true })
}

async function handleGetPuzzleHistory(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  const user = await requireAuthenticatedUser(request, puzzle.auth)
  const history = await puzzle.history.getUserHistory(user.id)

  return json({ history })
}

async function handleRestorePuzzleSession(
  request: Request,
  sessions: PuzzleSessionStore
): Promise<Response> {
  const body = await readOptionalJson(request)
  const profile = readPuzzleProfileInput(body)
  const session = await sessions.restoreSession({
    token: readOptionalNonEmptyString(body?.token, "token")?.trim(),
    name: profile.name,
    color: profile.color,
  })

  return json(toSessionResponse(session))
}

async function handleGetPuzzleSession(
  request: Request,
  sessions: PuzzleSessionStore
): Promise<Response> {
  const session = await requirePuzzleSession(request, sessions)

  return json(toSessionResponse(session))
}

async function handlePatchPuzzleSession(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  const token = readPuzzleAuthToken(request)

  if (!token) {
    throw new ApiError("Puzzle session token required", 401)
  }

  const body = await readOptionalJson(request)
  const profile = readPuzzleProfileInput(body)
  const session = await puzzle.sessions.updateSession(token, profile)

  if (!session) {
    throw new ApiError("Puzzle session not found", 401)
  }

  await puzzle.rooms.updateSessionPlayer(session.token, session.player)

  return json(toSessionResponse(session))
}

async function handleGetLayout(batchId: string, url: URL): Promise<Response> {
  const { batch } = await requireBatch(batchId, url)

  if (!batch.layout) {
    return json({ error: "Layout is not ready" }, 404)
  }

  return json(toApiBatchLayout(batch, batch.layout))
}

async function handlePatchLayout(
  batchId: string,
  url: URL,
  request: Request
): Promise<Response> {
  const { batch, photos } = await requireBatch(batchId, url)
  const layout = normalizeLayout(await request.json(), photos)

  await db
    .update(batchesSchema)
    .set({ layout, status: PhotoBatchStatus.Ready, updatedAt: new Date() })
    .where(eq(batchesSchema.batchId, batch.batchId))

  return json(toApiBatchLayout(batch, layout))
}

async function handleGetImage(
  batchId: string,
  fileId: string,
  url: URL
): Promise<Response> {
  const { photos } = await requireBatch(batchId, url)
  const photo = photos.find((item) => item.fileId === fileId)

  if (!photo) {
    return json({ error: "Image not found" }, 404)
  }

  return s3Response(photo.objectKey, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  })
}

async function handleRender(
  batchId: string,
  url: URL,
  request: Request
): Promise<Response> {
  const { batch, photos } = await requireBatch(batchId, url)
  const body = await readOptionalJson(request)
  const layout = body?.layout
    ? normalizeLayout(body.layout, photos)
    : batch.layout
  const format = normalizeRenderFormat(body?.format)

  if (!layout) {
    return json({ error: "Layout is not ready" }, 400)
  }

  await db
    .update(batchesSchema)
    .set({ layout, status: PhotoBatchStatus.Processing, updatedAt: new Date() })
    .where(eq(batchesSchema.batchId, batch.batchId))

  let rendered: Awaited<ReturnType<typeof renderLayout>>

  try {
    rendered = await renderLayout(batch.batchId, layout, photos, format)
  } catch (error) {
    await db
      .update(batchesSchema)
      .set({ status: PhotoBatchStatus.Failed, updatedAt: new Date() })
      .where(eq(batchesSchema.batchId, batch.batchId))

    throw error
  }

  await db
    .update(batchesSchema)
    .set({
      layout,
      outputKey: rendered.objectKey,
      outputFormat: rendered.format,
      status: PhotoBatchStatus.Completed,
      updatedAt: new Date(),
    })
    .where(eq(batchesSchema.batchId, batch.batchId))

  return json({
    batchId: batch.batchId,
    format: rendered.format,
    outputUrl: renderedUrl(batch.batchId, batch.editToken),
  })
}

async function handleGetRendered(batchId: string, url: URL): Promise<Response> {
  const { batch } = await requireBatch(batchId, url)

  if (!batch.outputKey) {
    return json({ error: "Rendered image not found" }, 404)
  }

  const contentType = batch.outputFormat === "png" ? "image/png" : "image/jpeg"
  const extension =
    batch.outputFormat === "jpeg" ? "jpg" : (batch.outputFormat ?? "png")

  return s3Response(batch.outputKey, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="puzzle-${batch.batchId}.${extension}"`,
      "Cache-Control": "private, max-age=3600",
    },
  })
}

async function s3Response(
  objectKey: string,
  init: ResponseInit
): Promise<Response> {
  const body = await s3Client.file(objectKey).arrayBuffer()

  return new Response(body, init)
}

async function requireBatch(batchId: string, url: URL) {
  const token = url.searchParams.get("token")

  if (!token) {
    throw new ApiError("Token is required", 401)
  }

  const [batch] = await db
    .select()
    .from(batchesSchema)
    .where(
      and(
        eq(batchesSchema.batchId, batchId),
        eq(batchesSchema.editToken, token)
      )
    )

  if (!batch) {
    throw new ApiError("Batch not found", 404)
  }

  const photos = await db
    .select()
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batch.batchId))
    .orderBy(asc(batchPhotosSchema.sortOrder))

  return { batch, photos }
}

function toApiBatchLayout(
  batch: typeof batchesSchema.$inferSelect,
  layout: ShuffleResult
): ApiBatchLayout {
  return {
    batchId: batch.batchId,
    status: batch.status,
    layout: {
      canvas: layout.canvas,
      items: layout.items.map((item) => ({
        ...item,
        src: imageUrl(batch.batchId, batch.editToken, item.id),
      })),
    },
    outputUrl: batch.outputKey
      ? renderedUrl(batch.batchId, batch.editToken)
      : null,
  }
}

function normalizeLayout(raw: unknown, photos: PhotoRow[]): ShuffleResult {
  const value = unwrapLayout(raw)

  if (
    !isRecord(value) ||
    !isRecord(value.canvas) ||
    !Array.isArray(value.items)
  ) {
    throw new ApiError("Invalid layout", 400)
  }

  const photoById = new Map(photos.map((photo) => [photo.fileId, photo]))
  const canvas = {
    width: readPositiveInteger(value.canvas.width, "canvas.width"),
    height: readPositiveInteger(value.canvas.height, "canvas.height"),
  }
  const items = value.items.map((rawItem, index): ShuffleItem => {
    if (!isRecord(rawItem)) {
      throw new ApiError(`items[${index}] must be an object`, 400)
    }

    const id = readString(rawItem.id, `items[${index}].id`)
    const photo = photoById.get(id)

    if (!photo) {
      throw new ApiError(`Unknown image id ${id}`, 400)
    }

    const width = readPositiveInteger(rawItem.width, `items[${index}].width`)
    const height = readPositiveInteger(rawItem.height, `items[${index}].height`)
    const x = readInteger(rawItem.x, `items[${index}].x`)
    const y = readInteger(rawItem.y, `items[${index}].y`)
    const zIndex =
      rawItem.zIndex === undefined
        ? index
        : readInteger(rawItem.zIndex, `items[${index}].zIndex`)

    if (
      x < 0 ||
      y < 0 ||
      x + width > canvas.width ||
      y + height > canvas.height
    ) {
      throw new ApiError(`items[${index}] is outside canvas`, 400)
    }

    return {
      id,
      src: photo.objectKey,
      x,
      y,
      width,
      height,
      scale: typeof rawItem.scale === "number" ? rawItem.scale : 1,
      zIndex,
    }
  })

  return { canvas, items }
}

function unwrapLayout(raw: unknown): unknown {
  if (isRecord(raw) && isRecord(raw.layout)) {
    return raw.layout
  }

  return raw
}

async function readOptionalJson(
  request: Request
): Promise<Record<string, unknown> | null> {
  const text = await request.text()

  if (!text.trim()) {
    return null
  }

  const value = JSON.parse(text)

  if (!isRecord(value)) {
    throw new ApiError("Request body must be an object", 400)
  }

  return value
}

async function readImageSize(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  if (imageUrl === "/test_puzzle.png") {
    return { width: 3168, height: 1782 }
  }

  const url = new URL(
    imageUrl,
    process.env.CLIENT_URL ?? "http://localhost:5173"
  )

  if (url.pathname.startsWith("/api/batches/")) {
    const parts = url.pathname.split("/").filter(Boolean)

    if (parts[3] === "rendered" && parts[2]) {
      const { batch } = await requireBatch(parts[2], url)

      if (!batch.outputKey) {
        throw new ApiError("Rendered image not found", 404)
      }

      return readStoredImageSize(batch.outputKey)
    }
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new ApiError("Puzzle image is not reachable", 400)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Puzzle image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}

async function readStoredImageSize(
  objectKey: string
): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(await s3Client.file(objectKey).arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Puzzle image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}

function imageUrl(batchId: string, token: string, fileId: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/images/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`
}

function renderedUrl(batchId: string, token: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/rendered?token=${encodeURIComponent(token)}`
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  })
}

function readPositiveInteger(value: unknown, name: string): number {
  const number = readInteger(value, name)

  if (number <= 0) {
    throw new ApiError(`${name} must be positive`, 400)
  }

  return number
}

function readInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(`${name} must be a number`, 400)
  }

  return Math.round(value)
}

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(`${name} must be a string`, 400)
  }

  return value
}

function readOptionalNonEmptyString(
  value: unknown,
  name: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return readString(value, name)
}

function readOptionalPositiveInteger(
  value: unknown,
  name: string
): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return readPositiveInteger(value, name)
}

function readOptionalBoundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === null) {
    return fallback
  }

  const number = readInteger(value, name)

  if (number < min || number > max) {
    throw new ApiError(`${name} must be between ${min} and ${max}`, 400)
  }

  return number
}

async function requirePuzzleSession(
  request: Request,
  sessions: PuzzleSessionStore
): Promise<PuzzleSession> {
  const token = readPuzzleAuthToken(request)

  if (!token) {
    throw new ApiError("Puzzle session token required", 401)
  }

  const session = await sessions.getSession(token)

  if (!session) {
    throw new ApiError("Puzzle session not found", 401)
  }

  return session
}

async function requireAuthenticatedUser(
  request: Request,
  auth: TelegramAuthService
) {
  const token = readAuthToken(request)

  if (!token) {
    throw new ApiError("Auth token required", 401)
  }

  const user = await auth.getUser(token)

  if (!user) {
    throw new ApiError("Auth session not found", 401)
  }

  return user
}

function readPuzzleAuthToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim()

    return token || null
  }

  const token = new URL(request.url).searchParams.get("token")?.trim()

  return token || null
}

function readPuzzleProfileInput(value: unknown): {
  name?: string
  color?: string
} {
  const body = isRecord(value) ? value : {}
  const source = isRecord(body.player) ? body.player : body

  return {
    name: readOptionalNonEmptyString(source.name, "name")?.trim(),
    color: readOptionalNonEmptyString(source.color, "color")?.trim(),
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

type PhotoRow = typeof batchPhotosSchema.$inferSelect
