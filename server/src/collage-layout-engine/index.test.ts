import { describe, expect, test } from "bun:test"

import {
  generateCollageLayout,
  type ImageSource,
  type LayoutItem,
} from "./index"

describe("generateImageLayout", () => {
  test("returns empty layout for empty input", () => {
    expect(generateCollageLayout({ images: [] })).toEqual({
      canvas: { width: 0, height: 0 },
      items: [],
    })
  })

  test("places all images inside a compact canvas", () => {
    const result = generateCollageLayout({
      images: [
        { id: "1", src: "s3://photo-1", width: 1200, height: 800 },
        { id: "2", src: "s3://photo-2", width: 800, height: 1200 },
        { id: "3", src: "s3://photo-3", width: 1000, height: 1000 },
        { id: "4", src: "s3://photo-4", width: 1600, height: 900 },
        { id: "5", src: "s3://photo-5", width: 900, height: 1600 },
      ],
    })

    expect(result.items).toHaveLength(5)
    expect(result.canvas.width).toBeGreaterThan(0)
    expect(result.canvas.height).toBeGreaterThan(0)
    expect(result.canvas.width / result.canvas.height).toBeGreaterThan(0.5)
    expect(result.canvas.width / result.canvas.height).toBeLessThan(2)

    for (const item of result.items) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.width).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
      expect(item.x + item.width).toBeLessThanOrEqual(result.canvas.width)
      expect(item.y + item.height).toBeLessThanOrEqual(result.canvas.height)
    }
  })

  test("does not overlap images without gap", () => {
    const result = generateCollageLayout(
      {
        images: [
          { id: "1", src: "s3://photo-1", width: 1200, height: 800 },
          { id: "2", src: "s3://photo-2", width: 800, height: 1200 },
          { id: "3", src: "s3://photo-3", width: 1000, height: 1000 },
          { id: "4", src: "s3://photo-4", width: 1600, height: 900 },
          { id: "5", src: "s3://photo-5", width: 900, height: 1600 },
          { id: "6", src: "s3://photo-6", width: 1800, height: 1200 },
        ],
      },
      { gap: 0 }
    )

    for (let leftIndex = 0; leftIndex < result.items.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < result.items.length;
        rightIndex += 1
      ) {
        const left = result.items[leftIndex]
        const right = result.items[rightIndex]

        if (!left || !right) {
          throw new Error("Missing layout item")
        }

        expect(hasOverlap(left, right)).toBe(false)
      }
    }
  })

  test("does not crush sparse final row across the canvas", () => {
    const images: ImageSource[] = Array.from({ length: 20 }, (_, index) => ({
      id: String(index + 1),
      src: `s3://photo-${index + 1}`,
      width: 900,
      height: index < 18 ? 1600 : 1800,
    }))
    const result = generateCollageLayout({ images }, { gap: 0 })
    const tailItems = result.items.slice(-2)

    expect(totalItemArea(result.items)).toBe(
      result.canvas.width * result.canvas.height
    )
    expect(maxAspectRatioDistortion(images, result.items)).toBeLessThanOrEqual(
      1.02
    )

    for (const item of tailItems) {
      expect(item.width / item.height).toBeLessThan(1)
    }
  })

  test("uses target canvas aspect ratio as a bounded layout guide", () => {
    const images: ImageSource[] = Array.from({ length: 9 }, (_, index) => ({
      id: String(index + 1),
      src: `s3://photo-${index + 1}`,
      width: 1000,
      height: 1000,
    }))
    const baseResult = generateCollageLayout(
      { images },
      { gap: 0, targetImageArea: 10_000 }
    )
    const wideResult = generateCollageLayout(
      { images },
      { gap: 0, targetAspectRatio: 16 / 9, targetImageArea: 10_000 }
    )
    const baseAspectRatio = baseResult.canvas.width / baseResult.canvas.height
    const wideAspectRatio = wideResult.canvas.width / wideResult.canvas.height

    expect(wideAspectRatio).toBeGreaterThan(baseAspectRatio)
    expect(totalItemArea(wideResult.items)).toBe(
      wideResult.canvas.width * wideResult.canvas.height
    )
    expect(
      maxAspectRatioDistortion(images, wideResult.items)
    ).toBeLessThanOrEqual(1.02)
  })

  test("keeps output items in input order", () => {
    const result = generateCollageLayout({
      images: [
        { id: "wide", src: "s3://wide", width: 1600, height: 900 },
        { id: "square", src: "s3://square", width: 1000, height: 1000 },
        { id: "tall", src: "s3://tall", width: 900, height: 1600 },
      ],
    })

    expect(result.items.map((item) => item.id)).toEqual([
      "wide",
      "square",
      "tall",
    ])
  })

  test("validates explicit image count", () => {
    expect(() =>
      generateCollageLayout({
        count: 2,
        images: [{ id: "1", src: "s3://photo-1", width: 1200, height: 800 }],
      })
    ).toThrow("Collage image count must match images length")
  })
})

function totalItemArea(items: LayoutItem[]): number {
  return items.reduce((total, item) => total + item.width * item.height, 0)
}

function maxAspectRatioDistortion(
  images: ImageSource[],
  items: LayoutItem[]
): number {
  const sourceImages = new Map(images.map((image) => [image.id, image]))

  return Math.max(
    ...items.map((item) => {
      const sourceImage = sourceImages.get(item.id)

      if (!sourceImage) {
        throw new Error("Missing source image")
      }

      const sourceAspectRatio = sourceImage.width / sourceImage.height
      const itemAspectRatio = item.width / item.height

      return Math.max(
        itemAspectRatio / sourceAspectRatio,
        sourceAspectRatio / itemAspectRatio
      )
    })
  )
}

function hasOverlap(left: LayoutItem, right: LayoutItem): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  )
}
