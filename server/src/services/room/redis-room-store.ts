import { RedisCache, type RedisKeyValueClient } from "@/services/redis"

import type { Room } from "./room.types"

type StoredRoom = Omit<
  Room,
  "players" | "connections" | "cursors" | "pingCooldowns" | "activePreviews"
>

export interface RoomStore {
  get(roomId: string): Promise<Room | null>
  save(room: Room): Promise<void>
  delete(roomId: string): Promise<void>
}

export class RedisRoomStore implements RoomStore {
  private readonly cache: RedisCache

  constructor(redis: RedisKeyValueClient, ttlSeconds: number) {
    this.cache = new RedisCache(redis, "room", ttlSeconds)
  }

  async get(roomId: string): Promise<Room | null> {
    const value = await this.cache.get(roomId)

    if (!value) {
      return null
    }

    const stored = JSON.parse(value) as StoredRoom

    return {
      ...stored,
      players: new Map(),
      connections: new Map(),
      cursors: new Map(),
      pingCooldowns: new Map(),
      activePreviews: new Map(),
    }
  }

  async save(room: Room): Promise<void> {
    const {
      players: _players,
      connections: _connections,
      cursors: _cursors,
      pingCooldowns: _pingCooldowns,
      activePreviews: _activePreviews,
      ...stored
    } = room
    await this.cache.set(room.roomId, JSON.stringify(stored))
  }

  async delete(roomId: string): Promise<void> {
    await this.cache.delete(roomId)
  }
}
