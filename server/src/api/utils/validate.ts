import type { BunRequest } from "bun"

import { LIMITS } from "@/config"
import { publicApiUrl } from "@/features/urls"
import type { batchesSchema, batchPhotosSchema } from "@/infra/db/schemas"
import type { ShuffleItem, ShuffleResult } from "@/shuffle"
import { ApiError } from "../types"
import { readJsonLimited } from "./read-json-limited"

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal error"
}

export async function readOptionalJson(
  request: BunRequest
): Promise<Record<string, unknown> | null> {
  const value = await readJsonLimited(request, { optional: true })

  if (value === undefined) return null

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

  assertCanvasWithinLimits(canvas)

  if (value.items.length > LIMITS.layout.maxItems) {
    throw new ApiError(
      `items must contain at most ${LIMITS.layout.maxItems} entries`,
      400
    )
  }

  if (value.items.length > photos.length) {
    throw new ApiError("items cannot exceed source image count", 400)
  }

  const seenIds = new Set<string>()
  const items = value.items.map((rawItem, index): ShuffleItem => {
    if (!isRecord(rawItem)) {
      throw new ApiError(`items[${index}] must be an object`, 400)
    }

    const id = readString(rawItem.id, `items[${index}].id`)
    const photo = photoById.get(id)

    if (!photo) {
      throw new ApiError(`Unknown image id ${id}`, 400)
    }

    if (seenIds.has(id)) {
      throw new ApiError(`Duplicate image id ${id}`, 400)
    }

    seenIds.add(id)

    const width = readPositiveInteger(rawItem.width, `items[${index}].width`)
    const height = readPositiveInteger(rawItem.height, `items[${index}].height`)

    assertItemWithinLimits(index, width, height)

    const x = readInteger(rawItem.x, `items[${index}].x`)
    const y = readInteger(rawItem.y, `items[${index}].y`)
    const zIndex =
      rawItem.zIndex === undefined
        ? index
        : readInteger(rawItem.zIndex, `items[${index}].zIndex`)
    const scale =
      typeof rawItem.scale === "number" &&
      Number.isFinite(rawItem.scale) &&
      rawItem.scale > 0
        ? rawItem.scale
        : 1

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
      scale,
      zIndex,
    }
  })

  return { canvas, items }
}

function assertCanvasWithinLimits(canvas: ShuffleResult["canvas"]): void {
  if (canvas.width > LIMITS.layout.maxCanvasWidth) {
    throw new ApiError(
      `canvas.width must be at most ${LIMITS.layout.maxCanvasWidth}`,
      400
    )
  }

  if (canvas.height > LIMITS.layout.maxCanvasHeight) {
    throw new ApiError(
      `canvas.height must be at most ${LIMITS.layout.maxCanvasHeight}`,
      400
    )
  }

  if (canvas.width * canvas.height > LIMITS.layout.maxCanvasArea) {
    throw new ApiError(
      `canvas area must be at most ${LIMITS.layout.maxCanvasArea}`,
      400
    )
  }
}

function assertItemWithinLimits(
  index: number,
  width: number,
  height: number
): void {
  if (width > LIMITS.layout.maxItemWidth) {
    throw new ApiError(
      `items[${index}].width must be at most ${LIMITS.layout.maxItemWidth}`,
      400
    )
  }

  if (height > LIMITS.layout.maxItemHeight) {
    throw new ApiError(
      `items[${index}].height must be at most ${LIMITS.layout.maxItemHeight}`,
      400
    )
  }

  if (width * height > LIMITS.layout.maxItemArea) {
    throw new ApiError(
      `items[${index}] area must be at most ${LIMITS.layout.maxItemArea}`,
      400
    )
  }
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
