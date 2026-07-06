import { CORS_HEADERS } from "./constants"
import { handleError, sendWsError } from "./errors"
import type { Context, Middleware } from "./types"
import type { WsMiddleware } from "./websockets"

export function cors(): Middleware {
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )

  return async (context, next) => {
    const request = context.request
    const origin = request?.headers.get("Origin")

    const corsHeaders = new Headers(CORS_HEADERS)

    if (origin && (allowedOrigins.has(origin) || isLocalhostOrigin(origin))) {
      corsHeaders.set("Access-Control-Allow-Origin", origin)
      corsHeaders.set("Vary", "Origin")
    }

    if (request.method == "OPTIONS") {
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

export function parseWsJson(): WsMiddleware {
  return async (context, next) => {
    if (typeof context.raw !== "string") {
      sendWsError(context.socket, "invalid_message", "Message must be string")
      return
    }

    try {
      context.message = JSON.parse(context.raw)
    } catch {
      sendWsError(context.socket, "invalid_json", "Invalid JSON")
      return
    }

    await next()
  }
}

export function wsRequireAuth(): WsMiddleware {
  return async (context, next) => {
    if (!context.userId) {
      sendWsError(context.socket, "unauthorized", "Unauthorized")
      return
    }

    await next()
  }
}

export function wsErrorBoundary(): WsMiddleware {
  return async (context, next) => {
    try {
      await next()
    } catch (error) {
      console.error("WebSocket error", error)

      sendWsError(context.socket, "internal_error", "Internal error")
    }
  }
}
