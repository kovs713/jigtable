import { RedisClient } from "bun"

let client: RedisClient | null = null

export function getRedisClient(): RedisClient {
  client ??= new RedisClient(readRedisUrl())

  return client
}

export async function connectRedis(): Promise<void> {
  const redis = getRedisClient()

  await redis.connect()
  await redis.send("PING", [])
}

export function closeRedis(): void {
  client?.close()
  client = null
}

function readRedisUrl(): string {
  return validateRedisUrl(process.env.REDIS_URL)
}

export function validateRedisUrl(value: string | undefined): string {
  const normalized = value?.trim()

  if (!normalized) {
    throw new Error("REDIS_URL is required")
  }

  const url = new URL(normalized)

  if (!url.password) {
    throw new Error("REDIS_URL must include a password")
  }

  return normalized
}
