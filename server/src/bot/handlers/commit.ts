import type { CommandContext } from "grammy"

import { asc, eq } from "drizzle-orm"

import { clientLayoutUrl } from "../../features/urls"
import { db } from "../../infra/db"
import {
  batchPhotosSchema,
  batchesSchema,
  PhotoBatchStatus,
} from "../../infra/db/shemas"
import { shuffleImages } from "../../shuffle"
import type { BotContext } from "../types"

export async function handleCommit(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.session.isStarted || !ctx.session.activeBatchId) {
    await ctx.reply(
      "бля, далбаеб, ты не то что не скинул нихуя еще, ты даже не начал процесс, ебанат, /new есть, пресс баттнс уебище"
    )
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
    await replyWithEditorLink(ctx, batch.batchId, batch.editToken)
    clearActiveBatch(ctx)
    return
  }

  if (batch.status !== PhotoBatchStatus.Collecting) {
    clearActiveBatch(ctx)
    await ctx.reply("active batch уже не собирается, начни заново через /new")
    return
  }

  const photos = await db
    .select()
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batch.batchId))
    .orderBy(asc(batchPhotosSchema.sortOrder))

  if (photos.length === 0) {
    await ctx.reply("сначала отправь картинки")
    return
  }

  const layout = shuffleImages({
    count: photos.length,
    images: photos.map((photo) => ({
      id: photo.fileId,
      src: photo.objectKey,
      width: photo.width,
      height: photo.height,
    })),
  })

  await db
    .update(batchesSchema)
    .set({
      layout,
      status: PhotoBatchStatus.Ready,
      updatedAt: new Date(),
    })
    .where(eq(batchesSchema.batchId, batch.batchId))

  await replyWithEditorLink(ctx, batch.batchId, batch.editToken)
  clearActiveBatch(ctx)
}

async function replyWithEditorLink(
  ctx: CommandContext<BotContext>,
  batchId: string,
  editToken: string
): Promise<void> {
  const layoutUrl = clientLayoutUrl(batchId, editToken)
  const editCode = `${batchId}:${editToken}`
  const canUseUrlButton = isTelegramUrl(layoutUrl)
  const messageLines = [
    "готово",
    canUseUrlButton
      ? `<a href="${escapeHtml(layoutUrl)}">открыть редактор</a>`
      : null,
    "",
    "код:",
    `<code>${escapeHtml(editCode)}</code>`,
    "",
    "url если телега тупит:",
    `<code>${escapeHtml(layoutUrl)}</code>`,
  ].filter((line): line is string => line !== null)

  const replyOptions = canUseUrlButton
    ? {
        parse_mode: "HTML" as const,
        reply_markup: {
          inline_keyboard: [[{ text: "открыть редактор", url: layoutUrl }]],
        },
      }
    : { parse_mode: "HTML" as const }

  await ctx.reply(messageLines.join("\n"), replyOptions)
}

function clearActiveBatch(ctx: CommandContext<BotContext>): void {
  ctx.session.isStarted = false
  ctx.session.activeBatchId = undefined
  ctx.session.photos = []
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
