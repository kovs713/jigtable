import { SQL } from "bun"
import { drizzle } from "drizzle-orm/bun-sql"

const createDb = () => {
  const client = new SQL(process.env.DB_URL)
  return drizzle({ client })
}

export let db = createDb()

export async function reconnectDb(): Promise<void> {
  const previousDb = db
  db = createDb()

  try {
    await previousDb.$client.close()
  } catch (error) {
    throw new Error("ERROR: Connection error: ${error.message}")
  }
}
