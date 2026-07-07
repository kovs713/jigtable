import { LIMITS } from "@/config"
import { clientJigsawRoomUrl } from "@/features/urls"
import { renderLayout } from "@/features/render-layout"
import { createJigsawSafeAssetRef } from "@/jigsaw-room/history-store"
import type { CreateJigsawRoomInput } from "@/jigsaw-room/room-manager"
import { toSessionResponse } from "@/jigsaw-room/session-store"
import type { CreateJigsawRoomResponse } from "@jigtable/jigsaw-core"
import { db } from "@/infra/db"
import { batchesSchema, batchPhotosSchema, PhotoBatchStatus } from "@/infra/db/schemas"
import { and, asc, eq } from "drizzle-orm"
import { number, optional, string } from "@jigtable/shared"

import { errorResponse, ApiError } from "../errors"
import {
  readJigsawAuthToken,
  readOptionalAuthenticatedUser,
  requireAuthenticatedUser,
  requireJigsawSession,
} from "../http/auth"
import { readImageSize } from "../http/images"
import { assertRateLimit } from "../http/rate-limit"
import { readJigsawProfileInput } from "../schemas/jigsaw"
import type { Router } from "../types"
import { parseApiSchema, readJsonLimited } from "../utils"

export function registerJigsawRoutes(router: Router): void {
  router.post("/api/sessions", {
    handler: async (context) => {
      assertRateLimit(
        context.request,
        "jigsaw-session",
        LIMITS.jigsaw.createSessionPerIpPerMinute
      )

      const body = await readJsonLimited(context.request)
      const authUser = await readOptionalAuthenticatedUser(
        context.request,
        context.services.auth
      )
      const roomId = parseApiSchema(
        optional(string()),
        body?.roomId,
        "roomId"
      )?.trim()

      if (
        !authUser &&
        (!roomId || !context.services.rooms.getRoomSnapshot(roomId))
      ) {
        throw new ApiError("Invite link required", 401)
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

  router.get("/api/sessions/current", {
    handler: async (context) => {
      const session = await requireJigsawSession(
        context.request,
        context.services.sessions
      )

      return Response.json(toSessionResponse(session))
    },
  })

  router.patch("/api/sessions/current", {
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

      return Response.json(toSessionResponse(session))
    },
  })

  router.post("/api/rooms", {
    handler: async (context) => {
      await requireAuthenticatedUser(context.request, context.services.auth)
      assertRateLimit(
        context.request,
        "jigsaw-room",
        LIMITS.jigsaw.createRoomPerIpPerMinute
      )

      const body = await readJsonLimited(context.request)
      const batchId = parseApiSchema(
        optional(string()),
        body?.batchId,
        "batchId"
      )?.trim()
      const batchToken = parseApiSchema(
        optional(string()),
        body?.batchToken,
        "batchToken"
      )?.trim()

      let roomImageUrl: string
      let sourceWidth: number | undefined
      let sourceHeight: number | undefined
      let assetId = parseApiSchema(
        optional(string()),
        body?.assetId,
        "assetId"
      )?.trim() ?? "room-image"

      if (batchId && batchToken) {
        const [batch, photos] = await Promise.all([
          db
            .select()
            .from(batchesSchema)
            .where(
              and(
                eq(batchesSchema.batchId, batchId),
                eq(batchesSchema.editToken, batchToken)
              )
            )
            .then((rows) => rows[0]),
          db
            .select()
            .from(batchPhotosSchema)
            .where(eq(batchPhotosSchema.batchId, batchId))
            .orderBy(asc(batchPhotosSchema.sortOrder)),
        ])

        if (!batch) {
          throw new ApiError("Batch not found", 404)
        }

        const layout = batch.layout
        if (!layout) {
          throw new ApiError("Batch layout is not ready", 400)
        }

        const rendered = await renderLayout(
          batchId,
          layout,
          photos.map((p) => ({ fileId: p.fileId, objectKey: p.objectKey })),
          "png"
        )

        await db
          .update(batchesSchema)
          .set({
            outputKey: rendered.objectKey,
            outputFormat: rendered.format,
            status: PhotoBatchStatus.Completed,
            updatedAt: new Date(),
          })
          .where(eq(batchesSchema.batchId, batchId))

        roomImageUrl = `${process.env.PUBLIC_API_URL ?? ""}/api/batches/${batchId}/rendered?token=${batchToken}`
        sourceWidth = layout.canvas.width
        sourceHeight = layout.canvas.height
        assetId = `batch-${batchId}`
      } else {
        roomImageUrl = (
          parseApiSchema(optional(string()), body?.imageUrl, "imageUrl") ??
          "/test_jigsaw.png"
        ).trim()
        sourceWidth = parseApiSchema(
          optional(number({ min: 1 })),
          body?.sourceWidth,
          "sourceWidth"
        )
        sourceHeight = parseApiSchema(
          optional(number({ min: 1 })),
          body?.sourceHeight,
          "sourceHeight"
        )
      }

      const pieceCount =
        parseApiSchema(
          optional(number({ min: 4, max: 2_000 })),
          body?.pieceCount,
          "pieceCount"
        ) ?? 150

      const sourceSize =
        sourceWidth && sourceHeight
          ? { width: sourceWidth, height: sourceHeight }
          : await readImageSize(context, roomImageUrl)
      const input = {
        imageUrl: roomImageUrl,
        assetId,
        assetRef: createJigsawSafeAssetRef({ imageUrl: roomImageUrl, assetId }),
        sourceSize,
        pieceCount,
      } satisfies CreateJigsawRoomInput
      const state = context.services.rooms.createRoom(input)

      return Response.json({
        roomId: state.roomId,
        joinUrl: clientJigsawRoomUrl(state.roomId),
        state,
      } satisfies CreateJigsawRoomResponse)
    },
  })

  router.get("/api/rooms/:roomId", {
    handler: (context) => {
      const roomId = context.params.roomId ?? ""
      const state = context.services.rooms.getRoomSnapshot(roomId)

      if (!state) {
        return errorResponse("Room not found or expired", 404)
      }

      return Response.json({ state })
    },
  })

  router.get("/api/rooms/:roomId/result", {
    handler: async (context) => {
      const roomId = context.params.roomId ?? ""
      const result = await context.services.history.getRoomResult(roomId)

      if (!result) {
        return errorResponse("Result not found", 404)
      }

      return Response.json({ result })
    },
  })
}
