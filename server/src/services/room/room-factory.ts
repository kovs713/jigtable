import {
  JIGSAW_CONFIG_2000,
  createImageJigsawConfig,
} from "@jigtable/core/config"
import { createJigsawState } from "@jigtable/core/generate"
import { scatterAllPieces } from "@jigtable/core/scatter"

import { LIMITS } from "@/config"
import { createRoomId } from "./room-ids"
import type { JigsawRoom } from "./room-types"

export function createJigsawRoomRecord({
  roomId = createRoomId(),
  assetId,
  assetRef,
  imageUrl,
  sourceSize,
  pieceCount,
}: {
  roomId?: string
  assetId: string
  assetRef: JigsawRoom["assetRef"]
  imageUrl: string
  sourceSize: { width: number; height: number }
  pieceCount: number
}): JigsawRoom {
  const safePieceCount = clampPieceCount(pieceCount)
  const baseConfig = {
    ...JIGSAW_CONFIG_2000,
    rows: 1,
    cols: safePieceCount,
  }

  const state = createJigsawState(
    createImageJigsawConfig(baseConfig, sourceSize)
  )
  scatterAllPieces(state)

  const now = Date.now()

  return {
    roomId,
    assetId,
    assetRef,
    imageUrl,
    state,
    players: new Map(),
    cursors: new Map(),
    sockets: new Set(),
    locks: new Map(),
    toggleLocks: new Map(),
    pingCooldowns: new Map(),
    timer: {
      elapsedMs: 0,
      paused: false,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  } satisfies JigsawRoom
}

export function clampPieceCount(value: number): number {
  const fallbackPieceCount = JIGSAW_CONFIG_2000.rows * JIGSAW_CONFIG_2000.cols

  if (!Number.isFinite(value)) {
    return fallbackPieceCount
  }

  return Math.max(
    LIMITS.jigsaw.minPieceCount,
    Math.min(LIMITS.jigsaw.maxPieceCount, Math.round(value))
  )
}
