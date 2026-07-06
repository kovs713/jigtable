import { Texture } from "pixi.js"

export interface LoadedImageTexture {
  texture: Texture
  averageLuminance: number | null
}

const SAMPLE_SIZE = 32

export async function loadImageTexture(
  imageUrl: string
): Promise<LoadedImageTexture> {
  const image = new Image()
  image.crossOrigin = "anonymous"
  image.decoding = "async"

  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Jigsaw image failed to load"))
  })

  image.src = new URL(imageUrl, window.location.href).toString()
  await loaded

  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("Jigsaw image is invalid")
  }

  return {
    texture: Texture.from(image),
    averageLuminance: estimateImageLuminance(image),
  }
}

function estimateImageLuminance(image: HTMLImageElement): number | null {
  const widthScale = SAMPLE_SIZE / image.naturalWidth
  const heightScale = SAMPLE_SIZE / image.naturalHeight
  const scale = Math.min(widthScale, heightScale, 1)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    return null
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)

  try {
    const pixels = context.getImageData(0, 0, width, height).data
    let weightedLuminance = 0
    let totalAlpha = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255

      if (alpha <= 0) {
        continue
      }

      const red = pixels[index] / 255
      const green = pixels[index + 1] / 255
      const blue = pixels[index + 2] / 255
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

      weightedLuminance += luminance * alpha
      totalAlpha += alpha
    }

    return totalAlpha > 0 ? weightedLuminance / totalAlpha : null
  } catch {
    return null
  }
}
