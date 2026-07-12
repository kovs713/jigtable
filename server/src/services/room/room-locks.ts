import type { Player as JigsawPlayer } from "@jigtable/core/protocol"
import type { GroupId } from "@jigtable/core/types"

import { broadcast } from "@/api/ws/send"
import type { JigsawRoom } from "./room-types"

export function updatePlayerLocks(
  room: JigsawRoom,
  player: JigsawPlayer
): void {
  for (const [groupId, lock] of room.locks) {
    if (lock.playerId === player.id) {
      room.locks.set(groupId, { ...lock, playerName: player.name })
    }
  }

  for (const [key, lock] of room.toggleLocks) {
    if (lock.playerId === player.id) {
      room.toggleLocks.set(key, {
        ...lock,
        playerName: player.name,
        playerColor: player.color,
      })
    }
  }
}

export function playerOwnsLock(
  room: JigsawRoom,
  playerId: string,
  groupId: GroupId
): boolean {
  return room.locks.get(groupId)?.playerId === playerId
}

export function isGroupBlockedByToggleLock(
  room: JigsawRoom,
  playerId: string,
  groupId: GroupId
): boolean {
  const group = room.state.groups[groupId]

  if (!group) {
    return false
  }

  const groupKey = `group:${groupId}`
  const groupLock = room.toggleLocks.get(groupKey)

  if (groupLock && groupLock.playerId !== playerId) {
    return true
  }

  for (const pieceId of group.pieceIds) {
    const pieceKey = `piece:${pieceId}`
    const pieceLock = room.toggleLocks.get(pieceKey)

    if (pieceLock && pieceLock.playerId !== playerId) {
      return true
    }
  }

  return false
}

export function releaseConnectionLocks(
  room: JigsawRoom,
  connectionId: string | undefined
): void {
  if (!connectionId) {
    return
  }

  for (const [key, lock] of room.toggleLocks) {
    if (lock.connectionId !== connectionId) {
      continue
    }

    room.toggleLocks.delete(key)

    broadcast(room, {
      type: "room:lock-updated",
      targetType: lock.targetType,
      targetId: lock.targetId,
      lockedBy: null,
    })
  }
}

export function releasePlayerLocks(room: JigsawRoom, playerId: string): void {
  for (const [groupId, lock] of room.locks) {
    if (lock.playerId === playerId) {
      room.locks.delete(groupId)

      broadcast(room, {
        type: "group:unlocked",
        groupId,
        playerId,
      })
    }
  }

  for (const [key, lock] of room.toggleLocks) {
    if (lock.playerId === playerId) {
      room.toggleLocks.delete(key)

      broadcast(room, {
        type: "room:lock-updated",
        targetType: lock.targetType,
        targetId: lock.targetId,
        lockedBy: null,
      })
    }
  }
}

export function releaseAllLocks(room: JigsawRoom): void {
  for (const [groupId, lock] of room.locks) {
    room.locks.delete(groupId)

    broadcast(room, {
      type: "group:unlocked",
      groupId,
      playerId: lock.playerId,
    })
  }

  for (const [key, lock] of room.toggleLocks) {
    room.toggleLocks.delete(key)

    broadcast(room, {
      type: "room:lock-updated",
      targetType: lock.targetType,
      targetId: lock.targetId,
      lockedBy: null,
    })
  }
}
