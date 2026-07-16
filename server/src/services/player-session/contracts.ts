import type { StoredPlayerSession } from "./player-session-types"

export interface PlayerSessionRepository {
  findByToken(token: string): Promise<StoredPlayerSession | null>

  save(session: StoredPlayerSession): Promise<void>
}
