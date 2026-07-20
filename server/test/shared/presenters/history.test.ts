import { describe, expect, test } from "bun:test"

import { DEFAULT_JIGSAW_CONFIG } from "@jigtable/core/config"

import {
  toHistoryEntryResponse,
  toRoomResultResponse,
} from "@/shared/presenters/history"

const completedAt = new Date("2026-01-01T00:00:00.000Z")

describe("history presenters", () => {
  test("preserves legacy history response fields", () => {
    const response = toHistoryEntryResponse({
      roomId: "room-1",
      completedAt,
      elapsedMs: 1_000,
      pieceCount: 4,
      snapCount: 3,
      imageUrl: "https://example.com/image.png",
      config: DEFAULT_JIGSAW_CONFIG,
      source: { kind: "composition", label: "Composition" },
      participants: [],
    })

    expect(response.jigsawConfig).toEqual(DEFAULT_JIGSAW_CONFIG)
    expect(response.source).toEqual({
      kind: "jigsaw_image",
      label: "Jigsaw image",
    })
    expect(response).not.toHaveProperty("config")
  })

  test("preserves legacy room-result config field", () => {
    const response = toRoomResultResponse({
      roomId: "room-1",
      completedAt,
      elapsedMs: 1_000,
      pieceCount: 4,
      snapCount: 3,
      imageUrl: "https://example.com/image.png",
      config: DEFAULT_JIGSAW_CONFIG,
      participants: [],
      summary: null,
    })

    expect(response.jigsawConfig).toEqual(DEFAULT_JIGSAW_CONFIG)
    expect(response).not.toHaveProperty("config")
  })
})
