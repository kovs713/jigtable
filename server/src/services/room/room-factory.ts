import {
  JIGSAW_CONFIG_2000,
  createImageJigsawConfig,
} from "@jigtable/core/config"
import { createJigsawState } from "@jigtable/core/generate"
import { scatterAllPieces } from "@jigtable/core/scatter"

import { LIMITS } from "@/config"

import { createRoomId } from "./room-id"
import type { CreateRoomInput, Room } from "./room-types"

export function createRoom(input: CreateRoomInput, now = Date.now()): Room {
  const pieceCount = clampPieceCount(input.pieceCount)
  const config = createImageJigsawConfig(
    {
      ...JIGSAW_CONFIG_2000,
      rows: 1,
      cols: pieceCount,
    },
    input.sourceSize
  )
  const state = createJigsawState(config)

  scatterAllPieces(state)

  return {
    roomId: createRoomId(),
    assetId: input.assetId ?? "room-image",
    assetRef: input.assetRef,
    imageUrl: input.imageUrl,
    state,
    players: new Map(),
    connections: new Map(),
    cursors: new Map(),
    dragLocks: new Map(),
    toggleLocks: new Map(),
    pingCooldowns: new Map(),
    timer: {
      elapsedMs: 0,
      paused: false,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function clampPieceCount(value: number): number {
  const fallback = JIGSAW_CONFIG_2000.rows * JIGSAW_CONFIG_2000.cols

  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(
    LIMITS.jigsaw.minPieceCount,
    Math.min(LIMITS.jigsaw.maxPieceCount, Math.round(value))
  )
}
