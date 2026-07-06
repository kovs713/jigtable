import { readAuthToken } from "@/auth"
import { db } from "@/infra/db"
import { batchesSchema, batchPhotosSchema } from "@/infra/db/schemas"
import { and, asc, eq } from "drizzle-orm"

import { ApiError } from "../errors"
import type { Context } from "../types"

export async function requireAuthorizedBatch(
  context: Context,
  batchId: string,
  url: URL
) {
  const token = readAuthToken(context.request)

  if (!token) {
    throw new ApiError("Auth token required", 401)
  }

  const session = await context.services.auth.getSession(token)

  if (!session) {
    throw new ApiError("Auth session not found", 401)
  }

  return requireBatch(batchId, url)
}

export async function requireBatch(batchId: string, url: URL) {
  const token = url.searchParams.get("token")

  if (!batchId) {
    throw new ApiError("Batch id is required", 400)
  }

  if (!token) {
    throw new ApiError("Token is required", 401)
  }

  const [batch] = await db
    .select()
    .from(batchesSchema)
    .where(
      and(
        eq(batchesSchema.batchId, batchId),
        eq(batchesSchema.editToken, token)
      )
    )

  if (!batch) {
    throw new ApiError("Batch not found", 404)
  }

  const photos = await db
    .select()
    .from(batchPhotosSchema)
    .where(eq(batchPhotosSchema.batchId, batch.batchId))
    .orderBy(asc(batchPhotosSchema.sortOrder))

  return { batch, photos }
}
