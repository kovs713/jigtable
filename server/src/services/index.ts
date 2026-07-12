import { AuthService } from "@/services/auth"
import { HistoryService } from "./history/history-store"
import { RoomService } from "./room/room-manager"
import { SessionService } from "./session/session-store"

export function createServices(): Services {
  const sessions = new SessionService()
  const history = new HistoryService()
  const rooms = new RoomService(sessions, history)
  const auth = new AuthService()

  return {
    sessions,
    history,
    rooms,
    auth,
  }
}

export type Services = {
  sessions: SessionService
  history: HistoryService
  rooms: RoomService
  auth: AuthService
}
