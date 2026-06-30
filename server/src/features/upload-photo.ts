import { s3Client } from "../infra/storage"
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

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const contentType = response.headers.get("content-type") ?? "image/jpeg"

  await s3Client.write(objectKey, buffer, { type: contentType })

  return { objectKey, contentType }
}
