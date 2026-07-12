import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { compositionSourceImagesSchema, compositionsSchema } from "@/db/schemas"
import { ApiError } from "./errors"

// FIX: this is a repository isn't it
export async function getCompositionAndImagesByIdAndToken(
  compositionId: string,
  token: string
) {
  const [composition] = await db
    .select()
    .from(compositionsSchema)
    .where(
      and(
        eq(compositionsSchema.compositionId, compositionId),
        eq(compositionsSchema.editToken, token)
      )
    )

  if (!composition) {
    throw new ApiError("Composition not found", 404)
  }

  const sourceImages = await db
    .select()
    .from(compositionSourceImagesSchema)
    .where(
      eq(compositionSourceImagesSchema.compositionId, composition.compositionId)
    )
    .orderBy(asc(compositionSourceImagesSchema.sortOrder))

  return { composition, sourceImages }
}
