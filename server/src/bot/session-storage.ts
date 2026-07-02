import { eq } from "drizzle-orm"
import { type StorageAdapter } from "grammy"

import { db, reconnectDb } from "@/infra/db"
import { botSessionsSchema } from "@/infra/db/schemas"

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined
}

function errorCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : undefined
}

function isClosedPostgresConnection(error: unknown): boolean {
  return (
    errorCode(error) === "ERR_POSTGRES_CONNECTION_CLOSED" ||
    errorCode(errorCause(error)) === "ERR_POSTGRES_CONNECTION_CLOSED"
  )
}

async function withConnectionRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isClosedPostgresConnection(error)) {
      throw error
    }

    await reconnectDb()
    return operation()
  }
}

export function drizzleSessionStorage<T>(): StorageAdapter<T> {
  return {
    async read(key: string) {
      const result = await withConnectionRetry(() =>
        db
          .select()
          .from(botSessionsSchema)
          .where(eq(botSessionsSchema.key, key))
          .limit(1)
      )

      return result[0] ? (result[0].value as T) : undefined
    },

    async write(key: string, value: T) {
      await withConnectionRetry(() =>
        db.insert(botSessionsSchema).values({ key, value }).onConflictDoUpdate({
          target: botSessionsSchema.key,
          set: { value },
        })
      )
    },

    async delete(key: string) {
      await withConnectionRetry(() =>
        db.delete(botSessionsSchema).where(eq(botSessionsSchema.key, key))
      )
    },
  }
}
