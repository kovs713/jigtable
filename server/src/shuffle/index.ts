import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export interface ShuffleImageInput {
  id: string
  src: string
  width: number
  height: number
}

export interface ShuffleInput {
  images: ShuffleImageInput[]
  count?: number
}

export interface ShuffleOptions {
  gap?: number
  targetAspectRatio?: number
  targetImageArea?: number
  maxAspectRatioDistortion?: number
}

export interface ShuffleCanvas {
  width: number
  height: number
}

export interface ShuffleItem {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  zIndex?: number
}

export interface ShuffleResult {
  canvas: ShuffleCanvas
  items: ShuffleItem[]
}

interface NativeShuffleModule {
  shuffleImages(input: ShuffleInput, options?: ShuffleOptions): ShuffleResult
}

const native = require("./image_shuffle_native.node") as NativeShuffleModule

export function shuffleImages(
  input: ShuffleInput,
  options: ShuffleOptions = {}
): ShuffleResult {
  return native.shuffleImages(input, options)
}
