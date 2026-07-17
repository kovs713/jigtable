import type { HistoryEntry, RoomCompletion, RoomResult } from "./types"

export type UpsertParticipantInput = {
  roomId: string
  playerId: string
  sessionHash: string
  userId: string | null
  name: string
  color: string
  seenAt: Date
}

export type UpdateParticipantProfileInput = {
  sessionHash: string
  userId: string | null
  name: string
  color: string
  seenAt: Date
}

export type HistoryRepository = {
  upsertParticipant(input: UpsertParticipantInput): Promise<void>

  markParticipantLeft(input: {
    roomId: string
    playerId: string
    leftAt: Date
  }): Promise<void>

  updateParticipantProfile(input: UpdateParticipantProfileInput): Promise<void>

  linkSessionToUser(input: {
    sessionHash: string
    userId: string
    linkedAt: Date
  }): Promise<void>

  saveCompletion(completion: RoomCompletion): Promise<void>

  listUserHistory(userId: string): Promise<HistoryEntry[]>

  findRoomResult(roomId: string): Promise<RoomResult | null>

  findUserColors(userIds: readonly string[]): Promise<Map<string, string>>
}
