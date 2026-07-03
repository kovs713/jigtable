import type { BunRequest } from "bun"
import { and, asc, eq } from "drizzle-orm"
import sharp from "sharp"

import {
  isWhitelistDeniedError,
  readAuthToken,
  TelegramAuthService,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
  type TelegramAuthProfile,
} from "@/auth"
import { LIMITS } from "@/config"
import { normalizeRenderFormat, renderLayout } from "@/features/render-layout"
import { clientJigsawRoomUrl } from "@/features/urls"
import { db } from "@/infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "@/infra/db/schemas"
import { readOriginEnv, readRequiredEnv } from "@/infra/env"
import { s3Client } from "@/infra/storage"
import { createJigsawSafeAssetRef } from "@/jigsaw-room/history-store"
import type { CreateJigsawRoomInput } from "@/jigsaw-room/room-manager"
import {
  JigsawSessionStore,
  toSessionResponse,
} from "@/jigsaw-room/session-store"
import type {
  CreateJigsawRoomResponse,
  JigsawSession,
} from "@jigtable/jigsaw-core"
import { services } from "."
import { CORS_HEADERS } from "./constants"
import { ApiError } from "./types"
import {
  imageUrl,
  isRecord,
  json,
  normalizeLayout,
  readErrorMessage,
  readOptionalBoundedInteger,
  readOptionalJson,
  readOptionalNonEmptyString,
  readOptionalPositiveInteger,
  renderedUrl,
  route,
  toApiBatchLayout,
} from "./utils"

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
        throw toAuthApiError(error)
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
        throw toAuthApiError(error)
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
      assertRateLimit(
        request,
        "jigsaw-session",
        LIMITS.jigsaw.createSessionPerIpPerMinute
      )

      const body = await readOptionalJson(request)
      const authUser = await readOptionalAuthenticatedUser(
        request,
        services.auth
      )
      const roomId = readOptionalNonEmptyString(body?.roomId, "roomId")?.trim()

      if (!authUser && (!roomId || !services.rooms.getRoomSnapshot(roomId))) {
        throw new ApiError("Invite link required", 401)
      }

      const profile = readJigsawProfileInput(body)
      let session = await services.sessions.restoreSession({
        token: readOptionalNonEmptyString(body?.token, "token")?.trim(),
        name: profile.name,
        color: profile.color,
      })

      if (authUser) {
        session =
          (await services.sessions.linkSessionToUser(
            session.token,
            authUser.id
          )) ?? session
      }

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
      await requireAuthenticatedUser(request, services.auth)
      assertRateLimit(
        request,
        "jigsaw-room",
        LIMITS.jigsaw.createRoomPerIpPerMinute
      )

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

      const { batch } = await requireAuthorizedBatch(request, batchId, url)

      if (!batch.layout) {
        return json({ error: "Layout is not ready" }, 404)
      }

      return json({
        batchId: batch.batchId,
        status: batch.status,
        layout: {
          canvas: batch.layout.canvas,
          items: batch.layout.items.map((item) => ({
            ...item,
            src: imageUrl(batch.batchId, batch.editToken, item.id),
          })),
        },
        outputUrl: batch.outputKey
          ? renderedUrl(batch.batchId, batch.editToken)
          : null,
      })
    }),
    PATCH: route(async (request: BunRequest) => {
      const url = new URL(request.url)
      const batchId = request.params.batchId ?? ""

      const { batch, photos } = await requireAuthorizedBatch(
        request,
        batchId,
        url
      )
      const layout = normalizeLayout(await readOptionalJson(request), photos)

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

      const body = await s3Client.file(photo.objectKey).arrayBuffer()

      return new Response(body, {
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

      const { batch, photos } = await requireAuthorizedBatch(
        request,
        batchId,
        url
      )
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

      const body = await s3Client.file(batch.outputKey).arrayBuffer()

      return new Response(body, {
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

const rateLimits = new Map<string, { resetAt: number; count: number }>()

function assertRateLimit(
  request: BunRequest,
  scope: string,
  limit: number
): void {
  const now = Date.now()
  const key = `${scope}:${readClientIp(request)}`
  const current = rateLimits.get(key)

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { resetAt: now + 60_000, count: 1 })
    return
  }

  current.count += 1

  if (current.count > limit) {
    throw new ApiError("Too many requests", 429, "RATE_LIMITED")
  }
}

function readClientIp(request: BunRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  )
}

async function readOptionalAuthenticatedUser(
  request: BunRequest,
  auth: TelegramAuthService
) {
  const token = readAuthToken(request)

  if (!token) {
    return null
  }

  const user = await auth.getUser(token)

  if (!user) {
    throw new ApiError("Auth session not found", 401)
  }

  return user
}

async function requireAuthorizedBatch(
  request: BunRequest,
  batchId: string,
  url: URL
) {
  await requireAuthenticatedUser(request, services.auth)

  return requireBatch(batchId, url)
}

function toAuthApiError(error: unknown): ApiError {
  return new ApiError(
    readErrorMessage(error),
    isWhitelistDeniedError(error) ? 403 : 401
  )
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

async function readImageSize(
  imageUrl: string
): Promise<{ width: number; height: number }> {
  if (imageUrl === "/test_jigsaw.png") {
    return { width: 3168, height: 1782 }
  }

  const url = new URL(imageUrl, readRequiredEnv("CLIENT_URL"))

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

  assertJigsawImageFetchAllowed(url)

  const response = await fetch(url)

  if (!response.ok) {
    throw new ApiError("Jigsaw image is not reachable", 400)
  }

  const contentLength = response.headers.get("content-length")

  if (contentLength && Number(contentLength) > 25 * 1024 * 1024) {
    throw new ApiError("Jigsaw image is too large", 400)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}

function assertJigsawImageFetchAllowed(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError("Jigsaw image URL must be HTTP(S)", 400)
  }

  const allowedOrigins = new Set([
    readOriginEnv("CLIENT_URL"),
    readOriginEnv("PUBLIC_API_URL"),
  ])

  if (!allowedOrigins.has(url.origin)) {
    throw new ApiError("Jigsaw image origin is not allowed", 400)
  }
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
