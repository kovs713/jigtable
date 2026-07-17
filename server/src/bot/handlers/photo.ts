import type { PhotoContext } from "@/bot/types"
import { scheduleUploadStatusRefresh } from "@/bot/upload"
import { LIMITS } from "@/config"
import { db } from "@/db"
import { compositionSourceImagesSchema } from "@/db/schemas"
import { uploadPhotoToObjectKey } from "@/storage/upload-photo"
import { compositionSourceImageObjectKey } from "@/storage/utils"

export async function handlePhoto(ctx: PhotoContext): Promise<void> {
  const photos = ctx.message.photo

  if (!ctx.session.isStarted || !ctx.session.activeCompositionId) {
    await ctx.reply(ctx.t("photo-start-first"))
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

  if (session.images.length >= LIMITS.photosPerComposition) {
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
    const objectKey = compositionSourceImageObjectKey(
      ctx.session.activeCompositionId,
      photoId
    )
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
    const uploaded = await uploadPhotoToObjectKey(fileUrl, objectKey)
    const sortOrder = session.images.length

    await db.insert(compositionSourceImagesSchema).values({
      fileId: photoId,
      compositionId: ctx.session.activeCompositionId,
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
      compositionId: ctx.session.activeCompositionId,
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
