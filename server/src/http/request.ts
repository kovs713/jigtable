import { Json, record, type Schema } from "@jigtable/shared/schemas"

import { LIMITS } from "@/config"
import { ApiError } from "./errors"

export async function readJsonLimited(
  request: Request,
  maxBytes: number = LIMITS.jsonBodyBytes
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? ""

  if (!contentType.includes("application/json")) {
    throw new ApiError("Expected application/json body", 415)
  }

  const result = await Json(record(), { maxBytes }).parse(request)

  if (!result.ok) {
    throw new ApiError(
      result.error,
      result.error === "Request body too large" ? 413 : 400
    )
  }

  return result.value
}

export function parseApiSchema<T>(
  schema: Schema<T>,
  value: unknown,
  name: string
): T {
  const result = schema.parse(value, name)

  if (!result.ok) {
    throw new ApiError(result.error, 400)
  }

  return result.value
}
