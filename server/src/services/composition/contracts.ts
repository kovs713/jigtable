import type { Composition, CompositionSourceImage } from "@/db/schemas"

export type CompositionWithSourceImages = {
  composition: Composition
  sourceImages: CompositionSourceImage[]
}
