import { createHash } from "node:crypto"
import type { BunRequest } from "bun"
import type { Bot } from "grammy"
import type { Update } from "grammy/types"

import type { BotContext } from "@/bot/types"
import { readOptionalEnv, readRequiredEnv } from "@/infra/env"

export const TELEGRAM_WEBHOOK_PATH = "/api/telegram/webhook"

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token"

export function telegramWebhookUrl(): string {
  const baseUrl = readRequiredEnv("PUBLIC_API_URL")

  return new URL(TELEGRAM_WEBHOOK_PATH, baseUrl).toString()
}

export function telegramWebhookSecret(): string {
  return (
    readOptionalEnv("TELEGRAM_WEBHOOK_SECRET") ??
    createHash("sha256").update(readRequiredEnv("BOT_TOKEN")).digest("hex")
  )
}

export async function handleTelegramWebhook(
  bot: Bot<BotContext>,
  request: BunRequest
): Promise<Response> {
  const secret = request.headers.get(TELEGRAM_SECRET_HEADER)

  if (secret !== telegramWebhookSecret()) {
    console.warn("Telegram webhook rejected: invalid secret")
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const update = (await request.json()) as Update
  const updateType = readUpdateType(update)

  console.log(`Telegram webhook received ${update.update_id}:${updateType}`)

  void bot
    .handleUpdate(update)
    .then(() => {
      console.log(`Telegram webhook handled ${update.update_id}:${updateType}`)
    })
    .catch((error) => {
      console.error(
        `Telegram webhook failed ${update.update_id}:${updateType}`,
        error
      )
    })

  return Response.json({ ok: true })
}

function readUpdateType(update: Update): string {
  for (const key of Object.keys(update)) {
    if (key !== "update_id") {
      return key
    }
  }

  return "unknown"
}
