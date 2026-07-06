import type { WsSocket } from "./websockets"

export class ApiError extends Error {
  readonly status: number
  readonly expose: boolean

  constructor(
    message: string,
    status = 500,
    opts?: {
      expose?: boolean
      cause?: unknown
    }
  ) {
    super(message, { cause: opts?.cause })

    this.name = "ApiError"
    this.status = status
    this.expose = opts?.expose ?? status < 500
  }
}

export type ErrorResponseBody = {
  error: {
    message: string
    code?: string
  }
}

export function errorResponse(
  message: string,
  status: number,
  code?: string
): Response {
  const body: ErrorResponseBody = {
    error: {
      message,
      ...(code ? { code } : {}),
    },
  }

  return Response.json(body, { status })
}

export function handleError(error: unknown): Response {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(error)
    }

    return errorResponse(
      error.expose ? error.message : "Internal Server Error",
      error.status
    )
  }

  console.error(error)

  return errorResponse("Internal Server Error", 500)
}

export function sendWsError(
  socket: WsSocket,
  code: string,
  message: string
): void {
  sendJson(socket, {
    type: "error",
    code,
    message,
  })
}

export function sendJson(socket: WsSocket, value: unknown): void {
  const result = socket.send(JSON.stringify(value))

  if (result === 0) {
    console.warn("WebSocket message dropped")
  }

  if (result === -1) {
    console.warn("WebSocket backpressure")
  }
}
