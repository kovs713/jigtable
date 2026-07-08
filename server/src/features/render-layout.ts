import sharp from "sharp"

import type { CollageLayout } from "@/collage-layout-engine"
import { LIMITS } from "@/config"
import { mapConcurrent } from "@/features/promise-pool"
import { s3Client } from "@/infra/storage"
import { batchRenderObjectKey } from "./object-keys"

export type RenderFormat = "png" | "jpg" | "jpeg"

export interface RenderPhotoSource {
  fileId: string
  objectKey: string
}

export interface RenderResult {
  objectKey: string
  contentType: string
  format: RenderFormat
}

export async function renderLayout(
  batchId: string,
  layout: CollageLayout,
  photos: RenderPhotoSource[],
  format: RenderFormat
): Promise<RenderResult> {
  const sourceById = new Map(photos.map((photo) => [photo.fileId, photo]))
  const items = layout.items
    .map((item, index) => ({ item, index }))
    .sort(
      (first, second) =>
        (first.item.zIndex ?? first.index) -
          (second.item.zIndex ?? second.index) || first.index - second.index
    )
    .map((entry) => entry.item)
  const composites = await mapConcurrent(
    items,
    LIMITS.render.imageFetchConcurrency,
    async (item) => {
      const source = sourceById.get(item.id)
      if (!source) {
        throw new Error(`Missing source image for ${item.id}`)
      }

      const buffer = await s3Client.file(source.objectKey).arrayBuffer()
      const input = await sharp(Buffer.from(buffer))
        .resize(item.width, item.height, { fit: "fill" })
        .toBuffer()

      return {
        input,
        left: item.x,
        top: item.y,
      }
    }
  )
  const base = sharp({
    create: {
      width: layout.canvas.width,
      height: layout.canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites)
  const output =
    format === "png"
      ? await base.png().toBuffer()
      : await base
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 92 })
          .toBuffer()
  const contentType = format === "png" ? "image/png" : "image/jpeg"
  const objectKey = batchRenderObjectKey(batchId, format)

  await s3Client.write(objectKey, output, { type: contentType })

  return { objectKey, contentType, format }
}

export function normalizeRenderFormat(value: unknown): RenderFormat {
  if (value === "png" || value === "jpg" || value === "jpeg") {
    return value
  }

  return "png"
}
