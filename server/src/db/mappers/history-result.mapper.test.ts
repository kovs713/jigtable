import { describe, expect, test } from "bun:test"

import { DEFAULT_JIGSAW_CONFIG } from "@jigtable/core/config"

import {
  parseAssetReference,
  toStoredAssetReference,
  toHistoryEntry,
  toRoomResult,
} from "./history-result.mapper"
import type { StoredRoomResultRow } from "./history-result.mapper"

describe("history result mapper", () => {
  test("reads current asset references", () => {
    expect(
      parseAssetReference({
        kind: "development",
        assetId: "asset-1",
      })
    ).toEqual({
      kind: "development",
      assetId: "asset-1",
    })
    expect(
      parseAssetReference({
        kind: "composition",
        compositionId: "composition-1",
        assetId: "asset-2",
      })
    ).toEqual({
      kind: "composition",
      compositionId: "composition-1",
      assetId: "asset-2",
    })
  })

  test("normalizes legacy asset references", () => {
    expect(
      parseAssetReference({
        kind: "dev",
        assetId: "asset-1",
      })
    ).toEqual({
      kind: "development",
      assetId: "asset-1",
    })
    expect(
      parseAssetReference({
        kind: "jigsaw_image",
        compositionId: "composition-1",
        assetId: "asset-2",
      })
    ).toEqual({
      kind: "composition",
      compositionId: "composition-1",
      assetId: "asset-2",
    })
    expect(
      parseAssetReference({
        kind: "batch_render",
        batchId: "composition-2",
        assetId: "asset-3",
      })
    ).toEqual({
      kind: "composition",
      compositionId: "composition-2",
      assetId: "asset-3",
    })
  })

  test("writes rollback-compatible asset references", () => {
    expect(
      toStoredAssetReference({
        kind: "development",
        assetId: "asset-1",
      })
    ).toEqual({
      kind: "dev",
      assetId: "asset-1",
    })
    expect(
      toStoredAssetReference({
        kind: "composition",
        compositionId: "composition-1",
        assetId: "asset-2",
      })
    ).toEqual({
      kind: "batch_render",
      batchId: "composition-1",
      assetId: "asset-2",
    })
  })

  test("reads current object and legacy serialized configs", () => {
    expect(toRoomResult(createRow())?.config).toEqual(DEFAULT_JIGSAW_CONFIG)
    expect(
      toRoomResult(
        createRow({
          config: JSON.stringify(DEFAULT_JIGSAW_CONFIG),
        })
      )?.config
    ).toEqual(DEFAULT_JIGSAW_CONFIG)
  })

  test("rejects configs missing any current field", () => {
    for (const field of Object.keys(DEFAULT_JIGSAW_CONFIG)) {
      const config = Object.fromEntries(
        Object.entries(DEFAULT_JIGSAW_CONFIG).filter(([key]) => key !== field)
      )
      const row = createRow({ config })

      expect(toRoomResult(row)).toBeNull()
      expect(toHistoryEntry(row)).toBeNull()
    }
  })

  test("rejects configs with malformed current fields", () => {
    const row = createRow({
      config: {
        ...DEFAULT_JIGSAW_CONFIG,
        pieceWidth: Number.NaN,
      },
    })

    expect(toRoomResult(row)).toBeNull()
    expect(toHistoryEntry(row)).toBeNull()
  })
})

function createRow(
  overrides: Partial<StoredRoomResultRow> = {}
): StoredRoomResultRow {
  return {
    roomId: "room-1",
    assetRef: {
      kind: "development",
      assetId: "asset-1",
    },
    imageUrl: "https://example.com/image.png",
    config: DEFAULT_JIGSAW_CONFIG,
    elapsedMs: 1_000,
    pieceCount: 4,
    snapCount: 3,
    completedAt: new Date("2026-01-01T00:00:00.000Z"),
    participants: [],
    ...overrides,
  }
}
