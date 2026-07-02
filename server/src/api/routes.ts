import type { BunRequest } from "bun"
import sharp from "sharp"

import {
  readAuthToken,
  TelegramAuthService,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
  type TelegramAuthProfile,
} from "@/auth"
import { normalizeRenderFormat } from "@/features/render-layout"
import { clientJigsawRoomUrl, publicApiUrl } from "@/features/urls"
import { db } from "@/infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "@/infra/db/schemas"
import { s3Client } from "@/infra/storage"
import { createJigsawSafeAssetRef } from "@/jigsaw-room/history-store"
import type { CreateJigsawRoomInput } from "@/jigsaw-room/room-manager"
import {
  JigsawSessionStore,
  toSessionResponse,
} from "@/jigsaw-room/session-store"
import type { ShuffleItem, ShuffleResult } from "@/shuffle"
import type {
  CreateJigsawRoomResponse,
  JigsawSession,
} from "@jigtable/jigsaw-core"
import { and, asc, eq } from "drizzle-orm"
import { services } from "."
import { CORS_HEADERS } from "./constants"
import { ApiError } from "./types"
import { json, readErrorMessage } from "./utils"

function route(handler: (request: BunRequest) => Response | Promise<Response>) {
  return async (request: BunRequest) => {
    try {
      return await handler(request)
    } catch (error) {
      console.error("API fatal error", error)

      return json(
        { error: readErrorMessage(error) },
        error instanceof ApiError ? error.status : 500
      )
    }
  }
}

export const routes = {
  "/*": {
    OPTIONS: new Response(null, { headers: CORS_HEADERS }),
  },

  "/api/health": {
    GET: json({ ok: true }),
  },

  "/api/auth/telegram-webapp": {
    POST: route(async (request: BunRequest) => {
      const body = await readOptionalJson(request)
      const initData = readOptionalNonEmptyString(body?.initData, "initData")

      if (!initData) {
        throw new ApiError("initData is required", 400)
      }

      try {
        const profile = validateTelegramWebAppInitData(initData)

        return authorize(body, profile)
      } catch (error) {
        throw new ApiError(readErrorMessage(error), 401)
      }
    }),
  },

  "/api/auth/telegram-widget": {
    POST: route(async (request: BunRequest) => {
      const body = await readOptionalJson(request)

      if (!body) {
        throw new ApiError("Telegram payload is required", 400)
      }

      try {
        const profile = validateTelegramLoginWidget(body)

        return authorize(body, profile)
      } catch (error) {
        throw new ApiError(readErrorMessage(error), 401)
      }
    }),
  },

  "/api/auth/me": {
    GET: route(async (request: BunRequest) => {
      const user = await requireAuthenticatedUser(request, services.auth)

      return json({ user })
    }),
  },

  "/api/auth/logout": {
    POST: route(async (request: BunRequest) => {
      const token = readAuthToken(request)

      if (token) {
        await services.auth.logout(token)
      }

      return json({ ok: true })
    }),
  },

  "/api/me/jigsaw-history": {
    GET: route(async (request: BunRequest) => {
      const user = await requireAuthenticatedUser(request, services.auth)
      const history = await services.history.getUserHistory(user.id)

      return json({ history })
    }),
  },

  "/api/jigsaws/sessions": {
    POST: route(async (request: BunRequest) => {
      const body = await readOptionalJson(request)
      const profile = readJigsawProfileInput(body)
      const session = await services.sessions.restoreSession({
        token: readOptionalNonEmptyString(body?.token, "token")?.trim(),
        name: profile.name,
        color: profile.color,
      })

      return json(toSessionResponse(session))
    }),
  },

  "/api/jigsaws/sessions/current": {
    GET: route(async (request: BunRequest) => {
      const session = await requireJigsawSession(request, services.sessions)

      return json(toSessionResponse(session))
    }),

    PATCH: route(async (request: BunRequest) => {
      const token = readJigsawAuthToken(request)

      if (!token) {
        throw new ApiError("Jigsaw session token required", 401)
      }

      const body = await readOptionalJson(request)
      const profile = readJigsawProfileInput(body)
      const session = await services.sessions.updateSession(token, profile)

      if (!session) {
        throw new ApiError("Jigsaw session not found", 401)
      }

      await services.rooms.updateSessionPlayer(session.token, session.player)

      return json(toSessionResponse(session))
    }),
  },

  "/api/jigsaws/rooms": {
    POST: route(async (request: BunRequest) => {
      const body = await readOptionalJson(request)
      const imageUrl = (
        readOptionalNonEmptyString(body?.imageUrl, "imageUrl") ??
        "/test_jigsaw.png"
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
        readOptionalNonEmptyString(body?.assetId, "assetId")?.trim() ??
        "room-image"
      const input = {
        imageUrl,
        assetId,
        assetRef: createJigsawSafeAssetRef({ imageUrl, assetId }),
        sourceSize,
        pieceCount,
      } satisfies CreateJigsawRoomInput
      const state = services.rooms.createRoom(input)

      return json({
        roomId: state.roomId,
        joinUrl: clientJigsawRoomUrl(state.roomId),
        state,
      } satisfies CreateJigsawRoomResponse)
    }),
  },

  "/api/jigsaws/rooms/:roomId": {
    GET: route(async (request: BunRequest) => {
      const roomId = request.params.roomId ?? ""
      const state = services.rooms.getRoomSnapshot(roomId)

      if (!state) {
        return json({ error: "Room not found or expired" }, 404)
      }

      return json({ state })
    }),
  },

  "/api/batches/:batchId/layout": {
    GET: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""

      const { batch } = await requireBatch(batchId, url)

      if (!batch.layout) {
        return json({ error: "Layout is not ready" }, 404)
      }

      return json(toApiBatchLayout(batch, batch.layout))
    }),
    PATCH: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""

      const { batch, photos } = await requireBatch(batchId, url)
      const layout = normalizeLayout(await request.json(), photos)

      await db
        .update(batchesSchema)
        .set({ layout, status: PhotoBatchStatus.Ready, updatedAt: new Date() })
        .where(eq(batchesSchema.batchId, batch.batchId))

      return json(toApiBatchLayout(batch, layout))
    }),
  },

  "/api/batches/:batchId/images/:fileId": {
    GET: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""
      const fileId = request.params.fileId ?? ""

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
    }),
  },

  "/api/batches/:batchId/render": {
    POST: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""

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
        .set({
          layout,
          status: PhotoBatchStatus.Processing,
          updatedAt: new Date(),
        })
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
    }),
  },

  "/api/batches/:batchId/rendered": {
    GET: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""

      const { batch } = await requireBatch(batchId, url)

      if (!batch.outputKey) {
        return json({ error: "Rendered image not found" }, 404)
      }

      const contentType =
        batch.outputFormat === "png" ? "image/png" : "image/jpeg"
      const extension =
        batch.outputFormat === "jpeg" ? "jpg" : (batch.outputFormat ?? "png")

      return s3Response(batch.outputKey, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="jigsaw-${batch.batchId}.${extension}"`,
          "Cache-Control": "private, max-age=3600",
        },
      })
    }),
  },
}

function readJigsawProfileInput(value: unknown): {
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
  request: BunRequest,
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

async function requireJigsawSession(
  request: BunRequest,
  sessions: JigsawSessionStore
): Promise<JigsawSession> {
  const token = readJigsawAuthToken(request)

  if (!token) {
    throw new ApiError("Jigsaw session token required", 401)
  }

  const session = await sessions.getSession(token)

  if (!session) {
    throw new ApiError("Jigsaw session not found", 401)
  }

  return session
}

function readJigsawAuthToken(request: BunRequest): string | null {
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
  request: BunRequest
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
  if (imageUrl === "/test_jigsaw.png") {
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
    throw new ApiError("Jigsaw image is not reachable", 400)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}

async function readStoredImageSize(
  objectKey: string
): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(await s3Client.file(objectKey).arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
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

  if (!batchId) {
    throw new ApiError("Batch id is required", 400)
  }

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

async function authorize(
  body: Record<string, unknown> | null,
  profile: TelegramAuthProfile
): Promise<Response> {
  const anonSessionToken = readOptionalNonEmptyString(
    body?.anonSessionToken,
    "anonSessionToken"
  )?.trim()
  const anonSession = anonSessionToken
    ? await services.sessions.getSession(anonSessionToken)
    : null
  const auth = await services.auth.login(profile, {
    name: anonSession?.player.name,
    color: anonSession?.player.color,
  })

  if (anonSessionToken) {
    await services.sessions.linkSessionToUser(anonSessionToken, auth.user.id)
    await services.history.linkAnonSessionToUser(anonSessionToken, auth.user.id)
  }

  return json(auth)
}

interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: ShuffleResult
  outputUrl: string | null
}
