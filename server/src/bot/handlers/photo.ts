import type { PhotoContext } from "@/bot/types"
import { LIMITS } from "@/config"
import { batchPhotoObjectKey } from "@/features/object-keys"
import { uploadPhotoToObjectKey } from "@/features/upload-photo"
import { db } from "@/infra/db"
import { batchPhotosSchema } from "@/infra/db/schemas"
import { scheduleUploadStatusRefresh } from "@/bot/upload"

export async function handlePhoto(ctx: PhotoContext) {
  const photos = ctx.message.photo

  if (!ctx.session.isStarted || !ctx.session.activeBatchId) {
    await ctx.reply("сначала /new нажми")
    return
  }

  const bestPhoto = photos.at(-1)
  if (!bestPhoto) return

  if (!ctx.session.upload) {
    ctx.session.upload = {
      images: [],
      duplicateCount: 0,
      seenFileUniqueIds: [],
    }
  }

  const session = ctx.session.upload

  if (session.images.length >= LIMITS.photosPerBatch) {
    return
  }

  const fileUniqueId = ctx.message.photo.at(-1)?.file_unique_id
  if (fileUniqueId && session.seenFileUniqueIds.includes(fileUniqueId)) {
    session.duplicateCount++
    scheduleUploadStatusRefresh(ctx)
    return
  }

  if (bestPhoto.file_size && bestPhoto.file_size > LIMITS.uploadPhotoBytes) {
    return
  }

  try {
    const file = await ctx.api.getFile(bestPhoto.file_id)
    if (!file.file_path) {
      throw new Error("Telegram file path missing")
    }

    const photoId = crypto.randomUUID()
    const objectKey = batchPhotoObjectKey(ctx.session.activeBatchId, photoId)
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
    const uploaded = await uploadPhotoToObjectKey(fileUrl, objectKey)
    const sortOrder = session.images.length

    await db.insert(batchPhotosSchema).values({
      fileId: photoId,
      batchId: ctx.session.activeBatchId,
      objectKey: uploaded.objectKey,
      contentType: uploaded.contentType,
      sortOrder,
      width: bestPhoto.width,
      height: bestPhoto.height,
    })

    session.images.push({
      id: photoId,
      fileId: bestPhoto.file_id,
      fileUniqueId: fileUniqueId ?? "",
      width: bestPhoto.width,
      height: bestPhoto.height,
      fileSize: bestPhoto.file_size,
      sourceMessageId: ctx.message.message_id,
      mediaGroupId: ctx.message.media_group_id,
      status: "active",
      createdAt: Date.now(),
    })

    if (fileUniqueId) {
      session.seenFileUniqueIds.push(fileUniqueId)
    }

    ctx.session.photos.push(photoId)
  } catch (error) {
    console.error("Photo upload failed", {
      userId: ctx.from?.id ?? "-",
      batchId: ctx.session.activeBatchId,
      telegramFileId: bestPhoto.file_id,
      error: getErrorMessage(error),
    })
    return
  }

  scheduleUploadStatusRefresh(ctx)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
