import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import {
  compositionSourceImagesSchema,
  compositionsSchema,
  type Composition,
  type CompositionSourceImage,
} from "@/db/schemas"
import type { CompositionWithSourceImages } from "@/services/composition/contracts"

export interface CompositionRepository {
  findCompositionByIdAndToken(
    id: string,
    editToken: string
  ): Promise<Composition | null>

  findEditableSourceImagesByCompositionIdAndToken(
    compositionId: string,
    editToken: string
  ): Promise<CompositionSourceImage[] | null>

  findWithSourceImagesByIdAndToken(
    id: string,
    editToken: string
  ): Promise<CompositionWithSourceImages | null>
}

export class DrizzleCompositionRepository implements CompositionRepository {
  async findCompositionByIdAndToken(
    id: string,
    editToken: string
  ): Promise<Composition | null> {
    const [composition] = await db
      .select()
      .from(compositionsSchema)
      .where(
        and(
          eq(compositionsSchema.compositionId, id),
          eq(compositionsSchema.editToken, editToken)
        )
      )

    return composition ?? null
  }

  async findEditableSourceImagesByCompositionIdAndToken(
    compositionId: string,
    editToken: string
  ): Promise<CompositionSourceImage[] | null> {
    const rows = await db
      .select({
        compositionId: compositionsSchema.compositionId,
        sourceImage: compositionSourceImagesSchema,
      })
      .from(compositionsSchema)
      .leftJoin(
        compositionSourceImagesSchema,
        eq(
          compositionSourceImagesSchema.compositionId,
          compositionsSchema.compositionId
        )
      )
      .where(
        and(
          eq(compositionsSchema.compositionId, compositionId),
          eq(compositionsSchema.editToken, editToken)
        )
      )
      .orderBy(asc(compositionSourceImagesSchema.sortOrder))

    if (rows.length === 0) {
      return null
    }

    return rows.flatMap((row) => (row.sourceImage ? [row.sourceImage] : []))
  }

  async findWithSourceImagesByIdAndToken(
    id: string,
    editToken: string
  ): Promise<CompositionWithSourceImages | null> {
    const rows = await db
      .select({
        composition: compositionsSchema,
        sourceImage: compositionSourceImagesSchema,
      })
      .from(compositionsSchema)
      .leftJoin(
        compositionSourceImagesSchema,
        eq(
          compositionSourceImagesSchema.compositionId,
          compositionsSchema.compositionId
        )
      )
      .where(
        and(
          eq(compositionsSchema.compositionId, id),
          eq(compositionsSchema.editToken, editToken)
        )
      )
      .orderBy(asc(compositionSourceImagesSchema.sortOrder))

    const firstRow = rows[0]

    if (!firstRow) {
      return null
    }

    return {
      composition: firstRow.composition,
      sourceImages: rows.flatMap((row) =>
        row.sourceImage ? [row.sourceImage] : []
      ),
    }
  }
}
