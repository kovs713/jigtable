import { LIMITS } from "@/config"
import { Json, record, type Schema } from "@jigtable/shared"
import type { BunRequest } from "bun"

import { ApiError } from "../errors"

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal error"
}

export async function readJsonLimited(
  request: BunRequest,
  maxBytes: number = LIMITS.jsonBodyBytes
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") ?? ""

  if (!contentType.includes("application/json")) {
    throw new ApiError("Expected application/json body", 415)
  }

  const result = await Json(record(), { maxBytes }).parse(request)

  if (!result.ok) {
    throw new ApiError(result.error, jsonErrorStatus(result.error))
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

function jsonErrorStatus(error: string): number {
  return error === "Request body too large" ? 413 : 400
}
