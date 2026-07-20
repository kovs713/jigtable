import { string } from "@jigtable/shared/schemas"
import { isRecord } from "@jigtable/shared/utils"
import type { SessionSummary } from "@jigtable/core/session-history"

import { summarizeAssetReference } from "@/services/history/asset-reference"
import type { StoredAssetReference } from "@/db/schemas/room-results"
import type {
  AssetReference,
  HistoryEntry,
  ResultParticipant,
  RoomConfig,
  RoomResult,
} from "@/services/history/types"

export type StoredRoomResultRow = {
  roomId: string
  assetRef?: unknown
  imageUrl: string | null
  config: unknown
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
  participants: unknown
  summary?: SessionSummary | null
}

export function toHistoryEntry(row: StoredRoomResultRow): HistoryEntry | null {
  const assetRef = parseAssetReference(row.assetRef)
  const imageUrl = parseRequiredString(row.imageUrl)
  const config = parseRoomConfig(row.config)

  if (!assetRef || !imageUrl || !config) {
    return null
  }

  return {
    roomId: row.roomId,
    completedAt: row.completedAt,
    elapsedMs: row.elapsedMs,
    pieceCount: row.pieceCount,
    snapCount: row.snapCount,
    imageUrl,
    config,
    source: summarizeAssetReference(assetRef),
    participants: parseParticipants(row.participants),
  }
}

export function toRoomResult(row: StoredRoomResultRow): RoomResult | null {
  const imageUrl = parseRequiredString(row.imageUrl)
  const config = parseRoomConfig(row.config)

  if (!imageUrl || !config) {
    return null
  }

  return {
    roomId: row.roomId,
    imageUrl,
    config,
    elapsedMs: row.elapsedMs,
    pieceCount: row.pieceCount,
    snapCount: row.snapCount,
    completedAt: row.completedAt,
    participants: parseParticipants(row.participants),
    summary: row.summary ?? null,
  }
}

export function parseAssetReference(value: unknown): AssetReference | null {
  if (!isRecord(value)) {
    return null
  }

  const kind = parseRequiredString(value.kind)
  const assetId = parseRequiredString(value.assetId)

  if (!kind || !assetId) {
    return null
  }

  if (kind === "development" || kind === "dev") {
    return {
      kind: "development",
      assetId,
    }
  }

  if (kind === "composition" || kind === "jigsaw_image") {
    const compositionId = parseRequiredString(value.compositionId)

    return compositionId
      ? {
          kind: "composition",
          compositionId,
          assetId,
        }
      : null
  }

  if (kind === "batch_render") {
    const compositionId =
      parseRequiredString(value.compositionId) ??
      parseRequiredString(value.batchId)

    return compositionId
      ? {
          kind: "composition",
          compositionId,
          assetId,
        }
      : null
  }

  if (kind === "external") {
    const sourceHash = parseRequiredString(value.sourceHash)

    if (!sourceHash) {
      return null
    }

    return {
      kind: "external",
      assetId,
      sourceHash,
      origin: parseRequiredString(value.origin) ?? undefined,
    }
  }

  return null
}

export function toStoredAssetReference(
  assetRef: AssetReference
): StoredAssetReference {
  switch (assetRef.kind) {
    case "development":
      return {
        kind: "dev",
        assetId: assetRef.assetId,
      }

    case "composition":
      return {
        kind: "batch_render",
        batchId: assetRef.compositionId,
        assetId: assetRef.assetId,
      }

    case "external":
      return assetRef
  }
}

function parseRoomConfig(value: unknown): RoomConfig | null {
  let parsed = value

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }

  return isRoomConfig(parsed) ? parsed : null
}

function isRoomConfig(value: unknown): value is RoomConfig {
  return (
    isRecord(value) &&
    isFiniteNumber(value.rows) &&
    isFiniteNumber(value.cols) &&
    isFiniteNumber(value.pieceWidth) &&
    isFiniteNumber(value.pieceHeight) &&
    isFiniteNumber(value.originX) &&
    isFiniteNumber(value.originY) &&
    isFiniteNumber(value.scatterPadding) &&
    isFiniteNumber(value.scatterGap) &&
    isFiniteNumber(value.snapToCorrectDistance) &&
    isFiniteNumber(value.snapToNeighborDistance) &&
    isFiniteNumber(value.tabSizePercent) &&
    isFiniteNumber(value.jitterPercent) &&
    isFiniteNumber(value.pieceTextureScale) &&
    isFiniteNumber(value.minZoom) &&
    isFiniteNumber(value.maxZoom) &&
    isFiniteNumber(value.seed)
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function parseParticipants(value: unknown): ResultParticipant[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const name = parseRequiredString(item.name)
    const color = parseRequiredString(item.color)

    if (!name || !color) {
      return []
    }

    return [
      {
        playerId: parseRequiredString(item.playerId) ?? undefined,
        userId: parseRequiredString(item.userId) ?? undefined,
        telegramId: parseRequiredString(item.telegramId) ?? undefined,
        name,
        color,
      },
    ]
  })
}

function parseRequiredString(value: unknown): string | null {
  const parsed = string().parse(value)

  return parsed.ok ? parsed.value : null
}
