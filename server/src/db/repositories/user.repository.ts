import { eq } from "drizzle-orm"

import { db } from "@/db"
import { usersSchema } from "@/db/schemas"
import type {
  UpdateUserProfileInput,
  UpsertTelegramUserInput,
  User,
} from "@/services/auth"

export interface UserRepository {
  findById(userId: string): Promise<User | null>

  upsertTelegramUser(input: UpsertTelegramUserInput): Promise<User>

  updateProfile(
    userId: string,
    input: UpdateUserProfileInput,
    updatedAt: Date
  ): Promise<User | null>
}

export class DrizzleUserRepository implements UserRepository {
  async findById(userId: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(usersSchema)
      .where(eq(usersSchema.id, userId))
      .limit(1)

    return user ? mapUser(user) : null
  }

  async upsertTelegramUser(input: UpsertTelegramUserInput): Promise<User> {
    const { identity, newUserProfile, now } = input
    const [user] = await db
      .insert(usersSchema)
      .values({
        telegramId: identity.telegramId,
        username: identity.username ?? null,
        firstName: identity.firstName ?? null,
        lastName: identity.lastName ?? null,
        photoUrl: identity.photoUrl ?? null,
        displayName: newUserProfile.displayName,
        color: newUserProfile.color,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      })
      .onConflictDoUpdate({
        target: usersSchema.telegramId,
        set: {
          username: identity.username ?? null,
          firstName: identity.firstName ?? null,
          lastName: identity.lastName ?? null,
          photoUrl: identity.photoUrl ?? null,
          updatedAt: now,
          lastLoginAt: now,
        },
      })
      .returning()

    if (!user) {
      throw new Error("User upsert failed")
    }

    return mapUser(user)
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileInput,
    updatedAt: Date
  ): Promise<User | null> {
    const [user] = await db
      .update(usersSchema)
      .set({
        ...input,
        updatedAt,
      })
      .where(eq(usersSchema.id, userId))
      .returning()

    return user ? mapUser(user) : null
  }
}

function mapUser(user: typeof usersSchema.$inferSelect): User {
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
