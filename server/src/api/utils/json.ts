import type { HeadersInit } from "bun"

import { corsHeaders } from "@/api/constants"

export function json(
  value: unknown,
  status = 200,
  headers?: HeadersInit,
  request?: Request
): Response {
  const responseHeaders = corsHeaders(request)

  responseHeaders.set("Content-Type", "application/json; charset=utf-8")

  if (headers) {
    const extraHeaders = new Headers(headers)

    for (const [key, value] of extraHeaders) {
      responseHeaders.set(key, value)
    }
  }

  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  })
}
