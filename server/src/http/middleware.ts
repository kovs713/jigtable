import { ApiError, handleError } from "./errors"
import { CORS_HEADERS } from "./headers"
import type { Context, Middleware } from "./router"

export function cors(): Middleware {
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )

  return async (context: Context, next: () => Promise<Response>) => {
    const origin = context.request.headers.get("Origin")
    const corsHeaders = new Headers(CORS_HEADERS)

    if (origin && (allowedOrigins.has(origin) || isLocalhostOrigin(origin))) {
      corsHeaders.set("Access-Control-Allow-Origin", origin)
      corsHeaders.set("Vary", "Origin")
    }

    if (context.request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    const response = await next()
    const responseHeaders = new Headers(response.headers)

    for (const [key, value] of corsHeaders) {
      responseHeaders.set(key, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)

    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    )
  } catch {
    return false
  }
}

export function errorBoundary(): Middleware {
  return async (_context: Context, next: () => Promise<Response>) => {
    try {
      return await next()
    } catch (error) {
      return handleError(error)
    }
  }
}

export function resolveAuth(): Middleware {
  return async (context: Context, next: () => Promise<Response>) => {
    const token = readBearerToken(context.request)

    if (!token) {
      context.auth = {
        status: "anonymous",
      }

      return next()
    }

    const session = await context.services.auth.authenticate(token)

    context.auth = session
      ? {
          status: "authenticated",
          session,
        }
      : {
          status: "anonymous",
        }

    return next()
  }
}

export function resolveJigsawSession(): Middleware {
  return async (context: Context, next: () => Promise<Response>) => {
    const token = readPlayerSessionToken(context.request)

    if (!token) {
      context.jigsaw = {
        status: "anonymous",
      }

      return next()
    }

    const session = await context.services.playerSessions.get(token)

    context.jigsaw = session
      ? {
          status: "authenticated",
          session,
        }
      : {
          status: "anonymous",
        }

    return next()
  }
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null
  }

  return authorization.slice("bearer ".length).trim() || null
}

export function readPlayerSessionToken(request: Request): string | null {
  return (
    readBearerToken(request) ??
    new URL(request.url).searchParams.get("token")?.trim() ??
    null
  )
}

interface RateLimitEntry {
  resetAt: number
  count: number
}

interface RateLimitOptions {
  scope: string
  limit: number
  windowMs?: number
}

export function rateLimit({
  scope,
  limit,
  windowMs = 60_000,
}: RateLimitOptions): Middleware {
  const rateLimits = new Map<string, RateLimitEntry>()

  return async (context: Context, next: () => Promise<Response>) => {
    const now = Date.now()
    const clientIp = readClientIp(context.request)
    const key = `${scope}:${clientIp}`

    let entry = rateLimits.get(key)

    if (!entry || entry.resetAt <= now) {
      entry = {
        resetAt: now + windowMs,
        count: 0,
      }

      rateLimits.set(key, entry)
    }

    entry.count += 1

    const remaining = Math.max(0, limit - entry.count)

    if (entry.count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000)
      )
      throw new ApiError("Too many requests", 429, {
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      })
    }

    const response = await next()
    const headers = new Headers(response.headers)

    headers.set("RateLimit-Limit", String(limit))
    headers.set("RateLimit-Remaining", String(remaining))
    headers.set("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)))

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

function readClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  )
}
