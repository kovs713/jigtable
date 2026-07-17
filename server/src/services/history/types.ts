import type { JigsawConfig as CoreRoomConfig } from "@jigtable/core/types"

export type RoomConfig = CoreRoomConfig

export type AssetReference =
  | {
      kind: "development"
      assetId: string
    }
  | {
      kind: "composition"
      compositionId: string
      assetId: string
    }
  | {
      kind: "external"
      assetId: string
      sourceHash: string
      origin?: string
    }

export type AssetSource = {
  kind: AssetReference["kind"]
  label: string
}

export type ResultParticipant = {
  userId?: string
  telegramId?: string
  name: string
  color: string
}

export type HistoryEntry = {
  roomId: string
  completedAt: Date
  elapsedMs: number
  pieceCount: number
  snapCount: number
  imageUrl: string
  config: RoomConfig
  source: AssetSource
  participants: ResultParticipant[]
}

export type RoomResult = {
  roomId: string
  imageUrl: string
  config: RoomConfig
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
  participants: ResultParticipant[]
}

export type RoomCompletion = {
  roomId: string
  assetRef: AssetReference
  config: RoomConfig
  imageUrl: string
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
}

export type ParticipantSession = {
  token: string
  userId?: string | null
  player: {
    id: string
    name: string
    color: string
  }
}
