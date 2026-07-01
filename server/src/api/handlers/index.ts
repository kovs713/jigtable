import type { BunRequest } from "bun"
import { and, asc, eq } from "drizzle-orm"
import sharp from "sharp"

import type {
  CreatePuzzleRoomResponse,
  PuzzleSession,
} from "@puzzle-shuffle/puzzle-core"

import {
  readAuthToken,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
  type TelegramAuthService,
} from "../../auth/telegram"
import {
  normalizeRenderFormat,
  renderLayout,
} from "../../features/render-layout"
import { clientPuzzleRoomUrl, publicApiUrl } from "../../features/urls"
import { db } from "../../infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "../../infra/db/shemas"
import { s3Client } from "../../infra/storage"
import {
  createPuzzleSafeAssetRef,
  type PuzzleHistoryStore,
} from "../../puzzle-room/history-store"
import type {
  CreatePuzzleRoomInput,
  PuzzleRoomManager,
} from "../../puzzle-room/room-manager"
import {
  toSessionResponse,
  type PuzzleSessionStore,
} from "../../puzzle-room/session-store"
import type { ShuffleItem, ShuffleResult } from "../../shuffle"
import { CORS_HEADERS } from "../constants"
import { ApiError } from "../types"
import { json, readErrorMessage } from "../utils"

interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: ShuffleResult
  outputUrl: string | null
}

interface PuzzleServices {
  rooms: PuzzleRoomManager
  sessions: PuzzleSessionStore
  history: PuzzleHistoryStore
  auth: TelegramAuthService
}

export async function handleCreatePuzzleRoom(
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

export async function handleGetPuzzleRoom(
  request: BunRequest,
  puzzleRooms: PuzzleRoomManager
): Promise<Response> {
  const roomId = new URL(request.url).searchParams.get("roomId")
  const state = puzzleRooms.getRoomSnapshot(roomId ?? "")

  if (!state) {
    return json({ error: "Room not found or expired" }, 404)
  }

  return json({ state })
}

export async function handleTelegramWebAppAuth(
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

export async function handleTelegramWidgetAuth(
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

export async function handleGetAuthMe(
  request: Request,
  auth: TelegramAuthService
): Promise<Response> {
  const user = await requireAuthenticatedUser(request, auth)

  return json({ user })
}

export async function handleAuthLogout(
  request: Request,
  auth: TelegramAuthService
): Promise<Response> {
  const token = readAuthToken(request)

  if (token) {
    await auth.logout(token)
  }

  return json({ ok: true })
}

export async function handleGetPuzzleHistory(
  request: Request,
  puzzle: PuzzleServices
): Promise<Response> {
  const user = await requireAuthenticatedUser(request, puzzle.auth)
  const history = await puzzle.history.getUserHistory(user.id)

  return json({ history })
}

export async function handleRestorePuzzleSession(
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

export async function handleGetPuzzleSession(
  request: Request,
  sessions: PuzzleSessionStore
): Promise<Response> {
  const session = await requirePuzzleSession(request, sessions)

  return json(toSessionResponse(session))
}

export async function handlePatchPuzzleSession(
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

export async function handleGetLayout(
  batchId: string,
  url: URL
): Promise<Response> {
  const { batch } = await requireBatch(batchId, url)

  if (!batch.layout) {
    return json({ error: "Layout is not ready" }, 404)
  }

  return json(toApiBatchLayout(batch, batch.layout))
}

export async function handlePatchLayout(
  request: BunRequest
): Promise<Response> {
  const url = new URL(request.url)
  const batchId = url.searchParams.get("batchId") ?? ""

  const { batch, photos } = await requireBatch(batchId, url)
  const layout = normalizeLayout(await request.json(), photos)

  await db
    .update(batchesSchema)
    .set({ layout, status: PhotoBatchStatus.Ready, updatedAt: new Date() })
    .where(eq(batchesSchema.batchId, batch.batchId))

  return json(toApiBatchLayout(batch, layout))
}

export async function handleGetImage(request: BunRequest): Promise<Response> {
  const url = new URL(request.url)
  const batchId = url.searchParams.get("batchId") ?? ""
  const fileId = url.searchParams.get("fileId") ?? ""

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

export async function handleRender(request: BunRequest): Promise<Response> {
  const url = new URL(request.url)
  const batchId = url.searchParams.get("batchId") ?? ""

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

export async function handleGetRendered(
  request: BunRequest
): Promise<Response> {
  const url = new URL(request.url)
  const batchId = url.searchParams.get("batchId") ?? ""

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

function readPuzzleAuthToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim()

    return token || null
  }

  const token = new URL(request.url).searchParams.get("token")?.trim()

  return token || null
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

  const url = new URL(imageUrl, process.env.CLIENT_URL)

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

function imageUrl(batchId: string, token: string, fileId: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/images/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`
}

function renderedUrl(batchId: string, token: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/rendered?token=${encodeURIComponent(token)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

type PhotoRow = typeof batchPhotosSchema.$inferSelect

function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(`${name} must be a string`, 400)
  }

  return value
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

async function s3Response(
  objectKey: string,
  init: ResponseInit
): Promise<Response> {
  const body = await s3Client.file(objectKey).arrayBuffer()

  return new Response(body, init)
}
