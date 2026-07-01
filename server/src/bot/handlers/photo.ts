import { batchPhotoObjectKey } from "@/features/object-keys"
import { uploadPhotoToObjectKey } from "@/features/upload-photo"
import { db } from "@/infra/db"
import { batchPhotosSchema } from "@/infra/db/shemas"
import type { PhotoContext } from "@/bot/types"

export async function handlePhoto(ctx: PhotoContext) {
  const photos = ctx.message.photo

  if (!ctx.session.isStarted || !ctx.session.activeBatchId) {
    await ctx.reply("бля всему учить нада, далбаеб сначала /new нажми")
    return
  }

  const bestPhoto = photos.at(-1)
  if (!bestPhoto) return

  const file = await ctx.api.getFile(bestPhoto.file_id)
  if (!file.file_path) {
    throw new Error("Telegram file path missing")
  }

  const photoId = crypto.randomUUID()
  const objectKey = batchPhotoObjectKey(ctx.session.activeBatchId, photoId)
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
  const uploaded = await uploadPhotoToObjectKey(fileUrl, objectKey)
  const sortOrder = ctx.session.photos.length

  await db.insert(batchPhotosSchema).values({
    fileId: photoId,
    batchId: ctx.session.activeBatchId,
    objectKey: uploaded.objectKey,
    contentType: uploaded.contentType,
    sortOrder,
    width: bestPhoto.width,
    height: bestPhoto.height,
  })

  ctx.session.photos.push(photoId)
  await ctx.reply(`принял ${ctx.session.photos.length}`)
}
