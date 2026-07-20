import type { Schema } from "@jigtable/shared/schemas"

import { ApiError } from "@/http/errors"

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
