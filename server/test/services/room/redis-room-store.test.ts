import { describe, expect, test } from "bun:test"

import { createRoom, RedisRoomStore } from "@/services/room"

describe("RedisRoomStore", () => {
  test("restores persistent room state and locks", async () => {
    const redis = new FakeRedis()
    const store = new RedisRoomStore(redis, 60)
    const room = createRoom(createRoomInput(), 1_000)
    const groupId = Object.keys(room.state.groups)[0]!

    room.dragLocks[groupId] = {
      groupId,
      playerId: "player-1",
      playerName: "Player 1",
      lockedAt: 1_100,
    }
    room.toggleLocks[`group:${groupId}`] = {
      targetType: "group",
      targetId: groupId,
      playerId: "player-1",
      playerName: "Player 1",
      playerColor: "#123abc",
      lockedAt: 1_100,
      connectionId: "connection-1",
    }

    await store.save(room)
    const restored = await store.get(room.roomId)

    expect(JSON.stringify(restored?.state)).toBe(JSON.stringify(room.state))
    expect(restored?.dragLocks).toEqual(room.dragLocks)
    expect(restored?.toggleLocks).toEqual(room.toggleLocks)
    expect(redis.expirations.get(`jigtable:room:${room.roomId}`)).toBe(60)
  })

  test("does not persist connection-local state", async () => {
    const redis = new FakeRedis()
    const store = new RedisRoomStore(redis, 60)
    const room = createRoom(createRoomInput(), 1_000)

    room.players.set("player-1", {
      id: "player-1",
      name: "Player 1",
      color: "#123abc",
    })
    room.connections.set("connection-1", {
      connectionId: "connection-1",
      sessionToken: "session-1",
      playerId: "player-1",
      userId: null,
      presenceId: "presence-1",
    })

    await store.save(room)
    const restored = await store.get(room.roomId)

    expect(restored?.players.size).toBe(0)
    expect(restored?.connections.size).toBe(0)
    expect(restored?.cursors.size).toBe(0)
    expect(restored?.pingCooldowns.size).toBe(0)
  })

  test("deletes rooms", async () => {
    const redis = new FakeRedis()
    const store = new RedisRoomStore(redis, 60)
    const room = createRoom(createRoomInput(), 1_000)

    await store.save(room)
    await store.delete(room.roomId)

    expect(await store.get(room.roomId)).toBeNull()
  })
})

class FakeRedis {
  readonly values = new Map<string, string>()
  readonly expirations = new Map<string, number>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async send(command: string, args: string[]): Promise<unknown> {
    if (command !== "SET") {
      throw new Error(`Unsupported command: ${command}`)
    }

    const [key, value, expirationMode, seconds] = args

    if (!key || value === undefined || expirationMode !== "EX" || !seconds) {
      throw new Error("Invalid SET command")
    }

    this.values.set(key, value)
    this.expirations.set(key, Number(seconds))
    return "OK"
  }

  async del(key: string): Promise<unknown> {
    this.values.delete(key)
    this.expirations.delete(key)
    return 1
  }
}

function createRoomInput() {
  return {
    assetId: "asset-1",
    assetRef: {
      kind: "development" as const,
      assetId: "asset-1",
    },
    imageUrl: "/test_jigsaw.png",
    sourceSize: { width: 100, height: 100 },
    pieceCount: 4,
  }
}
