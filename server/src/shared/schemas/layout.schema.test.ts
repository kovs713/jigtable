import { describe, expect, test } from "bun:test"

import { normalizeCompositionLayout } from "./layout.schema"

const sourceImages = [
  {
    fileId: "image-1",
    compositionId: "composition-1",
    objectKey: "compositions/composition-1/image-1.jpg",
    contentType: "image/jpeg",
    sortOrder: 0,
    width: 4000,
    height: 3000,
    createdAt: null,
  },
]

describe("composition layout schema", () => {
  test("preserves fractional image scale", () => {
    const layout = normalizeCompositionLayout(
      {
        canvas: { width: 1000, height: 750 },
        items: [
          {
            id: "image-1",
            x: 0,
            y: 0,
            width: 1000,
            height: 750,
            scale: 0.25,
          },
        ],
      },
      sourceImages
    )

    expect(layout.items[0]?.scale).toBe(0.25)
  })

  test("rejects non-positive image scale", () => {
    expect(() =>
      normalizeCompositionLayout(
        {
          canvas: { width: 1000, height: 750 },
          items: [
            {
              id: "image-1",
              x: 0,
              y: 0,
              width: 1000,
              height: 750,
              scale: 0,
            },
          ],
        },
        sourceImages
      )
    ).toThrow("layout.items[0].scale must be a positive number")
  })
})
