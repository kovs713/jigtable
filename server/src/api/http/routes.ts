import { and, count, desc, eq, or } from "drizzle-orm"

import type { CreateJigsawRoomResponse } from "@jigtable/core/protocol"
import { apiRoutes } from "@jigtable/shared/api-routes"
import { number, optional, string } from "@jigtable/shared/schemas"

import { readJigsawProfileInput } from "@/api/schemas/jigsaw"
import { LIMITS } from "@/config"
import { db } from "@/db"
import {
  compositionSourceImagesSchema,
  compositionsSchema,
  CompositionStatus,
} from "@/db/schemas"
import { renderLayout, resolveRenderFormat } from "@/native/render-layout"
import {
  authorizeTelegramProfile,
  readAuthToken,
  validateTelegramLoginWidget,
  validateTelegramWebAppInitData,
} from "@/services/auth"
import { readJigsawAuthToken } from "@/services/auth/auth-utils"
import { createJigsawSafeAssetRef } from "@/services/history"
import type { CreateJigsawRoomInput } from "@/services/room"
import { toSessionResponse } from "@/services/session"
import { s3Client } from "@/storage/client"
import { jigsawImageObjectKey } from "@/storage/utils"
import {
  jigsawImageUrl,
  toApiCompositionLayout,
} from "../presenters/compositions"
import { normalizeCompositionLayout } from "../schemas/layout"
import { getCompositionAndImagesByIdAndToken } from "./composition-access"
import { ApiError } from "./errors"
import { CORS_HEADERS } from "./headers"
import { readRemoteImageSize } from "./image-metadata"
import { rateLimit, resolveAuth, resolveJigsawSession } from "./middleware"
import { parseApiSchema, readJsonLimited } from "./request"
import type { Router } from "./router"

export function registerRoutes(router: Router): void {
  router.get(apiRoutes.health.get.pattern, {
    handler: () => Response.json({ ok: true }),
  })

  // auth
  router.post(apiRoutes.auth.post.telegram.webapp.pattern, {
    handler: async (context) => {
      const body = await readJsonLimited(context.request)
      const initData = parseApiSchema(string(), body?.initData, "initData")

      const profile = validateTelegramWebAppInitData(initData)

      return authorizeTelegramProfile(context, body, profile)
    },
  })

  router.post(apiRoutes.auth.post.telegram.widget.pattern, {
    handler: async (context) => {
      const body = await readJsonLimited(context.request)

      if (!body) {
        throw new ApiError("Telegram payload is required", 400)
      }

      const profile = validateTelegramLoginWidget(body)

      return authorizeTelegramProfile(context, body, profile)
    },
  })

  router.get(apiRoutes.auth.get.me.pattern, {
    middleware: [resolveAuth()],

    handler: (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const { session } = context.auth

      return Response.json({
        user: session.user,
        expiresAt: session.expiresAt,
      })
    },
  })

  router.post(apiRoutes.auth.post.devLogin.pattern, {
    handler: async (context) => {
      const hostname = new URL(context.request.url).hostname

      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        throw new ApiError("Not found", 404)
      }

      const body = await readJsonLimited(context.request)
      const telegramId = body?.telegramId
        ? parseApiSchema(string(), body.telegramId, "telegramId")
        : undefined

      const session = await context.services.auth.loginDev(telegramId)

      return Response.json(session)
    },
  })

  router.post(apiRoutes.auth.post.logout.pattern, {
    handler: async (context) => {
      const token = readAuthToken(context.request)

      if (token) {
        await context.services.auth.logout(token)
      }

      return Response.json({ ok: true })
    },
  })

  router.get(apiRoutes.auth.get.history.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const history = await context.services.history.getUserHistory(
        context.auth.session.user.id
      )

      return Response.json({ history })
    },
  })

  // sessions
  router.post(apiRoutes.sessions.post.pattern, {
    middleware: [
      rateLimit({
        scope: "jigsaw-session",
        limit: LIMITS.jigsaw.createSessionPerIpPerMinute,
        windowMs: 60_000,
      }),
      resolveAuth(),
    ],

    handler: async (context) => {
      const body = await readJsonLimited(context.request)

      const authUser =
        context.auth?.status === "authenticated"
          ? context.auth.session.user
          : null

      const roomId = parseApiSchema(
        optional(string()),
        body?.roomId,
        "roomId"
      )?.trim()

      if (
        !authUser &&
        (!roomId || !context.services.rooms.getRoomSnapshot(roomId))
      ) {
        throw new ApiError("Valid room invite required", 401)
      }

      const profile = readJigsawProfileInput(body)

      let session = await context.services.sessions.restoreSession({
        token: parseApiSchema(optional(string()), body?.token, "token")?.trim(),
        name: profile.name,
        color: profile.color,
      })

      if (authUser) {
        session =
          (await context.services.sessions.linkSessionToUser(
            session.token,
            authUser.id
          )) ?? session
      }

      return Response.json(toSessionResponse(session))
    },
  })

  router.get(apiRoutes.sessions.get.current.pattern, {
    middleware: [resolveJigsawSession()],

    handler: async (context) => {
      if (context.jigsaw?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      return Response.json(toSessionResponse(context.jigsaw.session))
    },
  })

  router.patch(apiRoutes.sessions.patch.current.pattern, {
    handler: async (context) => {
      const token = readJigsawAuthToken(context.request)

      if (!token) {
        throw new ApiError("Jigsaw session token required", 401)
      }

      const body = await readJsonLimited(context.request)
      const profile = readJigsawProfileInput(body)
      const session = await context.services.sessions.updateSession(
        token,
        profile
      )

      if (!session) {
        throw new ApiError("Jigsaw session not found", 401)
      }

      await context.services.rooms.updateSessionPlayer(
        session.token,
        session.player
      )

      if (session.userId) {
        await context.services.auth
          .updateProfile(session.userId, {
            displayName: session.player.name,
          })
          .catch((error) =>
            console.error("Failed to update user displayName", error)
          )
      }

      return Response.json(toSessionResponse(session))
    },
  })

  router.post(apiRoutes.rooms.post.pattern, {
    middleware: [
      resolveAuth(),
      rateLimit({
        scope: "jigsaw-room",
        limit: LIMITS.jigsaw.createRoomPerIpPerMinute,
        windowMs: 60_000,
      }),
    ],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const body = await readJsonLimited(context.request)

      const compositionId = parseApiSchema(
        optional(string()),
        body?.compositionId,
        "compositionId"
      )?.trim()

      const compositionToken = parseApiSchema(
        optional(string()),
        body?.compositionToken,
        "compositionToken"
      )?.trim()

      if (Boolean(compositionId) !== Boolean(compositionToken)) {
        throw new ApiError(
          "compositionId and compositionToken must be provided together",
          400
        )
      }

      const pieceCount =
        parseApiSchema(
          optional(
            number({
              min: LIMITS.jigsaw.minPieceCount,
              max: LIMITS.jigsaw.maxPieceCount,
            })
          ),
          body?.pieceCount,
          "pieceCount"
        ) ?? 150

      let imageUrl: string
      let assetId: string

      let sourceSize: {
        width: number
        height: number
      }

      if (compositionId && compositionToken) {
        const { composition, sourceImages } =
          await getCompositionAndImagesByIdAndToken(
            compositionId,
            compositionToken
          )

        if (!composition.layout) {
          throw new ApiError("Composition layout is not ready", 400)
        }

        const format = "png" as const

        const rendered = await renderLayout(
          composition.layout,
          sourceImages,
          format
        )

        const objectKey = jigsawImageObjectKey(compositionId, format)

        await s3Client.write(objectKey, rendered.buffer, {
          type: rendered.contentType,
        })

        await db
          .update(compositionsSchema)
          .set({
            jigsawImageFormat: format,
            status: CompositionStatus.Completed,
            updatedAt: new Date(),
          })
          .where(eq(compositionsSchema.compositionId, compositionId))

        imageUrl = jigsawImageUrl(compositionId, compositionToken)

        assetId = `composition-${compositionId}`

        sourceSize = {
          width: composition.layout.canvas.width,
          height: composition.layout.canvas.height,
        }
      } else {
        imageUrl = (
          parseApiSchema(optional(string()), body?.imageUrl, "imageUrl") ??
          "/test_jigsaw.png"
        ).trim()

        assetId =
          parseApiSchema(
            optional(string()),
            body?.assetId,
            "assetId"
          )?.trim() ?? "room-image"

        const sourceWidth = parseApiSchema(
          optional(number({ min: 1 })),
          body?.sourceWidth,
          "sourceWidth"
        )

        const sourceHeight = parseApiSchema(
          optional(number({ min: 1 })),
          body?.sourceHeight,
          "sourceHeight"
        )

        if ((sourceWidth === undefined) !== (sourceHeight === undefined)) {
          throw new ApiError(
            "sourceWidth and sourceHeight must be provided together",
            400
          )
        }

        sourceSize =
          sourceWidth !== undefined && sourceHeight !== undefined
            ? {
                width: sourceWidth,
                height: sourceHeight,
              }
            : await readRemoteImageSize(imageUrl)
      }

      const input = {
        imageUrl,
        assetId,
        assetRef: createJigsawSafeAssetRef({
          imageUrl,
          assetId,
        }),
        sourceSize,
        pieceCount,
      } satisfies CreateJigsawRoomInput

      const state = context.services.rooms.createRoom(input)

      return Response.json({
        roomId: state.roomId,
        joinUrl: new URL(
          `/rooms/${encodeURIComponent(state.roomId)}`,
          process.env.CLIENT_URL
        ).toString(),
        state,
      } satisfies CreateJigsawRoomResponse)
    },
  })

  router.get(apiRoutes.rooms.get.byRoomId.pattern, {
    handler: (context) => {
      const roomId = context.params.roomId ?? ""
      const state = context.services.rooms.getRoomSnapshot(roomId)

      if (!state) {
        throw new ApiError("Room not found or expired", 404)
      }

      return Response.json({ state })
    },
  })

  router.get(apiRoutes.rooms.get.result.byRoomId.pattern, {
    handler: async (context) => {
      const roomId = context.params.roomId ?? ""
      const result = await context.services.history.getRoomResult(roomId)

      if (!result) {
        throw new ApiError("Result not found", 404)
      }

      return Response.json({ result })
    },
  })

  router.get(apiRoutes.compositions.get.me.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const user = context.auth.session.user

      const sourceImageCounts = db
        .select({
          compositionId: compositionSourceImagesSchema.compositionId,
          imageCount: count(compositionSourceImagesSchema.fileId).as(
            "image_count"
          ),
        })
        .from(compositionSourceImagesSchema)
        .groupBy(compositionSourceImagesSchema.compositionId)
        .as("source_image_counts")

      const rows = await db
        .select({
          compositionId: compositionsSchema.compositionId,
          compositionToken: compositionsSchema.editToken,
          status: compositionsSchema.status,
          createdAt: compositionsSchema.createdAt,
          layout: compositionsSchema.layout,
          imageCount: sourceImageCounts.imageCount,
        })
        .from(compositionsSchema)
        .leftJoin(
          sourceImageCounts,
          eq(sourceImageCounts.compositionId, compositionsSchema.compositionId)
        )
        .where(
          and(
            or(
              eq(compositionsSchema.userId, user.telegramId),
              eq(compositionsSchema.userId, user.id)
            ),
            or(
              eq(compositionsSchema.status, CompositionStatus.Ready),
              eq(compositionsSchema.status, CompositionStatus.Completed)
            )
          )
        )
        .orderBy(desc(compositionsSchema.createdAt))
        .limit(20)

      const items = rows.map((row) => ({
        compositionId: row.compositionId,
        compositionToken: row.compositionToken,
        status: row.status,
        createdAt: row.createdAt?.toISOString() ?? null,
        imageCount: row.imageCount ?? 0,
        canvas: row.layout?.canvas ?? null,
      }))

      return Response.json({
        compositions: items,
      })
    },
  })

  router.get(apiRoutes.compositions.get.layout.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const compositionId = context.params.compositionId ?? ""
      const editToken = context.query.get("token") ?? ""

      const { composition } = await getCompositionAndImagesByIdAndToken(
        compositionId,
        editToken
      )

      if (!composition.layout) {
        throw new ApiError("Layout is not ready", 404)
      }

      return Response.json(
        toApiCompositionLayout(composition, composition.layout)
      )
    },
  })

  router.patch(apiRoutes.compositions.patch.layout.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const compositionId = context.params.compositionId ?? ""

      const { composition, sourceImages } =
        await getCompositionAndImagesByIdAndToken(
          compositionId,
          context.auth.session.token
        )

      const layout = normalizeCompositionLayout(
        await readJsonLimited(context.request),
        sourceImages
      )

      await db
        .update(compositionsSchema)
        .set({
          layout,
          status: CompositionStatus.Ready,
          updatedAt: new Date(),
        })
        .where(eq(compositionsSchema.compositionId, composition.compositionId))

      return Response.json(toApiCompositionLayout(composition, layout))
    },
  })

  router.get(apiRoutes.compositions.get.image.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const compositionId = context.params.compositionId ?? ""
      const fileId = context.params.fileId ?? ""

      const { sourceImages } = await getCompositionAndImagesByIdAndToken(
        compositionId,
        context.auth.session.token
      )

      const photo = sourceImages.find((item) => item.fileId === fileId)

      if (!photo) {
        throw new ApiError("Image not found", 404)
      }

      const body = await s3Client.file(photo.objectKey).arrayBuffer()

      return new Response(body, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": photo.contentType,
          "Cache-Control": "private, max-age=3600",
        },
      })
    },
  })

  router.post(apiRoutes.compositions.post.render.pattern, {
    middleware: [resolveAuth()],

    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const compositionId = context.params.compositionId ?? ""

      const { composition, sourceImages } =
        await getCompositionAndImagesByIdAndToken(
          compositionId,
          context.auth.session.token
        )

      const body = await readJsonLimited(context.request)

      const layout = body?.layout
        ? normalizeCompositionLayout(body.layout, sourceImages)
        : composition.layout

      const format = resolveRenderFormat(body?.format)

      if (!layout) {
        throw new ApiError("Layout is not ready", 400)
      }

      await db
        .update(compositionsSchema)
        .set({
          layout,
          status: CompositionStatus.Processing,
          updatedAt: new Date(),
        })
        .where(eq(compositionsSchema.compositionId, composition.compositionId))

      try {
        const rendered = await renderLayout(layout, sourceImages, format)

        const objectKey = jigsawImageObjectKey(
          composition.compositionId,
          format
        )

        await s3Client.write(objectKey, rendered.buffer, {
          type: rendered.contentType,
        })
      } catch (error) {
        await db
          .update(compositionsSchema)
          .set({
            status: CompositionStatus.Failed,
            updatedAt: new Date(),
          })
          .where(
            eq(compositionsSchema.compositionId, composition.compositionId)
          )

        throw error
      }

      await db
        .update(compositionsSchema)
        .set({
          layout,
          jigsawImageFormat: format,
          status: CompositionStatus.Completed,
          updatedAt: new Date(),
        })
        .where(eq(compositionsSchema.compositionId, composition.compositionId))

      return Response.json({
        compositionId: composition.compositionId,
        format,
        jigsawImageUrl: jigsawImageUrl(
          composition.compositionId,
          composition.editToken
        ),
      })
    },
  })

  router.get(apiRoutes.compositions.get.rendered.pattern, {
    handler: async (context) => {
      if (context.auth?.status !== "authenticated") {
        throw new ApiError("Unauthorized", 401)
      }

      const compositionId = context.params.compositionId ?? ""

      const { composition } = await getCompositionAndImagesByIdAndToken(
        compositionId,
        context.auth.session.token
      )

      const format = resolveRenderFormat(composition.jigsawImageFormat)

      const objectKey = jigsawImageObjectKey(composition.compositionId, format)

      let body: ArrayBuffer

      try {
        body = await s3Client.file(objectKey).arrayBuffer()
      } catch {
        throw new ApiError("Rendered image not found", 404)
      }

      const contentType = format === "png" ? "image/png" : "image/jpeg"

      const extension = format === "jpeg" ? "jpg" : format

      return new Response(body, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": contentType,
          "Content-Disposition":
            `attachment; filename="jigsaw-` +
            `${composition.compositionId}.${extension}"`,
          "Cache-Control": "private, max-age=3600",
        },
      })
    },
  })
}
