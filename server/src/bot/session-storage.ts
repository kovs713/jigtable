import { eq } from "drizzle-orm"
import { type StorageAdapter } from "grammy"

import { db } from "../infra/db"
import { tgSessionsShema } from "../infra/db/shemas"

export function drizzleSessionStorage<T>(): StorageAdapter<T> {
  return {
    async read(key: string) {
      const result = await db
        .select()
        .from(tgSessionsShema)
        .where(eq(tgSessionsShema.key, key))
        .limit(1)

      return result[0] ? (result[0].value as T) : undefined
    },

    async write(key: string, value: T) {
      await db
        .insert(tgSessionsShema)
        .values({ key, value })
        .onConflictDoUpdate({
          target: tgSessionsShema.key,
          set: { value },
        })
    },

    async delete(key: string) {
      await db.delete(tgSessionsShema).where(eq(tgSessionsShema.key, key))
    },
  }
}
