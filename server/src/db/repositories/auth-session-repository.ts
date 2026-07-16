import { and, eq, gt } from "drizzle-orm"

import { db } from "@/db"
import { authSessionsSchema } from "@/db/schemas"
import type {
  AuthSessionRepository,
  CreateAuthSessionInput,
  StoredAuthSession,
} from "@/services/auth/contracts"

export class DrizzleAuthSessionRepository implements AuthSessionRepository {
  async create(input: CreateAuthSessionInput): Promise<void> {
    await db.insert(authSessionsSchema).values({
      tokenHash: input.tokenHash,
      userId: input.userId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      expiresAt: input.expiresAt,
    })
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date
  ): Promise<StoredAuthSession | null> {
    const [session] = await db
      .select({
        userId: authSessionsSchema.userId,
        expiresAt: authSessionsSchema.expiresAt,
      })
      .from(authSessionsSchema)
      .where(
        and(
          eq(authSessionsSchema.tokenHash, tokenHash),
          gt(authSessionsSchema.expiresAt, now)
        )
      )
      .limit(1)

    return session ?? null
  }

  async touch(tokenHash: string, updatedAt: Date): Promise<void> {
    await db
      .update(authSessionsSchema)
      .set({ updatedAt })
      .where(eq(authSessionsSchema.tokenHash, tokenHash))
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db
      .delete(authSessionsSchema)
      .where(eq(authSessionsSchema.tokenHash, tokenHash))
  }
}
