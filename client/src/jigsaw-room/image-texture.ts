import { Texture } from "pixi.js"

export async function loadImageTexture(imageUrl: string): Promise<Texture> {
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

  return Texture.from(image)
}
