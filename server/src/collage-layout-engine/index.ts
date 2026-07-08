import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export interface ImageSource {
  id: string
  src: string
  width: number
  height: number
}

export interface GenerateCollageLayoutInput {
  images: ImageSource[]
  count?: number
}

export interface CollageLayoutOptions {
  gap?: number
  targetAspectRatio?: number
  targetImageArea?: number
  maxAspectRatioDistortion?: number
}

export interface Canvas {
  width: number
  height: number
}

export interface LayoutItem {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  zIndex?: number
}

export interface CollageLayout {
  canvas: Canvas
  items: LayoutItem[]
}

interface NativeCollageLayoutEngineModule {
  generateCollageLayout(
    input: GenerateCollageLayoutInput,
    options?: CollageLayoutOptions
  ): CollageLayout
}

const native =
  require("./collage_layout_engine_native.node") as NativeCollageLayoutEngineModule

export function generateCollageLayout(
  input: GenerateCollageLayoutInput,
  options: CollageLayoutOptions = {}
): CollageLayout {
  return native.generateCollageLayout(input, options)
}
