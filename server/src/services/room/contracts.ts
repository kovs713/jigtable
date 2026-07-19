import type { ParticipantSession, RoomCompletion } from "@/services/history"

import type { Player, RoomStats } from "./room.types"

export type PlayerSession = ParticipantSession

export interface PlayerSessionReader {
  get(token: string): Promise<PlayerSession | null>
}

export interface RoomHistory {
  syncParticipant(input: {
    roomId: string
    session: ParticipantSession
  }): Promise<void>

  markParticipantLeft(roomId: string, playerId: string): Promise<void>

  updateParticipantProfile(input: {
    sessionToken: string
    profile: {
      name: string
      color: string
    }
    userId?: string | null
  }): Promise<void>

  recordCompletion(completion: RoomCompletion): Promise<void>
}

export interface RoomMetrics {
  setActiveRooms(count: number): void
  setActivePlayers(count: number): void
}

export interface RoomLogger {
  error(message: string, error: unknown): void
}

export type UpdateSessionPlayerInput = {
  sessionToken: string
  player: Player
}

export type RoomStatsReader = {
  getStats(roomId: string): RoomStats | null
}
