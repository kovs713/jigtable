import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { isRecord } from "@jigtable/shared/utils"

import type { Clock } from "../contracts"
import { TelegramAuthVerificationError } from "./errors"
import type { TelegramIdentity } from "./types"

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const DEFAULT_FUTURE_SKEW_MS = 60 * 1000
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i

export type TelegramAuthVerifierOptions = {
  botToken: string
  maxAgeMs?: number
  futureSkewMs?: number
  clock?: Clock
}

export class TelegramAuthVerifier {
  private readonly maxAgeMs: number
  private readonly futureSkewMs: number
  private readonly clock: Clock

  constructor(private readonly options: TelegramAuthVerifierOptions) {
    if (!options.botToken) {
      throw new Error("Telegram bot token is required")
    }

    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
    this.futureSkewMs = options.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS
    this.clock = options.clock ?? { now: () => new Date() }
  }

  verifyWebAppInitData(initData: string): TelegramIdentity {
    const params = new URLSearchParams(initData)
    const actualHash = params.get("hash")

    if (!actualHash) {
      throw new TelegramAuthVerificationError(
        "missing_hash",
        "Telegram hash missing"
      )
    }

    const authDate = readAuthDate(params.get("auth_date"))
    const dataCheckString = createTelegramCheckString(params)
    const secret = createHmac("sha256", "WebAppData")
      .update(this.options.botToken)
      .digest()
    const expectedHash = createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex")

    this.assertFresh(authDate)
    assertSafeHashEqual(actualHash, expectedHash)

    const identity = parseTelegramUserJson(params.get("user"))

    if (!identity) {
      throw new TelegramAuthVerificationError(
        "missing_user",
        "Telegram user missing"
      )
    }

    return identity
  }

  verifyLoginWidget(
    telegramPayload: Record<string, unknown>
  ): TelegramIdentity {
    const actualHash = readString(telegramPayload.hash)

    if (!actualHash) {
      throw new TelegramAuthVerificationError(
        "missing_hash",
        "Telegram hash missing"
      )
    }

    // Only Telegram fields may be passed here. The HTTP route owns and
    // removes application-specific fields before verification.
    const entries = Object.entries(telegramPayload)
      .filter(
        ([key, value]) =>
          key !== "hash" && value !== undefined && value !== null
      )
      .map(([key, value]) => [key, String(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right))

    const authDate = readAuthDate(readEntry(entries, "auth_date"))
    const dataCheckString = entries
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")
    const secret = createHash("sha256").update(this.options.botToken).digest()
    const expectedHash = createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex")

    this.assertFresh(authDate)
    assertSafeHashEqual(actualHash, expectedHash)

    const telegramId = readEntry(entries, "id")

    if (!telegramId) {
      throw new TelegramAuthVerificationError(
        "missing_user_id",
        "Telegram id missing"
      )
    }

    return {
      telegramId,
      username: readEntry(entries, "username"),
      firstName: readEntry(entries, "first_name"),
      lastName: readEntry(entries, "last_name"),
      photoUrl: readEntry(entries, "photo_url"),
    }
  }

  private assertFresh(authDate: Date): void {
    const ageMs = this.clock.now().getTime() - authDate.getTime()

    if (ageMs > this.maxAgeMs || ageMs < -this.futureSkewMs) {
      throw new TelegramAuthVerificationError(
        "expired",
        "Telegram auth expired"
      )
    }
  }
}

function createTelegramCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parseTelegramUserJson(value: string | null): TelegramIdentity | null {
  if (!value) {
    return null
  }

  try {
    const user: unknown = JSON.parse(value)

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

function assertSafeHashEqual(actual: string, expected: string): void {
  if (!SHA256_HEX_PATTERN.test(actual) || !SHA256_HEX_PATTERN.test(expected)) {
    throw new TelegramAuthVerificationError(
      "invalid_signature",
      "Telegram auth invalid"
    )
  }

  const actualBuffer = Buffer.from(actual, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new TelegramAuthVerificationError(
      "invalid_signature",
      "Telegram auth invalid"
    )
  }
}

function readAuthDate(value: string | null | undefined): Date {
  const seconds = Number(value)

  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new TelegramAuthVerificationError(
      "invalid_auth_date",
      "Telegram auth_date invalid"
    )
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
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value)
  }

  return typeof value === "string" && value.trim() ? value.trim() : null
}
