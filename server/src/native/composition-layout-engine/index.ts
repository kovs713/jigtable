import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export interface SourceImage {
  id: string
  src: string
  width: number
  height: number
}

export interface CompositionLayoutInput {
  images: SourceImage[]
  imageCount?: number
}

export interface CompositionLayoutOptions {
  gap?: number
  targetAspectRatio?: number
  targetImageArea?: number
  maxAspectRatioDistortion?: number
}

interface CanvasLayout {
  width: number
  height: number
}

export interface CompositionLayoutItem {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  zIndex?: number
}

export interface CompositionLayout {
  canvas: CanvasLayout
  items: CompositionLayoutItem[]
}

interface NativeCompositionLayoutEngineModule {
  generateCompositionLayout(
    input: CompositionLayoutInput,
    options?: CompositionLayoutOptions
  ): CompositionLayout
}

const native =
  require("./composition_layout_engine_native.node") as NativeCompositionLayoutEngineModule

export function generateCompositionLayout(
  input: CompositionLayoutInput,
  options: CompositionLayoutOptions = {}
): CompositionLayout {
  return native.generateCompositionLayout(input, options)
}
