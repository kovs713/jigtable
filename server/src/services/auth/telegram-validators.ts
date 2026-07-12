import { SHA256 } from "bun"
import { createHmac, timingSafeEqual } from "crypto"

import { isRecord } from "@jigtable/shared/utils"

import type { TelegramAuthProfile } from "./auth-types"

const TELEGRAM_AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function validateTelegramWebAppInitData(
  initData: string
): TelegramAuthProfile {
  const params = new URLSearchParams(initData)
  const hash = params.get("hash")

  if (!hash) {
    throw new Error("Telegram hash missing")
  }

  const authDate = readAuthDate(params.get("auth_date"))
  const dataCheckString = createTelegramCheckString(params)
  const botToken = process.env.BOT_TOKEN!

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest()
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex")

  assertFreshTelegramAuth(authDate)
  assertSafeEqual(hash, expected)

  const user = parseTelegramUserJson(params.get("user"))

  if (!user) {
    throw new Error("Telegram user missing")
  }

  return user
}

export function validateTelegramLoginWidget(
  payload: Record<string, unknown>
): TelegramAuthProfile {
  const hash = readString(payload.hash)

  if (!hash) {
    throw new Error("Telegram hash missing")
  }

  const entries = Object.entries(payload)
    .filter(
      ([key, value]) =>
        key !== "hash" &&
        key !== "anonSessionToken" &&
        value !== undefined &&
        value !== null
    )
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  const authDate = readAuthDate(readEntry(entries, "auth_date"))
  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  const secret = SHA256.hash(process.env.BOT_TOKEN!)
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex")

  assertFreshTelegramAuth(authDate)
  assertSafeEqual(hash, expected)

  const telegramId = readEntry(entries, "id")

  if (!telegramId) {
    throw new Error("Telegram id missing")
  }

  return {
    telegramId,
    username: readEntry(entries, "username") ?? undefined,
    firstName: readEntry(entries, "first_name") ?? undefined,
    lastName: readEntry(entries, "last_name") ?? undefined,
    photoUrl: readEntry(entries, "photo_url") ?? undefined,
  }
}

function createTelegramCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parseTelegramUserJson(
  value: string | null
): TelegramAuthProfile | null {
  if (!value) {
    return null
  }

  try {
    const user = JSON.parse(value)

    if (!isRecord(user)) {
      return null
    }

    const telegramId = readString(user.id)

    if (!telegramId) {
      return null
    }

    return {
      telegramId,
      username: readString(user.username) ?? undefined,
      firstName: readString(user.first_name) ?? undefined,
      lastName: readString(user.last_name) ?? undefined,
      photoUrl: readString(user.photo_url) ?? undefined,
    }
  } catch {
    return null
  }
}

function assertFreshTelegramAuth(authDate: Date): void {
  if (Date.now() - authDate.getTime() > TELEGRAM_AUTH_MAX_AGE_MS) {
    throw new Error("Telegram auth expired")
  }
}

function assertSafeEqual(actual: string, expected: string): void {
  const actualBuffer = Buffer.from(actual, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Telegram auth invalid")
  }
}

function readAuthDate(value: string | null | undefined): Date {
  const seconds = Number(value)

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Telegram auth_date invalid")
  }

  return new Date(seconds * 1000)
}

function readEntry(
  entries: readonly (readonly [string, string])[],
  key: string
): string | undefined {
  return entries.find(([entryKey]) => entryKey === key)?.[1]
}

function readString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }

  return typeof value === "string" && value.trim() ? value.trim() : null
}
