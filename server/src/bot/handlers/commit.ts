import { asc, eq } from "drizzle-orm"

import type { BotContext } from "@/bot/types"
import { clearStatusPanel, getActiveImages } from "@/bot/upload"
import { db } from "@/db"
import {
  CompositionStatus,
  compositionSourceImagesSchema,
  compositionsSchema,
} from "@/db/schemas"
import { generateCompositionLayout } from "@/native/composition-layout-engine"
import { writeTelegramPreview } from "@/services/composition/telegram-preview"
import { clientLayoutUrl } from "../utils"

export async function handleCommit(ctx: BotContext): Promise<void> {
  if (!ctx.session.isStarted || !ctx.session.activeCompositionId) {
    await ctx.reply(ctx.t("commit-not-started"))
    return
  }

  const [composition] = await db
    .select()
    .from(compositionsSchema)
    .where(
      eq(compositionsSchema.compositionId, ctx.session.activeCompositionId)
    )

  if (!composition) {
    await ctx.reply(ctx.t("commit-missing"))
    return
  }

  if (
    composition.status === CompositionStatus.Ready ||
    composition.status === CompositionStatus.Completed
  ) {
    const allPhotos = await db
      .select()
      .from(compositionSourceImagesSchema)
      .where(
        eq(
          compositionSourceImagesSchema.compositionId,
          composition.compositionId
        )
      )

    await replyWithEditorLink(
      ctx,
      composition.compositionId,
      composition.editToken,
      allPhotos.length
    )

    await clearActiveComposition(ctx)
    return
  }

  if (composition.status !== CompositionStatus.Collecting) {
    await clearActiveComposition(ctx)
    await ctx.reply(ctx.t("commit-not-collecting"))
    return
  }

  const uploadSession = ctx.session.upload

  const activeIds = uploadSession
    ? new Set(getActiveImages(uploadSession).map((image) => image.id))
    : null

  const allPhotos = await db
    .select()
    .from(compositionSourceImagesSchema)
    .where(
      eq(compositionSourceImagesSchema.compositionId, composition.compositionId)
    )
    .orderBy(asc(compositionSourceImagesSchema.sortOrder))

  const photos = activeIds
    ? allPhotos.filter((photo) => activeIds.has(photo.fileId))
    : allPhotos

  if (photos.length === 0) {
    await ctx.reply(ctx.t("commit-empty"))
    return
  }

  const layout = generateCompositionLayout({
    imageCount: photos.length,
    images: photos.map((photo) => ({
      id: photo.fileId,
      src: photo.objectKey,
      width: photo.width,
      height: photo.height,
    })),
  })

  await writeTelegramPreview(composition.compositionId, layout, photos)

  await db
    .update(compositionsSchema)
    .set({
      layout,
      status: CompositionStatus.Ready,
      updatedAt: new Date(),
    })
    .where(eq(compositionsSchema.compositionId, composition.compositionId))

  await replyWithEditorLink(
    ctx,
    composition.compositionId,
    composition.editToken,
    photos.length
  )

  await clearActiveComposition(ctx)
}

async function replyWithEditorLink(
  ctx: BotContext,
  compositionId: string,
  editToken: string,
  photoCount: number
): Promise<void> {
  const layoutUrl = clientLayoutUrl(compositionId, editToken)
  const editCode = `${compositionId}:${editToken}`
  const canUseUrlButton = isTelegramUrl(layoutUrl)

  const text = ctx.t("commit-ready", {
    photoCount,
    url: escapeHtml(layoutUrl),
    editCode: escapeHtml(editCode),
  })

  const replyOptions = canUseUrlButton
    ? {
        parse_mode: "HTML" as const,
        reply_markup: {
          inline_keyboard: [
            [{ text: ctx.t("button-open-editor"), url: layoutUrl }],
          ],
        },
      }
    : { parse_mode: "HTML" as const }

  await ctx.reply(text, replyOptions)
}

async function clearActiveComposition(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id

  if (chatId) {
    await clearStatusPanel(ctx, chatId)
  }

  ctx.session.isStarted = false
  ctx.session.activeCompositionId = undefined
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
