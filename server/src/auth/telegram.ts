import { SHA256 } from "bun"
import { and, eq, gt } from "drizzle-orm"
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { colorFromSeed } from "@/features/color-from-seed"
import { db } from "@/infra/db"
import { authSessionsSchema, usersSchema } from "@/infra/db/schemas"
import { isRecord } from "@jigtable/shared"
import {
  isWhitelistedTelegramUserId,
  requireWhitelistedTelegramUserId,
} from "./whitelist"

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
  expiresAt: string
}

export class TelegramAuthService {
  async login(profile: TelegramAuthProfile, anonProfile?: UserProfileInput) {
    await requireWhitelistedTelegramUserId(profile.telegramId)

    const user = await upsertTelegramUser(profile, anonProfile)
    const token = randomBytes(32).toString("base64url")
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000
    )

    await db.insert(authSessionsSchema).values({
      tokenHash: SHA256.hash(token, "hex"),
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })

    return {
      token,
      user,
      expiresAt: expiresAt.toISOString(),
    } satisfies AuthSessionResult
  }

  async getSession(token: string): Promise<AuthSessionResult | null> {
    const tokenHash = SHA256.hash(token, "hex")
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

    if (
      !user.telegramId.startsWith("dev_") &&
      !(await isWhitelistedTelegramUserId(user.telegramId))
    ) {
      return null
    }

    await db
      .update(authSessionsSchema)
      .set({ updatedAt: new Date() })
      .where(eq(authSessionsSchema.tokenHash, tokenHash))

    return {
      token,
      user: toAuthenticatedUser(user),
      expiresAt: session.expiresAt.toISOString(),
    }
  }

  async getUser(token: string): Promise<AuthenticatedUser | null> {
    return (await this.getSession(token))?.user ?? null
  }

  async logout(token: string): Promise<void> {
    await db
      .delete(authSessionsSchema)
      .where(eq(authSessionsSchema.tokenHash, SHA256.hash(token, "hex")))
  }

  async updateProfile(
    userId: string,
    input: { displayName?: string; color?: string }
  ): Promise<AuthenticatedUser> {
    const now = new Date()
    const setValues: Record<string, unknown> = { updatedAt: now }

    if (input.displayName !== undefined) {
      setValues.displayName = normalizeName(input.displayName) ?? "Player"
    }

    if (input.color !== undefined) {
      const color = normalizeColor(input.color)

      if (color) {
        setValues.color = color
      }
    }

    const [updated] = await db
      .update(usersSchema)
      .set(setValues as any)
      .where(eq(usersSchema.id, userId))
      .returning()

    if (!updated) {
      throw new Error("User not found")
    }

    return toAuthenticatedUser(updated)
  }

  async loginDev(telegramId?: string): Promise<AuthSessionResult> {
    const devTelegramId = telegramId?.trim() || `dev_${Date.now()}`
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000
    )

    const user = await upsertTelegramUser(
      { telegramId: devTelegramId, firstName: "Dev" },
      { name: "Dev User", color: "#3b82f6" }
    )

    const token = randomBytes(32).toString("base64url")

    await db.insert(authSessionsSchema).values({
      tokenHash: SHA256.hash(token, "hex"),
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })

    return {
      token,
      user,
      expiresAt: expiresAt.toISOString(),
    }
  }
}

export interface UserProfileInput {
  name?: string
  color?: string
}

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
  const color =
    normalizeColor(anonProfile?.color) ?? colorFromSeed(profile.telegramId)
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

function toAuthenticatedUser(
  user: typeof usersSchema.$inferSelect
): AuthenticatedUser {
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

function readEntry(
  entries: readonly (readonly [string, string])[],
  key: string
) {
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
