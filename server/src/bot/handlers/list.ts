import { and, count, desc, eq, inArray, or } from "drizzle-orm"
import { InputFile, type CommandContext } from "grammy"
import type { InlineKeyboardButton } from "grammy/types"

import type { BotContext, CallbackQueryContext } from "@/bot/types"
import { downloadTelegramMedia } from "@/bot/media"
import { LIMITS } from "@/config"
import { db } from "@/db"
import {
  CompositionStatus,
  compositionSourceImagesSchema,
  compositionsSchema,
  type Composition,
} from "@/db/schemas"
import {
  cacheTelegramPreviewFileId,
  deleteCachedTelegramPreviewFileId,
  getCachedTelegramPreviewFileId,
} from "@/services/composition/telegram-preview"
import { s3Client } from "@/storage/client"
import { jigsawImageObjectKey, telegramPreviewObjectKey } from "@/storage/utils"
import { clientLayoutUrl } from "../utils"

interface ListView {
  caption: string
  keyboard: InlineKeyboardButton[][]
  media?: string | InputFile
  previewCacheKey?: string
}

export async function handleList(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply(ctx.t("user-not-found"))
    return
  }

  const locale = await ctx.i18n.getLocale()
  const view = await renderListPage(ctx, String(ctx.from.id), 0, locale)

  if (!view.media) {
    await ctx.reply(view.caption, {
      reply_markup:
        view.keyboard.length > 0
          ? { inline_keyboard: view.keyboard }
          : undefined,
    })
    return
  }

  const message = await ctx.replyWithPhoto(view.media, {
    caption: view.caption,
    reply_markup: {
      inline_keyboard: view.keyboard,
    },
  })

  await cacheTelegramPreviewFileId(
    view.previewCacheKey,
    message.photo.at(-1)?.file_id
  )
}

export async function handleListAction(
  ctx: CallbackQueryContext
): Promise<void> {
  if (!ctx.from || !ctx.chat) {
    await ctx.answerCallbackQuery()
    return
  }

  const data = ctx.callbackQuery.data
  const userId = String(ctx.from.id)
  const locale = await ctx.i18n.getLocale()

  if (data.startsWith("list:page:")) {
    await ctx.answerCallbackQuery()

    const page = parseNumber(data)
    const view = await renderListPage(ctx, userId, page, locale)

    await editToView(ctx, view)
    return
  }

  if (data.startsWith("list:open:")) {
    await ctx.answerCallbackQuery()

    const action = parseCompositionAction(data)
    const view = await renderCompositionCard(
      ctx,
      userId,
      action.compositionId,
      action.page,
      action.index
    )

    await editToView(ctx, view)
    return
  }

  if (data.startsWith("list:back:")) {
    await ctx.answerCallbackQuery()

    const page = parseNumber(data)
    const view = await renderListPage(ctx, userId, page, locale)

    await editToView(ctx, view)
    return
  }

  if (data.startsWith("list:delete:")) {
    await ctx.answerCallbackQuery()

    const action = parseCompositionAction(data)
    const view = await renderDeleteConfirm(
      ctx,
      userId,
      action.compositionId,
      action.page,
      action.index,
      locale
    )

    await editToView(ctx, view)
    return
  }

  if (data.startsWith("list:delete_confirm:")) {
    await ctx.answerCallbackQuery({
      text: ctx.t("callback-deleting"),
    })

    const action = parseCompositionAction(data)

    await deleteComposition(userId, action.compositionId)

    const view = await renderListPage(ctx, userId, action.page, locale)

    await editToView(ctx, view)
    return
  }

  if (data.startsWith("list:delete_cancel:")) {
    await ctx.answerCallbackQuery()

    const action = parseCompositionAction(data)
    const view = await renderCompositionCard(
      ctx,
      userId,
      action.compositionId,
      action.page,
      action.index
    )

    await editToView(ctx, view)
    return
  }

  await ctx.answerCallbackQuery()
}

async function editToView(
  ctx: CallbackQueryContext,
  view: ListView
): Promise<void> {
  const chatId = ctx.chat!.id
  const messageId = ctx.callbackQuery.message?.message_id

  if (!messageId) {
    return
  }

  if (!view.media) {
    await ctx.api.editMessageCaption(chatId, messageId, {
      caption: view.caption,
      reply_markup:
        view.keyboard.length > 0
          ? {
              inline_keyboard: view.keyboard,
            }
          : undefined,
    })
    return
  }

  const edited = await ctx.api.editMessageMedia(
    chatId,
    messageId,
    {
      type: "photo",
      media: view.media,
      caption: view.caption,
    },
    {
      reply_markup: {
        inline_keyboard: view.keyboard,
      },
    }
  )

  if (typeof edited !== "boolean" && edited.photo) {
    await cacheTelegramPreviewFileId(
      view.previewCacheKey,
      edited.photo.at(-1)?.file_id
    )
  }
}

async function renderListPage(
  ctx: BotContext,
  userId: string,
  page: number,
  locale: string
): Promise<ListView> {
  const safePage = Math.max(0, page)
  const offset = safePage * LIMITS.telegram.pageSize

  const compositions = await db
    .select()
    .from(compositionsSchema)
    .where(activeUserCompositions(userId))
    .orderBy(desc(compositionsSchema.createdAt))
    .limit(LIMITS.telegram.pageSize + 1)
    .offset(offset)

  if (compositions.length === 0) {
    return {
      caption:
        safePage === 0 ? ctx.t("list-empty-first") : ctx.t("list-empty-page"),
      keyboard: [],
    }
  }

  const visible = compositions.slice(0, LIMITS.telegram.pageSize)

  const photoCounts = await getPhotoCounts(
    visible.map((composition) => composition.compositionId)
  )

  const summaries = visible.map((composition, index) =>
    renderListLine(
      ctx,
      composition,
      offset + index,
      photoCounts.get(composition.compositionId) ?? 0,
      locale
    )
  )

  const coverComposition = visible.at(0)

  if (!coverComposition) {
    return {
      caption: ctx.t("list-empty"),
      keyboard: [],
    }
  }

  const previewObjectKey = telegramPreviewObjectKey(
    coverComposition.compositionId
  )
  const previewCacheKey = telegramPreviewCacheKey(
    previewObjectKey,
    coverComposition.updatedAt
  )

  const cover = await loadPreview(previewObjectKey, previewCacheKey)

  return {
    caption: [ctx.t("list-title"), "", ...summaries].join("\n"),

    keyboard: renderListKeyboard(ctx, {
      offset,
      compositions: visible,
      page: safePage,
      hasNext: compositions.length > LIMITS.telegram.pageSize,
    }),

    media: cover,
    previewCacheKey,
  }
}

async function renderCompositionCard(
  ctx: BotContext,
  userId: string,
  compositionId: string,
  page: number,
  index: number
): Promise<ListView> {
  const composition = await getCompositionById(userId, compositionId)

  if (!composition) {
    return notFoundView(ctx, page)
  }

  const photoCount = await getPhotoCount(composition.compositionId)
  const url = clientLayoutUrl(composition.compositionId, composition.editToken)
  const previewObjectKey = telegramPreviewObjectKey(composition.compositionId)
  const previewCacheKey = telegramPreviewCacheKey(
    previewObjectKey,
    composition.updatedAt
  )
  const media = await loadPreview(previewObjectKey, previewCacheKey)

  const caption = [
    ctx.t("list-preview"),
    ctx.t("list-composition-number", { number: index + 1 }),
    ctx.t("list-pictures", { count: photoCount }),
    formatDimensions(ctx, composition),
  ]

  if (!isTelegramUrl(url)) {
    caption.push("", ctx.t("list-link"), url)
  }

  const keyboard: InlineKeyboardButton[][] = []

  if (isTelegramUrl(url)) {
    keyboard.push([
      {
        text: ctx.t("button-open-editor"),
        url,
      },
    ])
  }

  keyboard.push([
    {
      text: ctx.t("button-delete"),
      callback_data:
        `list:delete:${page}:` + `${index}:${composition.compositionId}`,
    },
    {
      text: ctx.t("button-back"),
      callback_data: `list:back:${page}`,
    },
  ])

  return {
    caption: caption.join("\n"),
    keyboard,
    media,
    previewCacheKey,
  }
}

async function renderDeleteConfirm(
  ctx: BotContext,
  userId: string,
  compositionId: string,
  page: number,
  index: number,
  locale: string
): Promise<ListView> {
  const composition = await getCompositionById(userId, compositionId)

  if (!composition) {
    return notFoundView(ctx, page)
  }

  const photoCount = await getPhotoCount(composition.compositionId)
  const previewObjectKey = telegramPreviewObjectKey(composition.compositionId)
  const previewCacheKey = telegramPreviewCacheKey(
    previewObjectKey,
    composition.updatedAt
  )
  const pictures = ctx.t("list-pictures", { count: photoCount })

  return {
    caption: [
      ctx.t("list-delete-question", { number: index + 1 }),
      ctx.t("list-delete-details", {
        pictures,
        date: formatDate(ctx, composition.createdAt, locale),
      }),
      "",
      ctx.t("list-delete-warning"),
    ].join("\n"),

    keyboard: [
      [
        {
          text: ctx.t("button-yes-remove"),
          callback_data:
            `list:delete_confirm:${page}:` + `${index}:${compositionId}`,
        },
        {
          text: ctx.t("button-no-cancel"),
          callback_data:
            `list:delete_cancel:${page}:` + `${index}:${compositionId}`,
        },
      ],
    ],

    media: await loadPreview(previewObjectKey, previewCacheKey),
    previewCacheKey,
  }
}

function renderListKeyboard(
  ctx: BotContext,
  input: {
    offset: number
    compositions: Composition[]
    page: number
    hasNext: boolean
  }
): InlineKeyboardButton[][] {
  const openRow: InlineKeyboardButton[] = []

  for (const [index, composition] of input.compositions.entries()) {
    const number = input.offset + index + 1

    openRow.push({
      text: ctx.t("list-open-number", { number }),
      callback_data:
        `list:open:${input.page}:` +
        `${number - 1}:` +
        composition.compositionId,
    })
  }

  const rows: InlineKeyboardButton[][] = [openRow]
  const navigation: InlineKeyboardButton[] = []

  if (input.page > 0) {
    navigation.push({
      text: ctx.t("button-back"),
      callback_data: `list:page:${input.page - 1}`,
    })
  }

  if (input.hasNext) {
    navigation.push({
      text: ctx.t("button-continue"),
      callback_data: `list:page:${input.page + 1}`,
    })
  }

  if (navigation.length > 0) {
    rows.push(navigation)
  }

  return rows
}

function renderListLine(
  ctx: BotContext,
  composition: Composition,
  offset: number,
  photoCount: number,
  locale: string
): string {
  return ctx.t("list-line", {
    number: offset + 1,
    pictures: ctx.t("list-pictures", { count: photoCount }),
    dimensions: formatDimensions(ctx, composition),
    date: formatRelativeDate(ctx, composition.createdAt, locale),
  })
}

async function getPhotoCount(compositionId: string): Promise<number> {
  const [row] = await db
    .select({
      photoCount: count(compositionSourceImagesSchema.fileId),
    })
    .from(compositionSourceImagesSchema)
    .where(eq(compositionSourceImagesSchema.compositionId, compositionId))

  return Number(row?.photoCount ?? 0)
}

async function getPhotoCounts(
  compositionIds: string[]
): Promise<Map<string, number>> {
  if (compositionIds.length === 0) {
    return new Map()
  }

  const rows = await db
    .select({
      compositionId: compositionSourceImagesSchema.compositionId,
      photoCount: count(compositionSourceImagesSchema.fileId),
    })
    .from(compositionSourceImagesSchema)
    .where(inArray(compositionSourceImagesSchema.compositionId, compositionIds))
    .groupBy(compositionSourceImagesSchema.compositionId)

  return new Map(rows.map((row) => [row.compositionId, Number(row.photoCount)]))
}

async function deleteComposition(
  userId: string,
  compositionId: string
): Promise<void> {
  const composition = await getCompositionById(userId, compositionId)

  if (!composition) {
    return
  }

  const photos = await db
    .select({
      objectKey: compositionSourceImagesSchema.objectKey,
    })
    .from(compositionSourceImagesSchema)
    .where(
      eq(compositionSourceImagesSchema.compositionId, composition.compositionId)
    )

  for (const photo of photos) {
    await s3Client.delete(photo.objectKey).catch(() => {})
  }

  const previewObjectKey = telegramPreviewObjectKey(composition.compositionId)

  await deleteCachedTelegramPreviewFileId(
    telegramPreviewCacheKey(previewObjectKey, composition.updatedAt)
  )

  await s3Client.delete(previewObjectKey).catch(() => {})

  if (composition.jigsawImageFormat) {
    const finalObjectKey = jigsawImageObjectKey(
      composition.compositionId,
      composition.jigsawImageFormat
    )

    await s3Client.delete(finalObjectKey).catch(() => {})
  }

  await db
    .update(compositionsSchema)
    .set({
      status: CompositionStatus.Canceled,
      updatedAt: new Date(),
    })
    .where(eq(compositionsSchema.compositionId, composition.compositionId))
}

async function getCompositionById(userId: string, compositionId: string) {
  const [composition] = await db
    .select()
    .from(compositionsSchema)
    .where(
      and(
        activeUserCompositions(userId),
        eq(compositionsSchema.compositionId, compositionId)
      )
    )
    .limit(1)

  return composition
}

async function loadPreview(
  objectKey: string,
  cacheKey: string
): Promise<string | InputFile> {
  const cachedFileId = await getCachedTelegramPreviewFileId(cacheKey)

  if (cachedFileId) {
    return cachedFileId
  }

  return downloadTelegramMedia(objectKey)
}

function telegramPreviewCacheKey(
  objectKey: string,
  updatedAt: Date | null
): string {
  return `${objectKey}:${updatedAt?.getTime() ?? 0}`
}

function notFoundView(ctx: BotContext, page: number): ListView {
  return {
    caption: ctx.t("list-not-found"),
    keyboard: [
      [
        {
          text: ctx.t("button-back"),
          callback_data: `list:back:${page}`,
        },
      ],
    ],
  }
}

function activeUserCompositions(userId: string) {
  return and(
    eq(compositionsSchema.userId, userId),
    or(
      eq(compositionsSchema.status, CompositionStatus.Ready),
      eq(compositionsSchema.status, CompositionStatus.Completed)
    )
  )
}

function parseNumber(data: string): number {
  const value = Number(data.split(":").at(-1))

  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function parseCompositionAction(data: string): {
  page: number
  index: number
  compositionId: string
} {
  const [, , pageValue, indexValue, compositionId] = data.split(":")

  const page = Number(pageValue)
  const index = Number(indexValue)

  return {
    page: Number.isSafeInteger(page) && page >= 0 ? page : 0,
    index: Number.isSafeInteger(index) && index >= 0 ? index : 0,
    compositionId: compositionId ?? "",
  }
}

function formatDimensions(ctx: BotContext, composition: Composition): string {
  const canvas = composition.layout?.canvas

  if (!canvas) {
    return ctx.t("size-not-ready")
  }

  return `${Math.round(canvas.width)}×${Math.round(canvas.height)}`
}

function formatDate(
  ctx: BotContext,
  value: Date | null,
  locale: string
): string {
  if (!value) {
    return ctx.t("date-missing")
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatRelativeDate(
  ctx: BotContext,
  value: Date | null,
  locale: string
): string {
  if (!value) {
    return ctx.t("date-missing")
  }

  const diffMs = Date.now() - value.getTime()

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour) {
    return ctx.t("relative-minutes", {
      count: Math.max(1, Math.round(diffMs / minute)),
    })
  }

  if (diffMs < day) {
    return ctx.t("relative-hours", {
      count: Math.round(diffMs / hour),
    })
  }

  if (diffMs < 2 * day) {
    return ctx.t("relative-yesterday")
  }

  return formatDate(ctx, value, locale)
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
