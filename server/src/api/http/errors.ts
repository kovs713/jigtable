export class ApiError extends Error {
  readonly status: number
  readonly expose: boolean
  readonly headers?: Record<string, string>

  constructor(
    message: string,
    status = 500,
    opts?: {
      expose?: boolean
      cause?: unknown
      headers?: Record<string, string>
    }
  ) {
    super(message, { cause: opts?.cause })

    this.name = "ApiError"
    this.status = status
    this.expose = opts?.expose ?? status < 500
    this.headers = opts?.headers
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
  code?: string,
  headers?: Record<string, string>
): Response {
  const body: ErrorResponseBody = {
    error: {
      message,
      ...(code ? { code } : {}),
    },
  }

  return Response.json(body, {
    status,
    headers,
  })
}

export function handleError(error: unknown): Response {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error(error)
    }

    return errorResponse(
      error.expose ? error.message : "Internal Server Error",
      error.status,
      undefined,
      error.headers
    )
  }

  console.error(error)

  return errorResponse("Internal Server Error", 500)
}
