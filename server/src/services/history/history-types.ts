import type { JigsawConfig } from "@jigtable/core/types"

export type JigsawSafeAssetRef =
  | {
      kind: "dev"
      assetId: string
    }
  | {
      kind: "jigsaw_image"
      compositionId: string
      assetId: string
    }
  | {
      kind: "external"
      assetId: string
      sourceHash: string
      origin?: string
    }

export type JigsawResultParticipant = {
  userId?: string
  telegramId?: string
  name: string
  color: string
}

export type JigsawHistoryItem = {
  roomId: string
  completedAt: Date
  elapsedMs: number
  pieceCount: number
  snapCount: number
  imageUrl: string
  jigsawConfig: JigsawConfig
  source: {
    kind: JigsawSafeAssetRef["kind"]
    label: string
  }
  participants: JigsawResultParticipant[]
}

export type JigsawRoomResult = {
  roomId: string
  imageUrl: string
  jigsawConfig: JigsawConfig
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
  participants: JigsawResultParticipant[]
}

export type JigsawHistoryRoomInfo = {
  roomId: string
  assetRef: JigsawSafeAssetRef
  jigsawConfig: JigsawConfig
  imageUrl: string
  elapsedMs: number
  pieceCount: number
  snapCount: number
  completedAt: Date
}
