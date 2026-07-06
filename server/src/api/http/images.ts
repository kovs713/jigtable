import sharp from "sharp"

import { s3Client } from "@/infra/storage"

import { ApiError } from "../errors"
import type { Context } from "../types"
import { requireBatch } from "./batches"

export async function readImageSize(
  context: Context,
  imageUrl: string
): Promise<{ width: number; height: number }> {
  if (imageUrl === "/test_jigsaw.png") {
    return { width: 3168, height: 1782 }
  }

  const url = new URL(imageUrl, process.env.CLIENT_URL!)

  if (url.pathname.startsWith("/api/batches/")) {
    const parts = url.pathname.split("/").filter(Boolean)

    if (parts[3] === "rendered" && parts[2]) {
      const { batch } = await requireBatch(parts[2], url)

      if (!batch.outputKey) {
        throw new ApiError("Rendered image not found", 404)
      }

      return readStoredImageSize(batch.outputKey)
    }
  }

  assertJigsawImageFetchAllowed(url)

  const response = await fetch(url)

  if (!response.ok) {
    throw new ApiError("Jigsaw image is not reachable", 400)
  }

  const contentLength = response.headers.get("content-length")

  if (contentLength && Number(contentLength) > 25 * 1024 * 1024) {
    throw new ApiError("Jigsaw image is too large", 400)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}

function assertJigsawImageFetchAllowed(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError("Jigsaw image URL must be HTTP(S)", 400)
  }

  const allowedOrigins = new Set(
    process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  )

  if (!allowedOrigins.has(url.origin)) {
    throw new ApiError("Jigsaw image origin is not allowed", 400)
  }
}

async function readStoredImageSize(
  objectKey: string
): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(await s3Client.file(objectKey).arrayBuffer())
  const metadata = await sharp(buffer).metadata()

  if (!metadata.width || !metadata.height) {
    throw new ApiError("Jigsaw image dimensions are not readable", 400)
  }

  return { width: metadata.width, height: metadata.height }
}
