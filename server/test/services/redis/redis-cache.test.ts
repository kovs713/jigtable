import { describe, expect, test } from "bun:test"

import { RedisCache } from "@/services/redis/redis-cache"

describe("RedisCache", () => {
  test("stores namespaced values with ttl", async () => {
    const redis = new FakeRedis()
    const cache = new RedisCache(redis, "telegram-preview", 60)

    await cache.set("previews/room.jpg", "telegram-file-id")

    expect(await cache.get("previews/room.jpg")).toBe("telegram-file-id")
    expect(
      redis.expirations.get("jigtable:telegram-preview:previews/room.jpg")
    ).toBe(60)
  })

  test("deletes namespaced values", async () => {
    const redis = new FakeRedis()
    const cache = new RedisCache(redis, "telegram-preview", 60)

    await cache.set("previews/room.jpg", "telegram-file-id")
    await cache.delete("previews/room.jpg")

    expect(await cache.get("previews/room.jpg")).toBeNull()
  })
})

class FakeRedis {
  readonly values = new Map<string, string>()
  readonly expirations = new Map<string, number>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async send(command: string, args: string[]): Promise<unknown> {
    if (command !== "SET") {
      throw new Error(`Unsupported command: ${command}`)
    }

    const [key, value, expirationMode, seconds] = args

    if (!key || value === undefined || expirationMode !== "EX" || !seconds) {
      throw new Error("Invalid SET command")
    }

    this.values.set(key, value)
    this.expirations.set(key, Number(seconds))
    return "OK"
  }

  async del(key: string): Promise<unknown> {
    this.values.delete(key)
    this.expirations.delete(key)
    return 1
  }
}
