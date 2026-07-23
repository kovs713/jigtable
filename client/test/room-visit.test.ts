import { describe, expect, test } from "bun:test"

import type {
  ChatMessage,
  ClientToServerMessage,
  PlayerSession,
  RoomSnapshot,
  ServerToClientMessage,
} from "@jigtable/core/protocol"

import type { JigsawRoomResult } from "../src/features/room/data"
import type {
  JigsawRoomCanvas,
  JigsawRoomCanvasStart,
} from "../src/pages/room/pixi/room-canvas"
import {
  createRoomVisit,
  type RoomVisitDependencies,
} from "../src/pages/room/room-visit"

const playerSession: PlayerSession = {
  token: "session-token",
  player: { id: "player-1", name: "Player One", color: "#22c55e" },
  createdAt: 100,
  updatedAt: 100,
}

describe("Room Visit", () => {
  test("projects storage failure and skips deferred startup after immediate leave", async () => {
    const harness = createHarness({
      readSession() {
        throw new Error("Storage denied")
      },
    })

    expect(harness.visit.getState().session).toMatchObject({
      value: playerSession,
      status: "offline",
      failure: { scope: "session", message: "Storage denied" },
    })

    harness.visit.leave()
    await settle()

    expect(harness.order).not.toContain("restore-session")
    expect(harness.order).not.toContain("fetch-snapshot")
  })

  test("starts in order and reconciles the live room state", async () => {
    const harness = createHarness()
    const states: string[] = []

    harness.visit.subscribe(() => {
      states.push(harness.visit.getState().phase.status)
    })

    await settle()

    expect(harness.order).toEqual([
      "read-session",
      "restore-session",
      "fetch-snapshot",
      "create-canvas",
      "create-multiplayer",
    ])
    expect(harness.visit.getState().phase.status).toBe("active")
    expect(harness.visit.getState().connection.status).toBe("connecting")
    expect(states).toContain("active")

    harness.multiplayer.status("connected")
    harness.multiplayer.receive({
      type: "room:state",
      state: createSnapshot({ placedPieces: 3, snapCount: 4 }),
    })

    expect(harness.visit.getState()).toMatchObject({
      phase: { status: "active" },
      connection: { status: "connected" },
      stats: {
        placedPieces: 3,
        snapCount: 4,
        source: "reconciled",
      },
    })
    expect(harness.canvas.messages.at(-1)?.type).toBe("room:state")

    harness.visit.leave()
  })

  test("keeps the room viewable when session restoration fails", async () => {
    const harness = createHarness({
      async restoreSession() {
        throw new Error("Session offline")
      },
    })

    await settle()

    expect(harness.visit.getState()).toMatchObject({
      phase: {
        status: "degraded",
        failure: { scope: "session", message: "Session offline" },
      },
      session: {
        value: playerSession,
        status: "offline",
      },
      availability: { preview: true, zoom: true },
    })
    expect(harness.order).toContain("create-multiplayer")

    harness.visit.leave()
  })

  test("fails without acquiring canvas or multiplayer when snapshot fails", async () => {
    const harness = createHarness({
      async fetchSnapshot() {
        throw new Error("Room expired")
      },
    })

    await settle()

    expect(harness.visit.getState().phase).toEqual({
      status: "failed",
      failure: { scope: "snapshot", message: "Room expired" },
    })
    expect(harness.order).not.toContain("create-canvas")
    expect(harness.order).not.toContain("create-multiplayer")

    harness.visit.leave()
    expect(harness.clock.intervalClearCount).toBe(1)
  })

  test("uses the development fallback as a degraded room", async () => {
    const harness = createHarness({
      isDevelopment: true,
      async fetchSnapshot() {
        throw new Error("No local server")
      },
      createMultiplayer(options) {
        harnessStatus(options.onStatus, "disabled")
        return createMultiplayerHandle()
      },
    })

    await settle()

    expect(harness.canvas.startOptions?.snapshot).toBeNull()
    expect(harness.visit.getState()).toMatchObject({
      phase: { status: "degraded" },
      connection: { status: "disabled" },
      availability: { preview: true, arrange: true },
    })

    harness.visit.leave()
  })

  test("keeps the canvas when multiplayer becomes unavailable", async () => {
    const harness = createHarness()

    await settle()
    harness.multiplayer.status("unavailable")

    expect(harness.visit.getState()).toMatchObject({
      phase: {
        status: "degraded",
        failure: { scope: "connection" },
      },
      connection: { status: "unavailable" },
      availability: { preview: true, chat: false },
    })
    expect(harness.canvas.destroyCount).toBe(0)

    harness.visit.leave()
  })

  test("fails without multiplayer when canvas startup fails", async () => {
    const harness = createHarness({
      async createCanvas() {
        throw new Error("WebGL unavailable")
      },
    })

    await settle()

    expect(harness.visit.getState().phase).toEqual({
      status: "failed",
      failure: { scope: "canvas", message: "WebGL unavailable" },
    })
    expect(harness.order).not.toContain("create-multiplayer")

    harness.visit.leave()
  })

  test("projects room events and requests recovery after pause", async () => {
    const harness = createHarness()

    await settle()
    harness.multiplayer.status("connected")
    harness.multiplayer.receive({
      type: "session:paused",
      timer: {
        elapsedMs: 5_000,
        paused: true,
        updatedAt: 1_000,
        pausedByPlayerName: "Player Two",
      },
    })
    harness.multiplayer.receive({
      type: "chat:message",
      message: createChatMessage(),
    })
    harness.multiplayer.receive({
      type: "chat:message",
      message: createChatMessage(),
    })

    expect(harness.visit.getState()).toMatchObject({
      timer: { paused: true, elapsedMs: 5_000 },
      elapsedMs: 5_000,
      chatMessages: [{ id: "message-1" }],
      availability: { arrange: false },
    })
    expect(harness.multiplayer.sent).toContainEqual({
      type: "room:request_state",
    })
    expect(harness.canvas.messages.map((message) => message.type)).toEqual([
      "session:paused",
      "chat:message",
      "chat:message",
    ])

    harness.visit.leave()
  })

  test("projects elapsed time through the injected clock", async () => {
    const harness = createHarness()

    await settle()
    harness.clock.advance(500)

    expect(harness.visit.getState().elapsedMs).toBe(1_500)

    harness.multiplayer.receive({
      type: "session:paused",
      timer: { elapsedMs: 1_500, paused: true, updatedAt: 1_500 },
    })
    harness.clock.advance(500)

    expect(harness.visit.getState().elapsedMs).toBe(1_500)
    harness.visit.leave()
  })

  test("routes accepted intents and rejects unavailable ones", async () => {
    const harness = createHarness()

    expect(harness.visit.act({ type: "chat.send", text: "hello" })).toEqual({
      accepted: false,
      reason: "not-connected",
    })

    await settle()
    harness.multiplayer.status("connected")

    expect(harness.visit.act({ type: "chat.send", text: "hello" })).toEqual({
      accepted: true,
    })
    expect(harness.visit.act({ type: "preview.set", visible: true })).toEqual({
      accepted: true,
    })
    expect(harness.visit.act({ type: "view.zoom", action: "fit" })).toEqual({
      accepted: true,
    })

    expect(harness.multiplayer.sent).toContainEqual({
      type: "chat:send",
      text: "hello",
      x: 10,
      y: 20,
    })
    expect(harness.canvas.actions).toEqual(["preview:true", "zoom:fit"])
    expect(harness.visit.getState().previewVisible).toBe(true)

    harness.visit.leave()
    expect(harness.visit.act({ type: "pieces.highlight" })).toEqual({
      accepted: false,
      reason: "left",
    })
  })

  test("exposes profile save progress and the updated Player Session", async () => {
    const updatedSession: PlayerSession = {
      ...playerSession,
      player: { ...playerSession.player, name: "Updated" },
      updatedAt: 200,
    }
    const save = deferred<PlayerSession>()
    const harness = createHarness({
      saveProfile: () => save.promise,
    })

    await settle()

    expect(
      harness.visit.act({
        type: "player.save",
        profile: { name: "Updated", color: "#22c55e" },
      })
    ).toEqual({ accepted: true })
    expect(harness.visit.getState().session.status).toBe("saving")

    save.resolve(updatedSession)
    await settle()

    expect(harness.visit.getState().session).toMatchObject({
      value: updatedSession,
      status: "saved",
      successfulProfileSaves: 1,
    })

    harness.visit.leave()
  })

  test("keeps profile saving single-flight across player updates", async () => {
    const save = deferred<PlayerSession>()
    const harness = createHarness({ saveProfile: () => save.promise })

    await settle()
    expect(
      harness.visit.act({
        type: "player.save",
        profile: { name: "Updated", color: "#22c55e" },
      })
    ).toEqual({ accepted: true })

    harness.multiplayer.receive({
      type: "player:updated",
      player: { ...playerSession.player, name: "Broadcast" },
    })

    expect(harness.visit.getState().session.status).toBe("saving")
    expect(
      harness.visit.act({
        type: "player.save",
        profile: { name: "Second", color: "#22c55e" },
      })
    ).toEqual({ accepted: false, reason: "busy" })

    save.resolve({
      ...playerSession,
      player: { ...playerSession.player, name: "Updated" },
    })
    await settle()

    expect(harness.visit.getState().session.value.player.name).toBe("Updated")
    harness.visit.leave()
  })

  test("announces completion only after server reconciliation", async () => {
    const harness = createHarness()

    await settle()
    harness.canvas.startOptions?.onStats(createCanvasStats({ placedPieces: 4 }))

    expect(harness.visit.getState()).toMatchObject({
      solved: true,
      completionRevision: 0,
      stats: { source: "optimistic" },
    })

    harness.clock.advance(500)
    expect(harness.visit.getState().elapsedMs).toBe(1_500)

    harness.multiplayer.receive({
      type: "stats:updated",
      stats: createSnapshot({ placedPieces: 0 }).stats,
    })
    harness.multiplayer.receive({
      type: "stats:updated",
      stats: createSnapshot({ placedPieces: 4 }).stats,
    })

    expect(harness.visit.getState()).toMatchObject({
      solved: true,
      completionRevision: 1,
      stats: { source: "reconciled" },
    })

    harness.visit.leave()
  })

  test("cancels Room Result retries and destroys resources once", async () => {
    const harness = createHarness({
      async fetchResult() {
        throw new Error("Not finalized")
      },
    })

    await settle()
    harness.multiplayer.receive({
      type: "stats:updated",
      stats: createSnapshot({ placedPieces: 4 }).stats,
    })
    await settle()

    expect(harness.visit.getState().result).toMatchObject({
      status: "loading",
      failure: { scope: "result", message: "Not finalized" },
    })
    expect(harness.clock.timeouts.size).toBe(1)

    harness.visit.leave()
    harness.visit.leave()

    expect(harness.clock.timeouts.size).toBe(0)
    expect(harness.canvas.destroyCount).toBe(1)
    expect(harness.multiplayer.destroyCount).toBe(1)
  })

  test("retries Room Result loading until a summary is available", async () => {
    let attempts = 0
    const harness = createHarness({
      async fetchResult() {
        attempts++

        if (attempts === 1) {
          throw new Error("Not finalized")
        }

        return createRoomResult()
      },
    })

    await settle()
    harness.multiplayer.receive({
      type: "stats:updated",
      stats: createSnapshot({ placedPieces: 4 }).stats,
    })
    await settle()
    harness.clock.runTimeouts()
    await settle()

    expect(attempts).toBe(2)
    expect(harness.visit.getState().result.status).toBe("ready")

    harness.visit.leave()
  })

  test("destroys a canvas that finishes starting after the visit leaves", async () => {
    const canvasStart = deferred<JigsawRoomCanvasStart>()
    const harness = createHarness({
      createCanvas: () => canvasStart.promise,
    })

    await settle(3)
    harness.visit.leave()
    canvasStart.resolve({
      canvas: harness.canvas.handle,
      initialStats: createCanvasStats(),
    })
    await settle()

    expect(harness.canvas.destroyCount).toBe(1)
    expect(harness.order).not.toContain("create-multiplayer")
  })

  test("does not continue startup after leaving during session restore", async () => {
    const restoration = deferred<PlayerSession>()
    const harness = createHarness({
      restoreSession: () => restoration.promise,
    })

    await settle(1)
    harness.visit.leave()
    restoration.resolve(playerSession)
    await settle()

    expect(harness.order).not.toContain("fetch-snapshot")
    expect(harness.order).not.toContain("create-canvas")
  })

  test("does not continue startup after leaving during snapshot loading", async () => {
    const snapshot = deferred<RoomSnapshot>()
    const harness = createHarness({
      fetchSnapshot: () => snapshot.promise,
    })

    await settle(2)
    harness.visit.leave()
    snapshot.resolve(createSnapshot())
    await settle()

    expect(harness.order).not.toContain("create-canvas")
    expect(harness.order).not.toContain("create-multiplayer")
  })
})

type DependencyOverrides = Partial<RoomVisitDependencies>

function createHarness(overrides: DependencyOverrides = {}) {
  const order: string[] = []
  const canvas = createCanvasHarness()
  const multiplayer = createMultiplayerHarness()
  const clock = createClockHarness()
  const savedSessions: PlayerSession[] = []
  const dependencies: RoomVisitDependencies = {
    isDevelopment: false,
    fallbackImageUrl: "/test.png",
    fallbackConfig: {} as RoomVisitDependencies["fallbackConfig"],
    readSession() {
      order.push("read-session")
      return playerSession
    },
    createSession() {
      return playerSession
    },
    saveSession(session) {
      savedSessions.push(session)
      return null
    },
    async restoreSession() {
      order.push("restore-session")
      return playerSession
    },
    async saveProfile(_token, profile) {
      return {
        ...playerSession,
        player: { ...playerSession.player, ...profile },
      }
    },
    async fetchSnapshot() {
      order.push("fetch-snapshot")
      return createSnapshot()
    },
    async fetchResult() {
      return createRoomResult()
    },
    async createCanvas(options) {
      order.push("create-canvas")
      canvas.startOptions = options
      options.onStats(createCanvasStats())

      return {
        canvas: canvas.handle,
        initialStats: createCanvasStats(),
      }
    },
    createMultiplayer(options) {
      order.push("create-multiplayer")
      multiplayer.attach(options.onMessage, options.onStatus)
      options.onStatus("connecting")
      return multiplayer.handle
    },
    now: () => clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    ...overrides,
  }
  const visit = createRoomVisit(
    {
      roomId: "room-1",
      canvasHost: {} as HTMLElement,
      themeRoot: {} as HTMLElement,
      prepareTheme() {},
      onCanvasPointerDown() {},
    },
    dependencies
  )

  return {
    visit,
    order,
    canvas,
    multiplayer,
    clock,
    savedSessions,
  }
}

function createCanvasHarness() {
  const messages: ServerToClientMessage[] = []
  const actions: string[] = []
  const harness: {
    startOptions: Parameters<RoomVisitDependencies["createCanvas"]>[0] | null
    destroyCount: number
    messages: ServerToClientMessage[]
    actions: string[]
    handle: JigsawRoomCanvas
  } = {
    startOptions: null,
    destroyCount: 0,
    messages,
    actions,
    handle: {
      applyServerMessage(message) {
        messages.push(message)
      },
      setPreviewVisible(visible) {
        actions.push(`preview:${visible}`)
      },
      highlightPieces() {
        actions.push("highlight")
      },
      arrangePieces(mode) {
        actions.push(`arrange:${mode}`)
      },
      changeZoom(action) {
        actions.push(`zoom:${action}`)
      },
      quickSolve() {
        actions.push("quick-solve")
      },
      refreshTheme() {
        actions.push("refresh-theme")
      },
      getCursorPosition() {
        return { x: 10, y: 20 }
      },
      destroy() {
        harness.destroyCount++
      },
    },
  }

  return harness
}

function createMultiplayerHarness() {
  let receiveMessage: (message: ServerToClientMessage) => void = () => {}
  let applyStatus: Parameters<
    RoomVisitDependencies["createMultiplayer"]
  >[0]["onStatus"] = () => {}
  let connected = false
  const sent: ClientToServerMessage[] = []
  const harness = {
    sent,
    destroyCount: 0,
    attach(
      receive: (message: ServerToClientMessage) => void,
      status: typeof applyStatus
    ) {
      receiveMessage = receive
      applyStatus = status
    },
    receive(message: ServerToClientMessage) {
      receiveMessage(message)
    },
    status(status: Parameters<typeof applyStatus>[0]) {
      connected = status === "connected"
      applyStatus(status)
    },
    handle: {} as ReturnType<RoomVisitDependencies["createMultiplayer"]>,
  }

  harness.handle = {
    send(message) {
      sent.push(message)
    },
    requestState() {
      sent.push({ type: "room:request_state" })
    },
    isConnected() {
      return connected
    },
    destroy() {
      connected = false
      harness.destroyCount++
    },
  }

  return harness
}

function createMultiplayerHandle(): ReturnType<
  RoomVisitDependencies["createMultiplayer"]
> {
  return {
    send() {},
    requestState() {},
    isConnected() {
      return false
    },
    destroy() {},
  }
}

function harnessStatus(
  apply: Parameters<RoomVisitDependencies["createMultiplayer"]>[0]["onStatus"],
  status: Parameters<typeof apply>[0]
): void {
  apply(status)
}

function createClockHarness() {
  let nextHandle = 1
  let intervalClearCount = 0
  let now = 1_000
  const timeouts = new Map<ReturnType<typeof setTimeout>, () => void>()
  const intervals = new Map<ReturnType<typeof setInterval>, () => void>()

  function handle(): ReturnType<typeof setTimeout> {
    return nextHandle++ as unknown as ReturnType<typeof setTimeout>
  }

  return {
    get now() {
      return now
    },
    timeouts,
    intervals,
    get intervalClearCount() {
      return intervalClearCount
    },
    setTimeout(callback: () => void) {
      const next = handle()
      timeouts.set(next, callback)
      return next
    },
    clearTimeout(next: ReturnType<typeof setTimeout>) {
      timeouts.delete(next)
    },
    runTimeouts() {
      const pending = [...timeouts.values()]
      timeouts.clear()

      for (const callback of pending) {
        callback()
      }
    },
    advance(durationMs: number) {
      now += durationMs

      for (const callback of intervals.values()) {
        callback()
      }
    },
    setInterval(callback: () => void) {
      const next = handle()
      intervals.set(next, callback)
      return next
    },
    clearInterval(next: ReturnType<typeof setInterval>) {
      if (intervals.delete(next)) {
        intervalClearCount++
      }
    },
  }
}

function createSnapshot(
  stats: Partial<RoomSnapshot["stats"]> = {}
): RoomSnapshot {
  return {
    roomId: "room-1",
    jigsaw: {
      assetId: "asset-1",
      imageUrl: "/puzzle.png",
      config: {} as RoomSnapshot["jigsaw"]["config"],
    },
    pieces: {},
    groups: {},
    players: [playerSession.player],
    locks: [],
    cursors: [],
    timer: { elapsedMs: 1_000, paused: false, updatedAt: 1_000 },
    stats: {
      totalPieces: 4,
      placedPieces: 0,
      groupsCount: 4,
      playersCount: 1,
      snapCount: 0,
      ...stats,
    },
    createdAt: 100,
    updatedAt: 100,
    activePreviews: [],
  }
}

function createCanvasStats(
  overrides: Partial<{
    fps: number
    zoom: number
    totalPieces: number
    placedPieces: number
    groupsCount: number
    snapCount: number
  }> = {}
) {
  return {
    fps: 60,
    zoom: 1,
    totalPieces: 4,
    placedPieces: 0,
    groupsCount: 4,
    snapCount: 0,
    ...overrides,
  }
}

function createChatMessage(): ChatMessage {
  return {
    id: "message-1",
    player: { id: "player-2", name: "Player Two", color: "#ef4444" },
    text: "hello",
    createdAt: 1_000,
  }
}

function createRoomResult(): JigsawRoomResult {
  return {
    roomId: "room-1",
    imageUrl: "/puzzle.png",
    jigsawConfig: null,
    elapsedMs: 1_000,
    pieceCount: 4,
    snapCount: 1,
    completedAt: "2026-07-23T00:00:00.000Z",
    participants: [],
    summary: {} as NonNullable<JigsawRoomResult["summary"]>,
  }
}

function deferred<Value>() {
  let resolvePromise: (value: Value) => void = () => {}
  let rejectPromise: (reason?: unknown) => void = () => {}
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  }
}

async function settle(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await Promise.resolve()
  }
}
