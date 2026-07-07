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

const PAGE_SIZE = 5
const previewFileIds = new Map<string, string>()

export async function handleList(
  ctx: CommandContext<BotContext>
): Promise<void> {
  if (!ctx.from) {
    await ctx.reply("не вижу юзера")
    return
  }

  const result = await renderListPage(String(ctx.from.id), 0)
  await ctx.reply(result.text, result.options)
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
    const page = parseNumber(data)
    const result = await renderListPage(userId, page)
    await ctx.editMessageText(result.text, result.options)
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:preview:")) {
    await sendPreview(ctx, userId, parseNumber(data))
    await ctx.answerCallbackQuery()
    return
  }

  if (data === "list:preview_close") {
    const messageId = ctx.callbackQuery.message?.message_id
    if (messageId) {
      await ctx.api.deleteMessage(ctx.chat.id, messageId).catch(() => {})
    }
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:delete:")) {
    await showDeleteConfirm(ctx, userId, parseNumber(data))
    await ctx.answerCallbackQuery()
    return
  }

  if (data.startsWith("list:delete_confirm:")) {
    const offset = parseNumber(data)
    await deleteBatchAtOffset(userId, offset)
    const result = await renderListPage(userId, Math.floor(offset / PAGE_SIZE))
    await ctx.editMessageText(result.text, result.options)
    await ctx.answerCallbackQuery({ text: "Удалил" })
    return
  }

  if (data.startsWith("list:delete_cancel:")) {
    const offset = parseNumber(data)
    const result = await renderListPage(userId, Math.floor(offset / PAGE_SIZE))
    await ctx.editMessageText(result.text, result.options)
    await ctx.answerCallbackQuery()
    return
  }

  await ctx.answerCallbackQuery()
}

async function renderListPage(userId: string, page: number) {
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
      text:
        safePage === 0
          ? "Пока нет готовых сборок.\n\nСначала закинь картинки через /new."
          : "Дальше пусто. Всё, приехали.",
      options: undefined,
    }
  }

  const visible = batches.slice(0, PAGE_SIZE)
  const hasNext = batches.length > PAGE_SIZE
  const lines = [
    "Твои сборки.",
    `Страница ${safePage + 1}. Тестовое можно снести тут же.`,
    "",
  ]
  const rows: InlineKeyboardButton[][] = []

  for (const [index, batch] of visible.entries()) {
    const batchOffset = offset + index
    const url = clientLayoutUrl(batch.batchId, batch.editToken)
    const label = `${batchOffset + 1}. ${formatDate(batch.createdAt)} · ${formatStatus(batch.status)}`
    lines.push(label)

    if (!isTelegramUrl(url)) {
      lines.push(url)
    }

    const row: InlineKeyboardButton[] = []
    if (isTelegramUrl(url)) {
      row.push({ text: `открыть ${batchOffset + 1}`, url })
    }
    if (batch.outputKey) {
      row.push({ text: "превью", callback_data: `list:preview:${batchOffset}` })
    }
    row.push({ text: "удалить", callback_data: `list:delete:${batchOffset}` })
    rows.push(row)
  }

  const nav: InlineKeyboardButton[] = []
  if (safePage > 0) {
    nav.push({ text: "назад", callback_data: `list:page:${safePage - 1}` })
  }
  if (hasNext) {
    nav.push({ text: "дальше", callback_data: `list:page:${safePage + 1}` })
  }
  if (nav.length > 0) rows.push(nav)

  return {
    text: lines.join("\n"),
    options: { reply_markup: { inline_keyboard: rows } },
  }
}

async function sendPreview(
  ctx: CallbackQueryContext,
  userId: string,
  offset: number
): Promise<void> {
  const batch = await getBatchAtOffset(userId, offset)
  if (!batch?.outputKey) {
    await ctx.answerCallbackQuery({ text: "Превью пока нет" })
    return
  }

  const cachedFileId = previewFileIds.get(batch.outputKey)
  const photo = cachedFileId ?? (await loadPreview(batch.outputKey))
  if (!photo) {
    await ctx.answerCallbackQuery({ text: "Не смог открыть превью" })
    return
  }

  const url = clientLayoutUrl(batch.batchId, batch.editToken)
  const message = await ctx.api.sendPhoto(ctx.chat!.id, photo, {
    caption: `Превью сборки ${offset + 1}\n${formatDate(batch.createdAt)}`,
    reply_markup: {
      inline_keyboard: [
        isTelegramUrl(url)
          ? [{ text: "открыть редактор", url }]
          : [{ text: "закрыть", callback_data: "list:preview_close" }],
        [{ text: "закрыть", callback_data: "list:preview_close" }],
      ],
    },
  })

  const fileId = message.photo.at(-1)?.file_id
  if (fileId) {
    previewFileIds.set(batch.outputKey, fileId)
  }
}

async function showDeleteConfirm(
  ctx: CallbackQueryContext,
  userId: string,
  offset: number
): Promise<void> {
  const batch = await getBatchAtOffset(userId, offset)
  if (!batch) {
    await ctx.answerCallbackQuery({ text: "Уже нет" })
    return
  }

  await ctx.editMessageText(
    [
      `Снести сборку ${offset + 1}?`,
      formatDate(batch.createdAt),
      "",
      "Удалю картинки из хранилища и уберу из списка.",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "да, снести", callback_data: `list:delete_confirm:${offset}` },
            { text: "не надо", callback_data: `list:delete_cancel:${offset}` },
          ],
        ],
      },
    }
  )
}

async function deleteBatchAtOffset(userId: string, offset: number): Promise<void> {
  const batch = await getBatchAtOffset(userId, offset)
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

async function getBatchAtOffset(userId: string, offset: number) {
  const [batch] = await db
    .select()
    .from(batchesSchema)
    .where(activeUserBatches(userId))
    .orderBy(desc(batchesSchema.createdAt))
    .limit(1)
    .offset(Math.max(0, offset))
  return batch
}

async function loadPreview(objectKey: string): Promise<InputFile | null> {
  try {
    const buffer = await s3Client.file(objectKey).arrayBuffer()
    return new InputFile(Buffer.from(buffer), "preview.jpg")
  } catch (error) {
    console.warn("Failed to load batch preview", { objectKey, error })
    return null
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

function formatStatus(status: string | null): string {
  if (status === PhotoBatchStatus.Completed) return "собрано"
  return "редактор"
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
