import type { BunRequest } from "bun"

import { publicApiUrl } from "@/features/urls"
import type { batchesSchema, batchPhotosSchema } from "@/infra/db/schemas"
import type { ShuffleItem, ShuffleResult } from "@/shuffle"
import { ApiError } from "../types"

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal error"
}

export async function readOptionalJson(
  request: BunRequest
): Promise<Record<string, unknown> | null> {
  const text = await request.text()

  if (!text.trim()) {
    return null
  }

  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    throw new ApiError("Request body must be valid JSON", 400)
  }

  if (!isRecord(value)) {
    throw new ApiError("Request body must be an object", 400)
  }

  return value
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(`${name} must be a string`, 400)
  }

  return value
}

export function readOptionalNonEmptyString(
  value: unknown,
  name: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return readString(value, name)
}

export function readOptionalPositiveInteger(
  value: unknown,
  name: string
): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  return readPositiveInteger(value, name)
}

export function readOptionalBoundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === null) {
    return fallback
  }

  const number = readInteger(value, name)

  if (number < min || number > max) {
    throw new ApiError(`${name} must be between ${min} and ${max}`, 400)
  }

  return number
}

export function readPositiveInteger(value: unknown, name: string): number {
  const number = readInteger(value, name)

  if (number <= 0) {
    throw new ApiError(`${name} must be positive`, 400)
  }

  return number
}

export function readInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(`${name} must be a number`, 400)
  }

  return Math.round(value)
}

export function toApiBatchLayout(
  batch: typeof batchesSchema.$inferSelect,
  layout: ShuffleResult
): ApiBatchLayout {
  return {
    batchId: batch.batchId,
    status: batch.status,
    layout: {
      canvas: layout.canvas,
      items: layout.items.map((item) => ({
        ...item,
        src: imageUrl(batch.batchId, batch.editToken, item.id),
      })),
    },
    outputUrl: batch.outputKey
      ? renderedUrl(batch.batchId, batch.editToken)
      : null,
  }
}

export interface ApiBatchLayout {
  batchId: string
  status: string | null
  layout: ShuffleResult
  outputUrl: string | null
}

export function normalizeLayout(
  raw: unknown,
  photos: PhotoRow[]
): ShuffleResult {
  const value = unwrapLayout(raw)

  if (
    !isRecord(value) ||
    !isRecord(value.canvas) ||
    !Array.isArray(value.items)
  ) {
    throw new ApiError("Invalid layout", 400)
  }

  const photoById = new Map(photos.map((photo) => [photo.fileId, photo]))
  const canvas = {
    width: readPositiveInteger(value.canvas.width, "canvas.width"),
    height: readPositiveInteger(value.canvas.height, "canvas.height"),
  }
  const items = value.items.map((rawItem, index): ShuffleItem => {
    if (!isRecord(rawItem)) {
      throw new ApiError(`items[${index}] must be an object`, 400)
    }

    const id = readString(rawItem.id, `items[${index}].id`)
    const photo = photoById.get(id)

    if (!photo) {
      throw new ApiError(`Unknown image id ${id}`, 400)
    }

    const width = readPositiveInteger(rawItem.width, `items[${index}].width`)
    const height = readPositiveInteger(rawItem.height, `items[${index}].height`)
    const x = readInteger(rawItem.x, `items[${index}].x`)
    const y = readInteger(rawItem.y, `items[${index}].y`)
    const zIndex =
      rawItem.zIndex === undefined
        ? index
        : readInteger(rawItem.zIndex, `items[${index}].zIndex`)

    if (
      x < 0 ||
      y < 0 ||
      x + width > canvas.width ||
      y + height > canvas.height
    ) {
      throw new ApiError(`items[${index}] is outside canvas`, 400)
    }

    return {
      id,
      src: photo.objectKey,
      x,
      y,
      width,
      height,
      scale: typeof rawItem.scale === "number" ? rawItem.scale : 1,
      zIndex,
    }
  })

  return { canvas, items }
}

export function unwrapLayout(raw: unknown): unknown {
  if (isRecord(raw) && isRecord(raw.layout)) {
    return raw.layout
  }

  return raw
}

export function imageUrl(
  batchId: string,
  token: string,
  fileId: string
): string {
  return `${publicApiUrl()}/api/batches/${batchId}/images/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}`
}

export function renderedUrl(batchId: string, token: string): string {
  return `${publicApiUrl()}/api/batches/${batchId}/rendered?token=${encodeURIComponent(token)}`
}

export type PhotoRow = typeof batchPhotosSchema.$inferSelect
