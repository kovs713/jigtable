import { describe, expect, test } from "bun:test"

import { validateRedisUrl } from "@/services/redis/client"

describe("validateRedisUrl", () => {
  test("requires configuration", () => {
    expect(() => validateRedisUrl(undefined)).toThrow("REDIS_URL is required")
  })

  test("requires authentication", () => {
    expect(() => validateRedisUrl("redis://localhost:6379")).toThrow(
      "REDIS_URL must include a password"
    )
  })

  test("accepts an authenticated url", () => {
    expect(validateRedisUrl("redis://:secret@localhost:6379")).toBe(
      "redis://:secret@localhost:6379"
    )
  })
})
