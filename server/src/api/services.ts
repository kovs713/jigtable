import type { TelegramAuthService } from "@/auth"
import type { JigsawHistoryStore } from "@/jigsaw-room/history-store"
import type { JigsawRoomManager } from "@/jigsaw-room/room-manager"
import type { JigsawSessionStore } from "@/jigsaw-room/session-store"

export type Services = {
  rooms: JigsawRoomManager
  sessions: JigsawSessionStore
  history: JigsawHistoryStore
  auth: TelegramAuthService
}
