import { wsRoomsCurrent, wsUsersCurrent } from "@/observability/metrics"
import type { RoomMetrics } from "@/services/room"

export const roomMetrics: RoomMetrics = {
  setActiveRooms(count) {
    wsRoomsCurrent.set(count)
  },

  setActivePlayers(count) {
    wsUsersCurrent.set(count)
  },
}
