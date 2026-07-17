import { describe, expect, test } from "bun:test"

import type { ParticipantSession, RoomCompletion } from "@/services/history"
import { RoomManager } from "./room-manager"
import type { RoomErrorCode, RoomEvent, RoomPublisher } from "./room-events"

const session: ParticipantSession = {
  token: "session-1",
  player: {
    id: "player-1",
    name: "Player 1",
    color: "#123abc",
  },
}

describe("RoomManager", () => {
  test("keeps join available when history sync fails", async () => {
    const history = createHistory()
    history.failSync = true
    const errors: unknown[] = []
    const manager = createManager(history, {
      logger: {
        error(_message, error) {
          errors.push(error)
        },
      },
    })
    const state = manager.createRoom(createRoomInput())

    const result = await manager.joinRoom("connection-1", {
      roomId: state.roomId,
      sessionToken: session.token,
    })
    await flushPromises()

    expect(result?.player).toEqual(session.player)
    expect(manager.getRoomSnapshot(state.roomId)?.players).toEqual([
      session.player,
    ])
    expect(errors).toHaveLength(1)
  })

  test("keeps current room when a new target is invalid", async () => {
    const manager = createManager(createHistory())
    const state = manager.createRoom(createRoomInput())

    await manager.joinRoom("connection-1", {
      roomId: state.roomId,
      sessionToken: session.token,
    })
    const result = await manager.joinRoom("connection-1", {
      roomId: "missing-room",
      sessionToken: session.token,
    })

    expect(result).toBeNull()
    expect(manager.getRoomSnapshot(state.roomId)?.players).toEqual([
      session.player,
    ])
  })

  test("cancels join when connection closes during session lookup", async () => {
    let resolveSession: (value: ParticipantSession) => void = () => undefined
    const pendingSession = new Promise<ParticipantSession>((resolve) => {
      resolveSession = resolve
    })
    const manager = createManager(createHistory(), {
      sessions: {
        async get() {
          return pendingSession
        },
      },
    })
    const state = manager.createRoom(createRoomInput())
    const joining = manager.joinRoom("connection-1", {
      roomId: state.roomId,
      sessionToken: session.token,
    })

    await manager.closeConnection("connection-1")
    resolveSession(session)

    expect(await joining).toBeNull()
    expect(manager.getRoomSnapshot(state.roomId)?.players).toEqual([])
  })

  test("publishes leave before state when reconnect overlaps history", async () => {
    let resolveLeave: () => void = () => undefined
    const leave = new Promise<void>((resolve) => {
      resolveLeave = resolve
    })
    const history = createHistory()
    const persistence: string[] = []
    history.syncParticipant = async () => {
      persistence.push("sync")
    }
    history.markParticipantLeft = async () => {
      persistence.push("leave:start")
      await leave
      persistence.push("leave:end")
    }
    const events: RoomEvent[] = []
    const manager = createManager(history, {
      publisher: createPublisher(events),
    })
    const state = manager.createRoom(createRoomInput())

    await manager.joinRoom("connection-1", {
      roomId: state.roomId,
      sessionToken: session.token,
    })
    await flushPromises()
    await manager.disconnect("connection-1")
    await manager.joinRoom("connection-2", {
      roomId: state.roomId,
      sessionToken: session.token,
    })
    resolveLeave()
    await flushPromises()

    const eventTypes = events.map((event) => event.type)
    expect(eventTypes.lastIndexOf("player:left")).toBeLessThan(
      eventTypes.lastIndexOf("room:state")
    )
    expect(manager.getRoomSnapshot(state.roomId)?.players).toEqual([
      session.player,
    ])
    expect(persistence).toEqual(["sync", "leave:start", "leave:end", "sync"])
  })
})

function createManager(
  history: ReturnType<typeof createHistory>,
  options: {
    sessions?: {
      get(token: string): Promise<ParticipantSession | null>
    }
    publisher?: RoomPublisher
    logger?: {
      error(message: string, error: unknown): void
    }
  } = {}
): RoomManager {
  return new RoomManager({
    sessions: options.sessions ?? {
      async get(token) {
        return token === session.token ? session : null
      },
    },
    history,
    publisher: options.publisher ?? createPublisher(),
    metrics: {
      setActiveRooms() {},
      setActivePlayers() {},
    },
    logger: options.logger,
  })
}

function createHistory() {
  return {
    failSync: false,
    async syncParticipant() {
      if (this.failSync) {
        throw new Error("history unavailable")
      }
    },
    async markParticipantLeft() {},
    async updateParticipantProfile() {},
    async recordCompletion(_completion: RoomCompletion) {},
  }
}

function createPublisher(events: RoomEvent[] = []): RoomPublisher {
  return {
    send(_connectionId: string, event: RoomEvent) {
      events.push(event)
    },
    broadcast(_roomId: string, event: RoomEvent) {
      events.push(event)
    },
    broadcastExcept(_roomId: string, _connectionId: string, event: RoomEvent) {
      events.push(event)
    },
    error(_connectionId: string, _code: RoomErrorCode, _message: string) {},
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
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
