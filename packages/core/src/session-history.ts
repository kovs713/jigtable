import type { JigsawConfig } from "./types"
import type { GroupId, PieceId } from "./types"

export type RoomId = string
export type SessionId = RoomId
export type PlayerId = string
export type UserId = string
export type PresenceId = string
export type PreviewIntervalId = string

export const CONTRIBUTION_UNIT_SCALE = 5
export const JOIN_CONTRIBUTION_UNITS = 5
export const SNAP_CONTRIBUTION_UNITS = 1

export type ContributionUnits = number

export type PieceContributor = {
  playerId: PlayerId
  userId: UserId | null
  units: ContributionUnits
  firstContributionAt: number
}

export type FinalPieceContribution = {
  pieceId: PieceId
  primaryContributorPlayerId: PlayerId | null
  contributors: PieceContributor[]
}

export type ContributionRegion = {
  id: string
  playerId: PlayerId
  pieceIds: PieceId[]
}

export type SessionLabel =
  | "mvp"
  | "first_blood"
  | "last_hit"
  | "glue_master"
  | "closer"
  | "wall_builder"
  | "corner_hunter"
  | "biggest_build"
  | "largest_region"
  | "ping_lord"
  | "preview_enjoyer"
  | "locksmith"
  | "team_player"

export type PlayerSessionStats = {
  playerId: PlayerId
  userId: UserId | null
  points: number
  xpGained: number
  piecesJoined: number
  groupsJoined: number
  piecesSnapped: number
  groupsSnapped: number
  pingsCreated: number
  locksUsed: number
  previewMs: number
  activeMs: number
  borderPiecesJoined: number
  cornerPiecesJoined: number
  largestGroupBuilt: number
  primaryPieces: number
  contributionUnits: ContributionUnits
  contributionPercentage: number
  regionCount: number
  largestRegionSize: number
  firstBlood: boolean
  lastHit: boolean
}

export type ScoreBreakdownCode =
  | "piece_join"
  | "group_join"
  | "border_piece"
  | "corner_piece"
  | "placement"
  | "first_blood"
  | "last_hit"

export type ScoreBreakdownItem = {
  code: ScoreBreakdownCode
  count: number
  rawPoints: number
  points: number
  capApplied?: number
}

export type ScoreBreakdown = {
  items: ScoreBreakdownItem[]
  total: number
}

export type SessionScore = {
  playerId: PlayerId
  userId: UserId | null
  points: number
  scoringVersion: number
  breakdown: ScoreBreakdown
}

export type PlayerSessionResult = {
  playerId: PlayerId
  userId: UserId | null
  name: string
  color: string
  stats: PlayerSessionStats
  score: SessionScore
  xpGained: number
  labels: SessionLabel[]
}

export type SessionSummary = {
  sessionId: SessionId
  roomId: RoomId
  completedAt: string
  durationMs: number
  scoringVersion: number
  contributionVersion: number
  players: PlayerSessionResult[]
  pieces: FinalPieceContribution[]
  regions: ContributionRegion[]
}

export type JoinEventPayload = {
  movingGroupId: GroupId
  targetGroupId: GroupId
  resultGroupId: GroupId
  movingPieceIds: PieceId[]
  targetPieceIds: PieceId[]
}

export type RoomEventAssetReference =
  | { kind: "development"; assetId: string }
  | { kind: "composition"; compositionId: string; assetId: string }
  | {
      kind: "external"
      assetId: string
      sourceHash: string
      origin?: string
    }

export type RoomEventPayloadMap = {
  command_noop: {
    reason: "already_open" | "not_open" | "cooldown" | "rejected" | "no_snap"
  }
  piece_joined: JoinEventPayload
  group_joined: JoinEventPayload
  group_snapped: {
    groupId: GroupId
    pieceIds: PieceId[]
  }
  preview_opened: {
    presenceId: PresenceId
    intervalId: PreviewIntervalId
  }
  preview_closed: {
    presenceId: PresenceId
    intervalId: PreviewIntervalId
    reason: "client" | "disconnect" | "room_completed" | "replaced"
  }
  ping_created: {
    pingId: string
    x: number
    y: number
    expiresAt: string
  }
  group_locked: {
    groupId: GroupId
    pieceIds: PieceId[]
  }
  group_unlocked: {
    groupId: GroupId
    pieceIds: PieceId[]
    reason: "client" | "disconnect" | "timeout" | "merge" | "completion"
  }
  player_connected: {
    presenceId: PresenceId
  }
  player_disconnected: {
    presenceId: PresenceId
    reason: "disconnect" | "replaced"
  }
  room_completed: {
    triggerEventId: string
    completedAt: string
    elapsedMs: number
    pieceCount: number
    snapCount: number
    jigsawConfig: JigsawConfig
    assetRef: RoomEventAssetReference
    imageUrl: string
  }
}

export type RoomEventType = keyof RoomEventPayloadMap
export type PlayerRoomEventType = Exclude<RoomEventType, "room_completed">

type RoomEventEnvelope<Type extends RoomEventType> = {
  id: string
  roomId: RoomId
  sequence: number
  commandId: string
  eventIndex: number
  eventType: Type
  payload: RoomEventPayloadMap[Type]
  createdAt: string
}

type PlayerRoomEvent<Type extends PlayerRoomEventType> =
  RoomEventEnvelope<Type> & {
    playerId: PlayerId
    userId: UserId | null
  }

type SystemRoomEvent = RoomEventEnvelope<"room_completed"> & {
  playerId: null
  userId: null
}

export type PersistedRoomEvent =
  | {
      [Type in PlayerRoomEventType]: PlayerRoomEvent<Type>
    }[PlayerRoomEventType]
  | SystemRoomEvent

export type RoomEventDraft = PersistedRoomEvent extends infer Event
  ? Event extends PersistedRoomEvent
    ? Omit<Event, "id" | "sequence" | "createdAt"> & { id?: string }
    : never
  : never
