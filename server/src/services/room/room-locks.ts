import type { GroupId } from "@jigtable/core/types"

import type { LockTargetType, RoomPublisher } from "./room-events"
import type { Player, Room } from "./room.types"

export function updatePlayerLocks(room: Room, player: Player): void {
  for (const [groupId, lock] of room.dragLocks) {
    if (lock.playerId === player.id) {
      room.dragLocks.set(groupId, {
        ...lock,
        playerName: player.name,
      })
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

export function playerOwnsDragLock(
  room: Room,
  playerId: string,
  groupId: GroupId
): boolean {
  return room.dragLocks.get(groupId)?.playerId === playerId
}

export function isGroupToggleLocked(
  room: Room,
  playerId: string,
  groupId: GroupId
): boolean {
  const group = room.state.groups[groupId]

  if (!group) {
    return false
  }

  const groupLock = room.toggleLocks.get(lockKey("group", groupId))

  if (groupLock && groupLock.playerId !== playerId) {
    return true
  }

  return group.pieceIds.some((pieceId) => {
    const lock = room.toggleLocks.get(lockKey("piece", pieceId))

    return lock !== undefined && lock.playerId !== playerId
  })
}

export function releaseConnectionLocks(
  room: Room,
  connectionId: string,
  publisher: RoomPublisher
): void {
  for (const [key, lock] of room.toggleLocks) {
    if (lock.connectionId !== connectionId) {
      continue
    }

    room.toggleLocks.delete(key)

    publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      targetType: lock.targetType,
      targetId: lock.targetId,
      lockedBy: null,
    })
  }
}

export function releasePlayerLocks(
  room: Room,
  playerId: string,
  publisher: RoomPublisher
): void {
  for (const [groupId, lock] of room.dragLocks) {
    if (lock.playerId !== playerId) {
      continue
    }

    room.dragLocks.delete(groupId)

    publisher.broadcast(room.roomId, {
      type: "group:unlocked",
      groupId,
      playerId,
    })
  }

  for (const [key, lock] of room.toggleLocks) {
    if (lock.playerId !== playerId) {
      continue
    }

    room.toggleLocks.delete(key)

    publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      targetType: lock.targetType,
      targetId: lock.targetId,
      lockedBy: null,
    })
  }
}

export function releaseAllLocks(room: Room, publisher: RoomPublisher): void {
  for (const [groupId, lock] of room.dragLocks) {
    room.dragLocks.delete(groupId)

    publisher.broadcast(room.roomId, {
      type: "group:unlocked",
      groupId,
      playerId: lock.playerId,
    })
  }

  for (const [key, lock] of room.toggleLocks) {
    room.toggleLocks.delete(key)

    publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      targetType: lock.targetType,
      targetId: lock.targetId,
      lockedBy: null,
    })
  }
}

export function transferMergedGroupLocks({
  room,
  removedGroupIds,
  keptGroupId,
  publisher,
}: {
  room: Room
  removedGroupIds: string[]
  keptGroupId: GroupId
  publisher: RoomPublisher
}): void {
  for (const removedGroupId of removedGroupIds) {
    const removedKey = lockKey("group", removedGroupId)
    const removedLock = room.toggleLocks.get(removedKey)

    if (!removedLock) {
      continue
    }

    room.toggleLocks.delete(removedKey)

    const keptKey = lockKey("group", keptGroupId)

    if (!room.toggleLocks.has(keptKey)) {
      room.toggleLocks.set(keptKey, {
        ...removedLock,
        targetId: keptGroupId,
      })
    }

    publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      targetType: "group",
      targetId: removedGroupId,
      lockedBy: null,
    })

    publisher.broadcast(room.roomId, {
      type: "room:lock-updated",
      targetType: "group",
      targetId: keptGroupId,
      lockedBy: {
        userId: removedLock.playerId,
        name: removedLock.playerName,
        color: removedLock.playerColor,
      },
    })
  }
}

export function lockKey(targetType: LockTargetType, targetId: string): string {
  return `${targetType}:${targetId}`
}
