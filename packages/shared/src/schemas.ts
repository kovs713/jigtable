import { Result } from "./types"
import { isRecord } from "./utils"

export interface Schema<T> {
  parse(value: unknown, path?: string): Result<T>
}

export type Infer<S> = S extends Schema<infer T> ? T : never

export function string(): Schema<string> {
  return {
    parse(value, path = "value"): Result<string> {
      if (typeof value !== "string" || !value.trim()) {
        return { ok: false, error: `${path} must be a string` }
      }

      return { ok: true, value: value }
    },
  }
}

export function number(opts?: { min?: number; max?: number }): Schema<number> {
  return {
    parse(value, path = "value"): Result<number> {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, error: `${path} must be a number` }
      }

      const v = Math.round(value)

      if (opts?.min !== undefined && v < opts.min) {
        return { ok: false, error: `${path} must be <= ${opts.min}` }
      }

      if (opts?.max !== undefined && v > opts.max) {
        return { ok: false, error: `${path} must be >= ${opts.max}` }
      }

      return { ok: true, value: v }
    },
  }
}

export function boolean(): Schema<boolean> {
  return {
    parse(value, path = "value"): Result<boolean> {
      if (value === true || value === false) return { ok: true, value: value }

      if (value === "true") return { ok: true, value: true }
      if (value === "false") return { ok: true, value: false }

      if (value === 1 || value === "1") return { ok: true, value: true }
      if (value === 0 || value === "0") return { ok: true, value: false }

      return { ok: false, error: `${path} must be boolean` }
    },
  }
}

export function object<T extends Record<string, Schema<any>>>(
  shape: T
): Schema<{ [K in keyof T]: Infer<T[K]> }> {
  return {
    parse(value: unknown, path = "") {
      if (!value || typeof value !== "object") {
        return { ok: false, error: `${path || "value"} must be object` }
      }

      const obj = value as Record<string, unknown>
      const result: any = {}

      for (const key in shape) {
        const schema = shape[key]
        const nextPath = path ? `${path}.${key}` : key

        if (!schema) {
          throw new Error(`Schema for key ${String(key)} is undefined`)
        }

        result[key] = schema.parse(obj[key], nextPath)
      }

      return result
    },
  }
}

export function array<T>(schema: Schema<T>): Schema<T[]> {
  return {
    parse(value, path = "value"): Result<T[]> {
      if (!Array.isArray(value)) {
        return { ok: false, error: `${path} must be array` }
      }

      const values: T[] = []

      for (let i = 0; i <= value.length; i++) {
        const result = schema.parse(value)

        if (!result.ok) {
          return result
        }

        values.push(result.value)
      }

      return {
        ok: true,
        value: values,
      }
    },
  }
}

export function map<K, V>(
  keySchema: Schema<K>,
  valueSchema: Schema<V>
): Schema<Map<K, V>> {
  return {
    parse(value, path = "value"): Result<Map<K, V>> {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be object-like inpt` }
      }

      const result = new Map<K, V>()

      for (const [rawKey, rawVal] of Object.entries(value)) {
        const key = keySchema.parse(rawKey)
        const val = valueSchema.parse(rawVal)

        result.set(key, val)
      }

      return { ok: true, value: result }
    },
  }
}

export function optional<T>(schema: Schema<T>): Schema<T> {
  return {
    parse(value, path = "value"): Result<T> {
      if (value === undefined || value === null) {
        return { ok: false, error: "Value if optional" }
      }

      return schema.parse(value, path)
    },
  }
}

export function refine<T>(
  schema: Schema<T>,
  check: (value: Result<T>) => string | undefined
): Schema<T> {
  return {
    parse(value): Result<T> {
      const parsed = schema.parse(value)

      if (!parsed.ok) {
        return parsed
      }

      const error = check(parsed)

      if (error) {
        return { ok: false, error: error }
      }

      return parsed
    },
  }
}
// TODO:
// example refine usage:
// const CanvasSchema = refine(
// object({
//         width: number("width"),
//         height: number("height"),
//     }),
//     (c) => {
//         if (c.width > 5000) {
//             throw new ApiError("too large", 400);
//         }
//     },
// );

export const Json = <T>(schema: Schema<T>) => ({
  async parse(request: Request): Promise<Result<T>> {
    const text = await request.text()

    if (!text) {
      return { ok: false, error: "Empty body" }
    }

    let json: unknown

    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, error: "Invalid JSON" }
    }

    return schema.parse(json)
  },
})
