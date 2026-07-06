import type { BunRequest } from "bun"

import { ApiError } from "../errors"

const rateLimits = new Map<string, { resetAt: number; count: number }>()

export function assertRateLimit(
  request: BunRequest,
  scope: string,
  limit: number
): void {
  const now = Date.now()
  const key = `${scope}:${readClientIp(request)}`
  const current = rateLimits.get(key)

  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { resetAt: now + 60_000, count: 1 })
    return
  }

  current.count += 1

  if (current.count > limit) {
    throw new ApiError("Too many requests", 429)
  }
}

function readClientIp(request: BunRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  )
}
