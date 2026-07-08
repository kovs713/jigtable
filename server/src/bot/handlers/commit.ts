import { asc, eq } from "drizzle-orm"

import type { BotContext } from "@/bot/types"
import { getActiveImages } from "@/bot/upload"
import { renderLayout } from "@/features/render-layout"
import { clientLayoutUrl } from "@/features/urls"
import { db } from "@/infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "@/infra/db/schemas"
import {
  generateCollageLayout,
  type CollageLayout,
} from "@/collage-layout-engine"

const PREVIEW_MAX_SIDE = 1200

export async function handleCommit(ctx: BotContext): Promise<void> {
  if (!ctx.session.isStarted || !ctx.session.activeBatchId) {
    await ctx.reply("Нет активного батча. Начни через /new")
    return
  }

  const [batch] = await db
    .select()
    .from(batchesSchema)
    .where(eq(batchesSchema.batchId, ctx.session.activeBatchId))

  if (!batch) {
    await ctx.reply("active batch не найден, начни заново через /new")
    return
  }

  if (
    batch.status === PhotoBatchStatus.Ready ||
    batch.status === PhotoBatchStatus.Completed
  ) {
    const allPhotos = await db
      .select()
      .from(batchPhotosSchema)
      .where(eq(batchPhotosSchema.batchId, batch.batchId))
    await replyWithEditorLink(
      ctx,
      batch.batchId,
      batch.editToken,
      allPhotos.length
    )
    clearActiveBatch(ctx)
    return
  }

  if (batch.status !== PhotoBatchStatus.Collecting) {
    clearActiveBatch(ctx)
    await ctx.reply("active batch уже не собирается, начни заново через /new")
    return
  }

  const uploadSession = ctx.session.upload
  const activeIds = uploadSession
    ? new Set(getActiveImages(uploadSession).map((img) => img.id))
    : null

  const allPhotos = await db
    .select()
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batch.batchId))
    .orderBy(asc(batchPhotosSchema.sortOrder))

  const photos = activeIds
    ? allPhotos.filter((p) => activeIds.has(p.fileId))
    : allPhotos

  if (photos.length === 0) {
    await ctx.reply("Нечего собирать. Кинь хотя бы 2 картинки.")
    return
  }

  // if (photos.length < 2) {
  //   await ctx.reply("Нужно хотя бы 2 картинки. Из одной пазл так себе, конечно.")
  //   return
  // }

  const layout = generateCollageLayout({
    count: photos.length,
    images: photos.map((photo) => ({
      id: photo.fileId,
      src: photo.objectKey,
      width: photo.width,
      height: photo.height,
    })),
  })
  const preview = await renderLayout(
    batch.batchId,
    scaleLayout(layout, PREVIEW_MAX_SIDE),
    photos.map((photo) => ({
      fileId: photo.fileId,
      objectKey: photo.objectKey,
    })),
    "jpg"
  )

  await db
    .update(batchesSchema)
    .set({
      layout,
      outputKey: preview.objectKey,
      outputFormat: preview.format,
      status: PhotoBatchStatus.Ready,
      updatedAt: new Date(),
    })
    .where(eq(batchesSchema.batchId, batch.batchId))

  await replyWithEditorLink(ctx, batch.batchId, batch.editToken, photos.length)
  clearActiveBatch(ctx)
}

function scaleLayout(layout: CollageLayout, maxSide: number): CollageLayout {
  const longestSide = Math.max(layout.canvas.width, layout.canvas.height)
  if (longestSide <= maxSide) return layout

  const scale = maxSide / longestSide
  return {
    canvas: {
      width: Math.round(layout.canvas.width * scale),
      height: Math.round(layout.canvas.height * scale),
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

async function replyWithEditorLink(
  ctx: BotContext,
  batchId: string,
  editToken: string,
  photoCount: number
): Promise<void> {
  const layoutUrl = clientLayoutUrl(batchId, editToken)
  const editCode = `${batchId}:${editToken}`
  const canUseUrlButton = isTelegramUrl(layoutUrl)

  const lines = [
    `Готово. Собрал из ${photoCount} картинок.`,
    "",
    "Открывай редактор:",
    `<code>${escapeHtml(layoutUrl)}</code>`,
    "",
    "Код для ручного ввода:",
    `<code>${escapeHtml(editCode)}</code>`,
  ]

  const replyOptions = canUseUrlButton
    ? {
        parse_mode: "HTML" as const,
        reply_markup: {
          inline_keyboard: [[{ text: "открыть редактор", url: layoutUrl }]],
        },
      }
    : { parse_mode: "HTML" as const }

  await ctx.reply(lines.join("\n"), replyOptions)
}

function clearActiveBatch(ctx: BotContext): void {
  const upload = ctx.session.upload
  if (upload?.statusRefreshTimer) {
    clearTimeout(upload.statusRefreshTimer)
  }
  ctx.session.isStarted = false
  ctx.session.activeBatchId = undefined
  ctx.session.photos = []
  ctx.session.upload = undefined
}

function isTelegramUrl(value: string): boolean {
  const url = new URL(value)

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !isPrivateHost(url.hostname)
  )
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
