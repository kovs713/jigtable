import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"

import { readRequiredEnv } from "@/infra/env"

const createDb = () => {
  const client = new SQL(readRequiredEnv("DB_URL"))
  return drizzle({ client })
}

export let db = createDb()

export async function reconnectDb(): Promise<void> {
  const previousDb = db
  db = createDb()

  try {
    await previousDb.$client.close()
  } catch (error) {
    throw new Error("DB reconnect cleanup failed", { cause: error })
  }
}
