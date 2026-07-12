import { and, eq, gt } from "drizzle-orm"

import { colorFromSeed } from "@jigtable/shared/utils"

import { db } from "@/db"
import { authSessionsSchema, usersSchema } from "@/db/schemas"
import type {
  AuthSessionResult,
  AuthenticatedUser,
  TelegramAuthProfile,
  UserProfileInput,
} from "./auth-types"
import { createAuthToken, hashAuthToken } from "./token"
import { toAuthenticatedUser } from "./user-mappers"
import { normalizeColor, normalizeName, profileName } from "./user-profile"
import {
  isWhitelistedUser,
  requireWhitelistedTelegramUserId,
} from "./whitelist"

const AUTH_SESSION_DAYS = 30

export class AuthService {
  async login(
    profile: TelegramAuthProfile,
    anonProfile?: UserProfileInput
  ): Promise<AuthSessionResult> {
    await requireWhitelistedTelegramUserId(Number(profile.telegramId))

    const user = await upsertTelegramUser(profile, anonProfile)
    const token = createAuthToken()
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000
    )

    await db.insert(authSessionsSchema).values({
      tokenHash: hashAuthToken(token),
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

  async getSession(token: string): Promise<AuthSessionResult | null> {
    const tokenHash = hashAuthToken(token)
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
      !(await isWhitelistedUser(Number(user.telegramId)))
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
      .where(eq(authSessionsSchema.tokenHash, hashAuthToken(token)))
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
      {
        telegramId: devTelegramId,
        firstName: "Dev",
      },
      {
        name: "Dev User",
        color: "#3b82f6",
      }
    )
    const token = createAuthToken()

    await db.insert(authSessionsSchema).values({
      tokenHash: hashAuthToken(token),
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
