import sharp from "sharp"

import { LIMITS } from "@/config"
import type { CompositionLayout } from "@/native/composition-layout-engine"
import { renderLayout, type RenderPhotoSource } from "@/native/render-layout"
import { getRedisClient, RedisCache } from "@/services/redis"
import { s3Client } from "@/storage/client"
import { telegramPreviewObjectKey } from "@/storage/utils"

let previewFileIds: RedisCache | null = null

export async function writeTelegramPreview(
  compositionId: string,
  layout: CompositionLayout,
  photos: RenderPhotoSource[]
): Promise<void> {
  const preview = await renderLayout(
    scaleLayout(layout, LIMITS.telegram.previewMaxSide),
    photos,
    "jpg",
    {
      jpegQuality: LIMITS.telegram.previewQuality,
      jpegProgressive: true,
    }
  )

  await saveTelegramPreview(compositionId, preview.buffer)
}

export async function writeTelegramPreviewFromImage(
  compositionId: string,
  image: Buffer
): Promise<void> {
  const preview = await sharp(image, {
    failOn: "error",
    limitInputPixels: LIMITS.layout.maxCanvasArea,
  })
    .resize({
      width: LIMITS.telegram.previewMaxSide,
      height: LIMITS.telegram.previewMaxSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "white" })
    .jpeg({
      quality: LIMITS.telegram.previewQuality,
      progressive: true,
      mozjpeg: false,
    })
    .toBuffer()

  await saveTelegramPreview(compositionId, preview)
}

export function getCachedTelegramPreviewFileId(
  objectKey: string
): Promise<string | null> {
  return getPreviewFileIds().get(objectKey)
}

export async function cacheTelegramPreviewFileId(
  objectKey: string | undefined,
  fileId: string | undefined
): Promise<void> {
  if (!objectKey || !fileId) {
    return
  }

  await getPreviewFileIds().set(objectKey, fileId)
}

export function deleteCachedTelegramPreviewFileId(
  objectKey: string
): Promise<void> {
  return getPreviewFileIds().delete(objectKey)
}

async function saveTelegramPreview(
  compositionId: string,
  buffer: Buffer
): Promise<void> {
  const objectKey = telegramPreviewObjectKey(compositionId)

  await s3Client.write(objectKey, buffer, { type: "image/jpeg" })
}

function scaleLayout(
  layout: CompositionLayout,
  maxSide: number
): CompositionLayout {
  const longestSide = Math.max(layout.canvas.width, layout.canvas.height)

  if (longestSide <= maxSide) {
    return layout
  }

  const scale = maxSide / longestSide

  return {
    canvas: {
      width: Math.max(1, Math.round(layout.canvas.width * scale)),
      height: Math.max(1, Math.round(layout.canvas.height * scale)),
    },

    items: layout.items.map((item) => ({
      ...item,
      x: Math.round(item.x * scale),
      y: Math.round(item.y * scale),
      width: Math.max(1, Math.round(item.width * scale)),
      height: Math.max(1, Math.round(item.height * scale)),
      scale: item.scale * scale,
    })),
  }
}

function getPreviewFileIds(): RedisCache {
  previewFileIds ??= new RedisCache(
    getRedisClient(),
    "telegram-preview",
    7 * 24 * 60 * 60
  )

  return previewFileIds
}
