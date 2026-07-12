import type { Player as JigsawPlayer } from "@jigtable/core/protocol"

import { broadcast } from "@/api/ws/send"
import type { JigsawPlayerCursor, JigsawRoom } from "./room-types"

export function updatePlayerCursor(
  room: JigsawRoom,
  player: JigsawPlayer
): void {
  const cursor = room.cursors.get(player.id)

  if (!cursor) {
    return
  }

  const nextCursor = {
    ...cursor,
    playerName: player.name,
    color: player.color,
    updatedAt: Date.now(),
  } satisfies JigsawPlayerCursor

  room.cursors.set(player.id, nextCursor)

  broadcast(room, {
    type: "cursor:moved",
    cursor: nextCursor,
  })
}
