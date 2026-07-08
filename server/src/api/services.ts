import type { TelegramAuthService } from "@/auth"
import type { JigsawHistoryStore } from "@/api/services/history-store"
import type { JigsawRoomManager } from "@/api/services/room-manager"
import type { JigsawSessionStore } from "@/api/services/session-store"

export type Services = {
  rooms: JigsawRoomManager
  sessions: JigsawSessionStore
  history: JigsawHistoryStore
  auth: TelegramAuthService
}
