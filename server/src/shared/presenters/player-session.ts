import type {
  PlayerSession,
  StoredPlayerSession,
} from "@/services/player-session"

export function toPlayerSessionResponse(
  session: StoredPlayerSession
): PlayerSession {
  return {
    token: session.token,
    player: session.player,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}
