export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": fallbackCorsOrigin,
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  Vary: "Origin",
}

export function corsHeaders(request?: Request): Headers {
  const headers = new Headers(CORS_HEADERS)
  const origin = request?.headers.get("Origin")

  if (origin && process.env.CORS_ORIGIN.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
  }

  return headers
}

export function applyCorsHeaders(
  response: Response,
  request: Request
): Response {
  const headers = new Headers(response.headers)

  for (const [key, value] of corsHeaders(request)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function readFallbackOrigin(origins: string[]): string {
  const origin = origins[0]

  if (!origin) {
    throw new Error("CORS_ORIGIN must include at least one URL")
  }

  return origin
}
