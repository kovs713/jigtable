import type { JigsawConfig, JigsawState } from "@jigtable/core/types"
import { string } from "@jigtable/shared/schemas"
import { isRecord } from "@jigtable/shared/utils"

import { summarizeAssetRef } from "./asset-ref"
import type {
  JigsawHistoryItem,
  JigsawResultParticipant,
  JigsawRoomResult,
  JigsawSafeAssetRef,
} from "./history-types"

export type RawJigsawRoomResultRow = {
  roomId: string
  assetRef?: unknown
  imageUrl: string | null
  jigsawConfig: JigsawConfig | string | null
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
  participants: unknown
}

export function toJigsawHistoryItem(
  row: RawJigsawRoomResultRow
): JigsawHistoryItem | null {
  const assetRef = parseAssetRef(row.assetRef)
  const parsedImageUrl = string().parse(row.imageUrl)
  const jigsawConfig = parseJigsawConfig(row.jigsawConfig)

  if (!assetRef || !parsedImageUrl.ok || !jigsawConfig) {
    return null
  }

  return {
    roomId: row.roomId,
    completedAt: row.completedAt,
    elapsedMs: row.elapsedMs,
    pieceCount: row.pieceCount,
    snapCount: row.snapCount,
    imageUrl: parsedImageUrl.value,
    jigsawConfig,
    source: summarizeAssetRef(assetRef),
    participants: parseParticipants(row.participants),
  }
}

export function toJigsawRoomResult(
  row: RawJigsawRoomResultRow
): JigsawRoomResult | null {
  const parsedImageUrl = string().parse(row.imageUrl)
  const jigsawConfig = parseJigsawConfig(row.jigsawConfig)

  if (!parsedImageUrl.ok || !jigsawConfig) {
    return null
  }

  return {
    roomId: row.roomId,
    imageUrl: parsedImageUrl.value,
    jigsawConfig,
    elapsedMs: row.elapsedMs,
    pieceCount: row.pieceCount,
    snapCount: row.snapCount,
    completedAt: row.completedAt,
    participants: parseParticipants(row.participants),
  }
}

function parseAssetRef(value: unknown): JigsawSafeAssetRef | null {
  if (!isRecord(value)) {
    return null
  }

  const parsedKind = string().parse(value.kind)
  const parsedAssetId = string().parse(value.assetId)
  const parsedOrigin = string().parse(value.origin)

  if (!parsedKind.ok || !parsedAssetId.ok) {
    return null
  }

  if (parsedKind.value === "dev") {
    return {
      kind: parsedKind.value,
      assetId: parsedAssetId.value,
    }
  }

  if (parsedKind.value === "batch_render") {
    const parsedCompositionId = string().parse(value.batchId)

    return parsedCompositionId.ok
      ? {
          kind: "jigsaw_image",
          compositionId: parsedCompositionId.value,
          assetId: parsedAssetId.value,
        }
      : null
  }

  if (parsedKind.value === "external") {
    const parsedSourceHash = string().parse(value.sourceHash)

    if (!parsedSourceHash.ok) {
      return null
    }

    return {
      kind: parsedKind.value,
      assetId: parsedAssetId.value,
      sourceHash: parsedSourceHash.value,
      origin: parsedOrigin.ok ? parsedOrigin.value : undefined,
    }
  }

  return null
}

function parseJigsawConfig(
  value: JigsawState["config"] | string | null
): JigsawConfig | null {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JigsawConfig
    } catch {
      return null
    }
  }

  return value
}

function parseParticipants(value: unknown): JigsawResultParticipant[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    const parsedName = string().parse(item.name)
    const parsedColor = string().parse(item.color)
    const parsedUserId = string().parse(item.userId)
    const parsedTelegramId = string().parse(item.telegramId)

    if (!parsedName.ok || !parsedColor.ok) {
      return []
    }

    return [
      {
        userId: parsedUserId.ok ? parsedUserId.value : undefined,
        telegramId: parsedTelegramId.ok ? parsedTelegramId.value : undefined,
        name: parsedName.value,
        color: parsedColor.value,
      },
    ]
  })
}
