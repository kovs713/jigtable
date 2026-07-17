import { eq } from "drizzle-orm"
import { type StorageAdapter } from "grammy"

import { db } from "@/db"
import { botSessionsSchema } from "@/db/schemas"

export function drizzleSessionStorage<T>(): StorageAdapter<T> {
  return {
    async read(key: string) {
      const result = await db
        .select()
        .from(botSessionsSchema)
        .where(eq(botSessionsSchema.key, key))
        .limit(1)

      return result[0] ? (result[0].value as T) : undefined
    },

    async write(key: string, value: T) {
      await db
        .insert(botSessionsSchema)
        .values({ key, value })
        .onConflictDoUpdate({
          target: botSessionsSchema.key,
          set: { value },
        })
    },

    async delete(key: string) {
      await db.delete(botSessionsSchema).where(eq(botSessionsSchema.key, key))
    },
  }
}
