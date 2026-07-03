export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    public readonly code = "API_ERROR"
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function toApiError(error: unknown): {
  status: number
  body: { error: string; code?: string }
} {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
      },
    }
  }

  console.error("Unhandled API error", error)

  return {
    status: 500,
    body: {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    },
  }
}
