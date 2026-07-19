import { RedisClient } from "bun"

const REDIS_CONNECT_TIMEOUT_MS = 5_000

let client: RedisClient | null = null

export function getRedisClient(): RedisClient {
  client ??= new RedisClient(readRedisUrl(), {
    connectionTimeout: REDIS_CONNECT_TIMEOUT_MS,
    maxRetries: 2,
    enableOfflineQueue: false,
  })

  return client
}

export async function connectRedis(): Promise<void> {
  const redis = getRedisClient()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      redis.connect(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Redis connection timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`
            )
          )
        }, REDIS_CONNECT_TIMEOUT_MS)
      }),
    ])
    await redis.send("PING", [])
  } catch (error) {
    closeRedis()
    throw error
  } finally {
    clearTimeout(timeout)
  }
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
