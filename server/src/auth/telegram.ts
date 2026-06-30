import { and, eq, gt } from "drizzle-orm"
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { db } from "../infra/db"
import { authSessionsSchema, usersSchema } from "../infra/db/shemas"

const AUTH_SESSION_DAYS = 30
const TELEGRAM_AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface TelegramAuthProfile {
  telegramId: string
  username?: string
  firstName?: string
  lastName?: string
  photoUrl?: string
}

export interface AuthenticatedUser {
  id: string
  telegramId: string
  username: string | null
  firstName: string | null
  lastName: string | null
  photoUrl: string | null
  displayName: string
  color: string
}

export interface AuthSessionResult {
  token: string
  user: AuthenticatedUser
}

export class TelegramAuthService {
  async login(profile: TelegramAuthProfile, anonProfile?: UserProfileInput) {
    const user = await upsertTelegramUser(profile, anonProfile)
    const token = createAuthToken()
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000
    )

    await db.insert(authSessionsSchema).values({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })

    return { token, user } satisfies AuthSessionResult
  }

  async getUser(token: string): Promise<AuthenticatedUser | null> {
    const tokenHash = hashToken(token)
    const sessionRows = await db
      .select()
      .from(authSessionsSchema)
      .where(
        and(
          eq(authSessionsSchema.tokenHash, tokenHash),
          gt(authSessionsSchema.expiresAt, new Date())
        )
      )
      .limit(1)
    const session = sessionRows[0]

    if (!session) {
      return null
    }

    const userRows = await db
      .select()
      .from(usersSchema)
      .where(eq(usersSchema.id, session.userId))
      .limit(1)
    const user = userRows[0]

    if (!user) {
      return null
    }

    await db
      .update(authSessionsSchema)
      .set({ updatedAt: new Date() })
      .where(eq(authSessionsSchema.tokenHash, tokenHash))

    return toAuthenticatedUser(user)
  }

  async logout(token: string): Promise<void> {
    await db
      .delete(authSessionsSchema)
      .where(eq(authSessionsSchema.tokenHash, hashToken(token)))
  }
}

export interface UserProfileInput {
  name?: string
  color?: string
}

export function validateTelegramWebAppInitData(
  initData: string
): TelegramAuthProfile {
  const botToken = requireBotToken()
  const params = new URLSearchParams(initData)
  const hash = params.get("hash")

  if (!hash) {
    throw new Error("Telegram hash missing")
  }

  const authDate = readAuthDate(params.get("auth_date"))
  const dataCheckString = createTelegramCheckString(params)
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
  const botToken = requireBotToken()
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
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n")
  const secret = createHash("sha256").update(botToken).digest()
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

export function readAuthToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim()

    return token || null
  }

  return null
}

function createTelegramCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parseTelegramUserJson(value: string | null): TelegramAuthProfile | null {
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

async function upsertTelegramUser(
  profile: TelegramAuthProfile,
  anonProfile?: UserProfileInput
): Promise<AuthenticatedUser> {
  const existingRows = await db
    .select()
    .from(usersSchema)
    .where(eq(usersSchema.telegramId, profile.telegramId))
    .limit(1)
  const existing = existingRows[0]
  const now = new Date()

  if (existing) {
    const updatedRows = await db
      .update(usersSchema)
      .set({
        username: profile.username ?? null,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        photoUrl: profile.photoUrl ?? null,
        updatedAt: now,
        lastLoginAt: now,
      })
      .where(eq(usersSchema.id, existing.id))
      .returning()

    return toAuthenticatedUser(updatedRows[0] ?? existing)
  }

  const displayName = normalizeName(anonProfile?.name) ?? profileName(profile)
  const color = normalizeColor(anonProfile?.color) ?? colorFromSeed(profile.telegramId)
  const insertedRows = await db
    .insert(usersSchema)
    .values({
      telegramId: profile.telegramId,
      username: profile.username ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      photoUrl: profile.photoUrl ?? null,
      displayName,
      color,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })
    .returning()
  const inserted = insertedRows[0]

  if (!inserted) {
    throw new Error("User insert failed")
  }

  return toAuthenticatedUser(inserted)
}

function toAuthenticatedUser(user: typeof usersSchema.$inferSelect): AuthenticatedUser {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    displayName: user.displayName,
    color: user.color,
  }
}

function profileName(profile: TelegramAuthProfile): string {
  return (
    normalizeName(
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        profile.username
    ) ?? `tg_${profile.telegramId}`
  )
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

function readEntry(entries: readonly (readonly [string, string])[], key: string) {
  return entries.find(([entryKey]) => entryKey === key)?.[1]
}

function readString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }

  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeName(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ")

  return trimmed ? trimmed.slice(0, 24) : null
}

function normalizeColor(value: string | undefined): string | null {
  const color = value?.trim().toLowerCase()

  return color && /^#[0-9a-f]{6}$/.test(color) ? color : null
}

function colorFromSeed(seed: string): string {
  let hash = 0

  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hslToHex((hash % 360) / 360, 0.72, 0.58)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1))
  const match = lightness - chroma / 2
  const sector = Math.floor(hue * 6)
  const [red, green, blue] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${toHex(red + match)}${toHex(green + match)}${toHex(blue + match)}`
}

function toHex(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, "0")
}

function createAuthToken(): string {
  return randomBytes(32).toString("base64url")
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function requireBotToken(): string {
  if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is required")
  }

  return process.env.BOT_TOKEN
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
