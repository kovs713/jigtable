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

export function telegramWebhookSecret(): string | undefined {
  return readOptionalEnv("TELEGRAM_WEBHOOK_SECRET")
}

export async function handleTelegramWebhook(
  bot: Bot<BotContext>,
  request: BunRequest
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405 })
  }

  const secret = request.headers.get(TELEGRAM_SECRET_HEADER)
  const expectedSecret = telegramWebhookSecret()

  if (expectedSecret && secret !== expectedSecret) {
    console.warn("Telegram webhook rejected: invalid secret")
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let update: Update

  try {
    update = (await request.json()) as Update
  } catch (error) {
    console.error("Telegram webhook invalid JSON", error)
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const updateType = readUpdateType(update)

  void (async () => {
    if (!bot.isInited()) {
      await bot.init()
    }

    await bot.handleUpdate(update)
  })().catch((error) => {
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
