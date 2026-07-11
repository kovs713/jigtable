import { s3Client } from "./client"
import { photoObjectKey } from "./utils"

export async function deletePhoto(
  chatId: number,
  userId: number,
  fileId: string
): Promise<void> {
  const objectKey = photoObjectKey(chatId, userId, fileId)
  const isExist = await s3Client.exists(objectKey)
  if (isExist) {
    await s3Client.delete(objectKey)
  }
}
