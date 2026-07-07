import { InputFile, type CommandContext } from "grammy"
import type { InlineKeyboardButton } from "grammy/types"
import { and, desc, eq, or } from "drizzle-orm"

import type { BotContext, CallbackQueryContext } from "@/bot/types"
import { clientLayoutUrl } from "@/features/urls"
import { db } from "@/infra/db"
import {
  batchesSchema,
  batchPhotosSchema,
  PhotoBatchStatus,
} from "@/infra/db/schemas"
import { s3Client } from "@/infra/storage"

const PAGE_SIZE = 3
const previewFileIds = new Map<string, string>()

type Batch = typeof batchesSchema.$inferSelect

interface ListView {
  caption: string
  keyboard: InlineKeyboardButton[][]
  media?: InputFile | string
  outputKey?: string
}

export async function handleList(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера")
    return
  }

  const view = await renderListPage(String(ctx.from.id), 0)
  if (!view.media) {
    await ctx.reply(view.caption)
    return
  }

  const message = await ctx.replyWithPhoto(view.media, {
    caption: view.caption,
    reply_markup: { inline_keyboard: view.keyboard },
  })
  cachePreviewFileId(view.outputKey, message.photo.at(-1)?.file_id)
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

  if (data.startsWith("list:page:")) {
    await editToView(ctx, await renderListPage(userId, parseNumber(data)))
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:open:")) {
    const action = parseBatchAction(data)
    await editToView(
      ctx,
      await renderBatchCard(userId, action.batchId, action.page, action.index)
    )
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:back:")) {
    await editToView(ctx, await renderListPage(userId, parseNumber(data)))
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:delete:")) {
    const action = parseBatchAction(data)
    await editToView(
      ctx,
      await renderDeleteConfirm(
        userId,
        action.batchId,
        action.page,
        action.index
      )
    )
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:delete_confirm:")) {
    const action = parseBatchAction(data)
    await deleteBatch(userId, action.batchId)
    await editToView(ctx, await renderListPage(userId, action.page))
    await ctx.answerCallbackQuery({ text: "Удалил" })
    return
  }

  if (data.startsWith("list:delete_cancel:")) {
    const action = parseBatchAction(data)
    await editToView(
      ctx,
      await renderBatchCard(userId, action.batchId, action.page, action.index)
    )
    await ctx.answerCallbackQuery()
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
  if (!messageId) return

  if (!view.media) {
    await ctx.api.editMessageCaption(chatId, messageId, {
      caption: view.caption,
      reply_markup: undefined,
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
    { reply_markup: { inline_keyboard: view.keyboard } }
  )

  if (typeof edited !== "boolean" && edited.photo) {
    cachePreviewFileId(view.outputKey, edited.photo.at(-1)?.file_id)
  }
}

async function renderListPage(userId: string, page: number): Promise<ListView> {
  const safePage = Math.max(0, page)
  const offset = safePage * PAGE_SIZE
  const batches = await db
    .select()
    .from(batchesSchema)
    .where(activeUserBatches(userId))
    .orderBy(desc(batchesSchema.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset)

  if (!batches.length) {
    return {
      caption:
        safePage === 0
          ? "Пока нет готовых сборок.\n\nСначала закинь картинки через /new."
          : "Дальше пусто. Всё, приехали.",
      keyboard: [],
    }
  }

  const visible = batches.slice(0, PAGE_SIZE)
  const summaries = await Promise.all(
    visible.map((batch, index) => renderListLine(batch, offset + index))
  )
  const coverBatch = visible.find((batch) => batch.outputKey) ?? visible[0]
  const cover = coverBatch?.outputKey
    ? await loadPreview(coverBatch.outputKey)
    : undefined

  return {
    caption: ["Твои сборки.", "", ...summaries].join("\n"),
    keyboard: renderListKeyboard({
      offset,
      batches: visible,
      page: safePage,
      hasNext: batches.length > PAGE_SIZE,
    }),
    media: cover ?? undefined,
    outputKey: coverBatch?.outputKey ?? undefined,
  }
}

async function renderBatchCard(
  userId: string,
  batchId: string,
  page: number,
  index: number
): Promise<ListView> {
  const batch = await getBatchById(userId, batchId)
  if (!batch) return notFoundView(page)

  const photoCount = await getPhotoCount(batch.batchId)
  const url = clientLayoutUrl(batch.batchId, batch.editToken)
  const media = batch.outputKey ? await loadPreview(batch.outputKey) : undefined
  const caption = [
    "Превью",
    `Сборка #${index + 1}`,
    `${photoCount} картинок`,
    formatDimensions(batch),
  ]

  if (!isTelegramUrl(url)) {
    caption.push("", "Ссылка:", url)
  }

  const keyboard: InlineKeyboardButton[][] = []
  if (isTelegramUrl(url)) {
    keyboard.push([{ text: "открыть редактор", url }])
  }
  keyboard.push([
    {
      text: "удалить",
      callback_data: `list:delete:${page}:${index}:${batch.batchId}`,
    },
    { text: "назад", callback_data: `list:back:${page}` },
  ])

  return {
    caption: caption.join("\n"),
    keyboard,
    media: media ?? undefined,
    outputKey: batch.outputKey ?? undefined,
  }
}

async function renderDeleteConfirm(
  userId: string,
  batchId: string,
  page: number,
  index: number
): Promise<ListView> {
  const batch = await getBatchById(userId, batchId)
  if (!batch) return notFoundView(page)

  const media = batch.outputKey ? await loadPreview(batch.outputKey) : undefined
  return {
    caption: [
      `Снести сборку #${index + 1}?`,
      `${await getPhotoCount(batch.batchId)} картинок · ${formatDate(batch.createdAt)}`,
      "",
      "Удалю картинки из хранилища и уберу из списка.",
    ].join("\n"),
    keyboard: [
      [
        {
          text: "да, снести",
          callback_data: `list:delete_confirm:${page}:${index}:${batchId}`,
        },
        {
          text: "не надо",
          callback_data: `list:delete_cancel:${page}:${index}:${batchId}`,
        },
      ],
    ],
    media: media ?? undefined,
    outputKey: batch.outputKey ?? undefined,
  }
}

function renderListKeyboard(input: {
  offset: number
  batches: Batch[]
  page: number
  hasNext: boolean
}): InlineKeyboardButton[][] {
  const openRow: InlineKeyboardButton[] = []
  for (const [index, batch] of input.batches.entries()) {
    const number = input.offset + index + 1
    openRow.push({
      text: `открыть ${number}`,
      callback_data: `list:open:${input.page}:${number - 1}:${batch.batchId}`,
    })
  }

  const rows: InlineKeyboardButton[][] = [openRow]
  const nav: InlineKeyboardButton[] = []
  if (input.page > 0) {
    nav.push({ text: "назад", callback_data: `list:page:${input.page - 1}` })
  }
  if (input.hasNext) {
    nav.push({ text: "дальше", callback_data: `list:page:${input.page + 1}` })
  }
  if (nav.length > 0) rows.push(nav)
  return rows
}

async function renderListLine(batch: Batch, offset: number): Promise<string> {
  const photoCount = await getPhotoCount(batch.batchId)
  return `${offset + 1}. ${photoCount} картинок · ${formatDimensions(batch)} · ${formatRelativeDate(batch.createdAt)}`
}

async function getPhotoCount(batchId: string): Promise<number> {
  const photos = await db
    .select({ fileId: batchPhotosSchema.fileId })
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batchId))
  return photos.length
}

async function deleteBatch(userId: string, batchId: string): Promise<void> {
  const batch = await getBatchById(userId, batchId)
  if (!batch) return

  const photos = await db
    .select()
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batch.batchId))

  for (const photo of photos) {
    await s3Client.delete(photo.objectKey).catch(() => {})
  }

  if (batch.outputKey) {
    previewFileIds.delete(batch.outputKey)
    await s3Client.delete(batch.outputKey).catch(() => {})
  }

  await db
    .update(batchesSchema)
    .set({ status: PhotoBatchStatus.Canceled, updatedAt: new Date() })
    .where(eq(batchesSchema.batchId, batch.batchId))
}

async function getBatchById(userId: string, batchId: string) {
  const [batch] = await db
    .select()
    .from(batchesSchema)
    .where(and(activeUserBatches(userId), eq(batchesSchema.batchId, batchId)))
    .limit(1)
  return batch
}

async function loadPreview(
  objectKey: string
): Promise<InputFile | string | null> {
  const cachedFileId = previewFileIds.get(objectKey)
  if (cachedFileId) return cachedFileId

  try {
    const buffer = await s3Client.file(objectKey).arrayBuffer()
    return new InputFile(Buffer.from(buffer), "preview.jpg")
  } catch (error) {
    console.warn("Failed to load batch preview", { objectKey, error })
    return null
  }
}

function cachePreviewFileId(
  outputKey: string | undefined,
  fileId: string | undefined
): void {
  if (outputKey && fileId) previewFileIds.set(outputKey, fileId)
}

function notFoundView(page: number): ListView {
  return {
    caption: "Сборка уже исчезла.",
    keyboard: [[{ text: "назад", callback_data: `list:back:${page}` }]],
  }
}

function activeUserBatches(userId: string) {
  return and(
    eq(batchesSchema.userId, userId),
    or(
      eq(batchesSchema.status, PhotoBatchStatus.Ready),
      eq(batchesSchema.status, PhotoBatchStatus.Completed)
    )
  )
}

function parseNumber(data: string): number {
  const value = Number(data.split(":").at(-1))
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function parseBatchAction(data: string): {
  page: number
  index: number
  batchId: string
} {
  const [, , pageValue, indexValue, batchId] = data.split(":")
  const page = Number(pageValue)
  const index = Number(indexValue)
  return {
    page: Number.isSafeInteger(page) && page >= 0 ? page : 0,
    index: Number.isSafeInteger(index) && index >= 0 ? index : 0,
    batchId: batchId ?? "",
  }
}

function formatDimensions(batch: Batch): string {
  const canvas = batch.layout?.canvas
  if (!canvas) return "размер пока не готов"
  return `${Math.round(canvas.width)}×${Math.round(canvas.height)}`
}

function formatDate(value: Date | null): string {
  if (!value) return "без даты"
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatRelativeDate(value: Date | null): string {
  if (!value) return "без даты"
  const diffMs = Date.now() - value.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour)
    return `${Math.max(1, Math.round(diffMs / minute))} мин назад`
  if (diffMs < day) return `${Math.round(diffMs / hour)} ч назад`
  if (diffMs < 2 * day) return "вчера"

  return formatDate(value)
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
