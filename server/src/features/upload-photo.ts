import { LIMITS } from "@/config"
import { s3Client } from "@/infra/storage"
import { photoObjectKey } from "./photo-object-key"

export interface UploadedPhoto {
  objectKey: string
  contentType: string
}

export async function uploadPhoto(
  chatId: number,
  userId: number,
  fileUrl: string,
  fileId: string
): Promise<void> {
  await uploadPhotoToObjectKey(fileUrl, photoObjectKey(chatId, userId, fileId))
}

export async function uploadPhotoToObjectKey(
  fileUrl: string,
  objectKey: string
): Promise<UploadedPhoto> {
  const response = await fetch(fileUrl)
  if (!response.ok) {
    throw new Error(`Failed to download an image: ${response.status}`)
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg"

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Telegram file is not an image")
  }

  const buffer = await readLimitedResponseBuffer(
    response,
    LIMITS.uploadPhotoBytes
  )

  await s3Client.write(objectKey, buffer, { type: contentType })

  return { objectKey, contentType }
}

async function readLimitedResponseBuffer(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const contentLength = response.headers.get("content-length")

  if (contentLength) {
    const bytes = Number(contentLength)

    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new Error("Invalid Telegram file size")
    }

    if (bytes > maxBytes) {
      throw new Error("Telegram image is too large")
    }
  }

  if (!response.body) {
    return Buffer.from(await response.arrayBuffer())
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break
      if (!value) continue

      totalBytes += value.byteLength

      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new Error("Telegram image is too large")
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes
  )
}
