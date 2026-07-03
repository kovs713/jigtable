import type { BunRequest } from "bun"

import { ApiError } from "@/api/types"
import { LIMITS } from "@/config"

export async function readJsonLimited(
  request: BunRequest,
  options?: {
    maxBytes?: number
    optional?: boolean
  }
): Promise<unknown> {
  const maxBytes = options?.maxBytes ?? LIMITS.jsonBodyBytes
  const optional = options?.optional ?? false

  const contentType = request.headers.get("content-type") ?? ""

  if (!contentType.includes("application/json")) {
    if (optional) return undefined

    throw new ApiError("Expected application/json body", 415)
  }

  const contentLengthHeader = request.headers.get("content-length")

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)

    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new ApiError("Invalid Content-Length", 400)
    }

    if (contentLength > maxBytes) {
      throw new ApiError("Request body too large", 413)
    }
  }

  if (!request.body) {
    if (optional) return undefined

    throw new ApiError("Missing request body", 400)
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []

  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break
      if (!value) continue

      totalBytes += value.byteLength

      if (totalBytes > maxBytes) {
        throw new ApiError("Request body too large", 413)
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes == 0) {
    if (optional) return undefined

    throw new ApiError("Empty request body", 400)
  }

  const buffer = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  const text = new TextDecoder().decode(buffer)

  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError("Invalid JSON", 400)
  }
}
