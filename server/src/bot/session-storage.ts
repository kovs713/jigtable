import { eq } from "drizzle-orm"
import { type StorageAdapter } from "grammy"

import { db } from "../infra/db"
import { sessionsShema } from "../infra/db/shemas"

export function drizzleSessionStorage<T>(): StorageAdapter<T> {
  return {
    async read(key: string) {
      const result = await db
        .select()
        .from(sessionsShema)
        .where(eq(sessionsShema.key, key))
        .limit(1)

      return result[0] ? (result[0].value as T) : undefined
    },

    async write(key: string, value: T) {
      await db.insert(sessionsShema).values({ key, value }).onConflictDoUpdate({
        target: sessionsShema.key,
        set: { value },
      })
    },

    async delete(key: string) {
      await db.delete(sessionsShema).where(eq(sessionsShema.key, key))
    },
  }
}
