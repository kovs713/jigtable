import { normalizeRenderFormat, renderLayout } from "@/features/render-layout"
import { db } from "@/infra/db"
import { batchesSchema, PhotoBatchStatus } from "@/infra/db/schemas"
import { s3Client } from "@/infra/storage"
import { eq } from "drizzle-orm"

import { CORS_HEADERS } from "../constants"
import { errorResponse } from "../errors"
import { requireAuthorizedBatch, requireBatch } from "../http/batches"
import { renderedUrl, toApiBatchLayout } from "../presenters/batches"
import { normalizeLayout } from "../schemas/layout"
import type { Router } from "../types"
import { readJsonLimited } from "../utils"

export function registerBatchRoutes(router: Router): void {
  router.get("/api/batches/:batchId/layout", {
    handler: async (context) => {
      const url = new URL(context.request.url)
      const batchId = context.params.batchId ?? ""
      const { batch } = await requireAuthorizedBatch(context, batchId, url)

      if (!batch.layout) {
        return errorResponse("Layout is not ready", 404)
      }

      return Response.json(toApiBatchLayout(batch, batch.layout))
    },
  })

  router.patch("/api/batches/:batchId/layout", {
    handler: async (context) => {
      const url = new URL(context.request.url)
      const batchId = context.params.batchId ?? ""
      const { batch, photos } = await requireAuthorizedBatch(
        context,
        batchId,
        url
      )
      const layout = normalizeLayout(
        await readJsonLimited(context.request),
        photos
      )

      await db
        .update(batchesSchema)
        .set({ layout, status: PhotoBatchStatus.Ready, updatedAt: new Date() })
        .where(eq(batchesSchema.batchId, batch.batchId))

      return Response.json(toApiBatchLayout(batch, layout))
    },
  })

  router.get("/api/batches/:batchId/images/:fileId", {
    handler: async (context) => {
      const url = new URL(context.request.url)
      const batchId = context.params.batchId ?? ""
      const fileId = context.params.fileId ?? ""
      const { photos } = await requireBatch(batchId, url)
      const photo = photos.find((item) => item.fileId === fileId)

      if (!photo) {
        return errorResponse("Image not found", 404)
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

  router.post("/api/batches/:batchId/render", {
    handler: async (context) => {
      const url = new URL(context.request.url)
      const batchId = context.params.batchId ?? ""
      const { batch, photos } = await requireAuthorizedBatch(
        context,
        batchId,
        url
      )
      const body = await readJsonLimited(context.request)
      const layout = body?.layout
        ? normalizeLayout(body.layout, photos)
        : batch.layout
      const format = normalizeRenderFormat(body?.format)

      if (!layout) {
        return errorResponse("Layout is not ready", 400)
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

      return Response.json({
        batchId: batch.batchId,
        format: rendered.format,
        outputUrl: renderedUrl(batch.batchId, batch.editToken),
      })
    },
  })

  router.get("/api/batches/:batchId/rendered", {
    handler: async (context) => {
      const url = new URL(context.request.url)
      const batchId = context.params.batchId ?? ""
      const { batch } = await requireBatch(batchId, url)

      if (!batch.outputKey) {
        return errorResponse("Rendered image not found", 404)
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
    },
  })
}
