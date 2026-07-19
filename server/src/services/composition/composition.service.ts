import type { CompositionRepository } from "@/db/repositories"
import type { CompositionWithSourceImages } from "./contracts"
import type { Composition } from "@/db/schemas"

export class CompositionService {
  constructor(private readonly repository: CompositionRepository) {}

  async getComposition(
    id: string,
    editToken: string
  ): Promise<Composition | null> {
    return this.repository.findCompositionByIdAndToken(id, editToken)
  }

  async getEditableSourceImages(compositionId: string, editToken: string) {
    return this.repository.findEditableSourceImagesByCompositionIdAndToken(
      compositionId,
      editToken
    )
  }

  async getCompositionWithSorceImages(
    id: string,
    editToken: string
  ): Promise<CompositionWithSourceImages | null> {
    return this.repository.findWithSourceImagesByIdAndToken(id, editToken)
  }
}
