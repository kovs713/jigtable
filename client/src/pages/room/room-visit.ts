import type { JigsawConfig } from "@jigtable/core"
import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ClientToServerMessage,
  type PlayerSession,
  type RoomSnapshot,
  type RoomStats,
  type RoomTimer,
  type ServerToClientMessage,
} from "@jigtable/core/protocol"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"

import type { JigsawRoomResult } from "@/features/room/data"
import type {
  JigsawMultiplayerClient,
  MultiplayerStatus,
} from "@/features/room/multiplayer"

import type {
  CreateJigsawRoomCanvasOptions,
  JigsawRoomCanvas,
  JigsawRoomCanvasStart,
  JigsawStats,
  RoomCanvasZoom,
} from "./pixi/room-canvas"
import { getTimerElapsedMs } from "./timer"

const CHAT_MESSAGE_HISTORY_LIMIT = 100
const RESULT_FETCH_RETRY_MS = 400
const TIMER_TICK_MS = 500

export type RoomVisitPhase =
  | { readonly status: "starting"; readonly message: string }
  | { readonly status: "active" }
  | { readonly status: "degraded"; readonly failure: RoomVisitFailure }
  | { readonly status: "failed"; readonly failure: RoomVisitFailure }

export interface RoomVisitFailure {
  readonly scope: "session" | "snapshot" | "canvas" | "connection" | "result"
  readonly message: string
}

export type RoomVisitSessionStatus =
  "local" | "restoring" | "saved" | "saving" | "offline" | "error"

export interface RoomVisitStats {
  readonly totalPieces: number
  readonly placedPieces: number
  readonly groupsCount: number
  readonly snapCount: number
  readonly source: "optimistic" | "reconciled"
}

export type RoomVisitResultState =
  | { readonly status: "idle" }
  | {
      readonly status: "loading"
      readonly attempt: number
      readonly failure: RoomVisitFailure | null
    }
  | { readonly status: "ready"; readonly value: JigsawRoomResult }

export interface RoomVisitAvailability {
  readonly pause: boolean
  readonly preview: boolean
  readonly highlight: boolean
  readonly arrange: boolean
  readonly zoom: boolean
  readonly chat: boolean
  readonly saveProfile: boolean
  readonly refreshTheme: boolean
  readonly quickSolve: boolean
}

export interface RoomVisitState {
  readonly roomId: string
  readonly phase: RoomVisitPhase
  readonly connection: {
    readonly status: MultiplayerStatus
    readonly failure: RoomVisitFailure | null
  }
  readonly session: {
    readonly value: PlayerSession
    readonly status: RoomVisitSessionStatus
    readonly failure: RoomVisitFailure | null
    readonly successfulProfileSaves: number
  }
  readonly timer: RoomTimer
  readonly elapsedMs: number
  readonly stats: RoomVisitStats
  readonly solved: boolean
  readonly completionRevision: number
  readonly chatMessages: readonly ChatMessage[]
  readonly result: RoomVisitResultState
  readonly previewVisible: boolean
  readonly piecesHighlighted: boolean
  readonly availability: RoomVisitAvailability
}

export type RoomVisitIntent =
  | { readonly type: "timer.toggle" }
  | { readonly type: "preview.set"; readonly visible: boolean }
  | { readonly type: "pieces.highlight" }
  | {
      readonly type: "pieces.arrange"
      readonly mode: ArrangeLoosePiecesMode
    }
  | { readonly type: "view.zoom"; readonly action: RoomCanvasZoom }
  | { readonly type: "chat.send"; readonly text: string }
  | {
      readonly type: "player.save"
      readonly profile: { readonly name: string; readonly color: string }
    }
  | { readonly type: "appearance.refresh" }
  | { readonly type: "dev.quick-solve" }

export type RoomVisitIntentResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false
      readonly reason:
        | "not-ready"
        | "not-connected"
        | "paused"
        | "invalid"
        | "busy"
        | "development-only"
        | "left"
    }

export interface RoomVisit {
  getState(): RoomVisitState
  subscribe(listener: () => void): () => void
  act(intent: RoomVisitIntent): RoomVisitIntentResult
  leave(): void
}

export interface EnterRoomVisitOptions {
  readonly roomId: string
  readonly canvasHost: HTMLElement
  readonly themeRoot: HTMLElement
  readonly prepareTheme: (averageLuminance: number | null) => void
  readonly onCanvasPointerDown: () => void
}

type TimerHandle = ReturnType<typeof setTimeout>
type IntervalHandle = ReturnType<typeof setInterval>

export interface RoomVisitDependencies {
  readonly isDevelopment: boolean
  readonly fallbackImageUrl: string
  readonly fallbackConfig: JigsawConfig
  readSession(): PlayerSession
  createSession(): PlayerSession
  saveSession(session: PlayerSession): string | null
  restoreSession(
    fallback: PlayerSession,
    roomId: string
  ): Promise<PlayerSession>
  saveProfile(
    sessionToken: string,
    profile: { readonly name: string; readonly color: string }
  ): Promise<PlayerSession>
  fetchSnapshot(roomId: string): Promise<RoomSnapshot>
  fetchResult(roomId: string): Promise<JigsawRoomResult>
  createCanvas(
    options: CreateJigsawRoomCanvasOptions
  ): Promise<JigsawRoomCanvasStart>
  createMultiplayer(options: {
    roomId: string
    sessionToken: string
    onMessage: (message: ServerToClientMessage) => void
    onStatus: (status: MultiplayerStatus) => void
  }): JigsawMultiplayerClient
  now(): number
  setTimeout(callback: () => void, durationMs: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
  setInterval(callback: () => void, durationMs: number): IntervalHandle
  clearInterval(handle: IntervalHandle): void
}

export function createRoomVisit(
  options: EnterRoomVisitOptions,
  dependencies: RoomVisitDependencies
): RoomVisit {
  const listeners = new Set<() => void>()
  let initialSessionFailure: RoomVisitFailure | null = null
  let currentSession: PlayerSession

  try {
    currentSession = dependencies.readSession()
  } catch (error) {
    currentSession = dependencies.createSession()
    initialSessionFailure = failureOf("session", readErrorMessage(error))
  }

  let state = createInitialState(
    options.roomId,
    currentSession,
    dependencies.now()
  )

  if (initialSessionFailure) {
    state = {
      ...state,
      session: {
        ...state.session,
        status: "offline",
        failure: initialSessionFailure,
      },
    }
  }
  let canvas: JigsawRoomCanvas | null = null
  let multiplayer: JigsawMultiplayerClient | null = null
  let authoritativeStats: RoomStats | null = null
  let canvasReady = false
  let left = false
  let developmentFallback = false
  let reconciledSolved = false
  let restoreFailure: RoomVisitFailure | null = initialSessionFailure
  let fatalFailure: RoomVisitFailure | null = null
  let profileSavePending = false
  let resultTimer: TimerHandle | null = null
  let resultGeneration = 0
  let timerInterval: IntervalHandle | null = dependencies.setInterval(
    updateElapsedTime,
    TIMER_TICK_MS
  )

  const visit: RoomVisit = {
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    act,
    leave,
  }

  void Promise.resolve().then(() => {
    if (!left) {
      return boot()
    }
  })

  return visit

  function publish(patch: Partial<RoomVisitState>): void {
    if (left) {
      return
    }

    const next = { ...state, ...patch }
    state = {
      ...next,
      availability: deriveAvailability(next, canvasReady, dependencies),
    }

    for (const listener of listeners) {
      listener()
    }
  }

  function publishPhase(): void {
    if (!canvasReady) {
      return
    }

    if (fatalFailure) {
      publish({ phase: { status: "failed", failure: fatalFailure } })
      return
    }

    const connectionFailure = state.connection.failure
    const failure =
      restoreFailure ??
      connectionFailure ??
      (developmentFallback ? failureOf("snapshot", "Local test room") : null)

    publish({
      phase: failure ? { status: "degraded", failure } : { status: "active" },
    })
  }

  async function boot(): Promise<void> {
    if (!options.roomId) {
      failVisit("snapshot", "Invite link required")
      return
    }

    publish({
      phase: { status: "starting", message: "Restoring player..." },
      session: {
        ...state.session,
        status: "restoring",
        failure: initialSessionFailure,
      },
    })

    try {
      currentSession = await dependencies.restoreSession(
        currentSession,
        options.roomId
      )

      if (left) {
        return
      }

      const persistenceFailure = persistSession(currentSession)
      restoreFailure = persistenceFailure
      publish({
        session: {
          ...state.session,
          value: currentSession,
          status: persistenceFailure ? "offline" : "saved",
          failure: persistenceFailure,
        },
        phase: { status: "starting", message: "Loading room..." },
      })
    } catch (error) {
      if (left) {
        return
      }

      restoreFailure = failureOf("session", readErrorMessage(error))
      publish({
        session: {
          ...state.session,
          status: "offline",
          failure: restoreFailure,
        },
        phase: { status: "starting", message: "Loading room..." },
      })
    }

    let snapshot: RoomSnapshot | null = null

    try {
      snapshot = await dependencies.fetchSnapshot(options.roomId)
    } catch (error) {
      if (!dependencies.isDevelopment) {
        failVisit("snapshot", readErrorMessage(error))
        return
      }

      developmentFallback = true
    }

    if (left) {
      return
    }

    if (snapshot) {
      authoritativeStats = snapshot.stats
      applyTimerAndStats(snapshot.timer, snapshot.stats, false)
    }

    publish({ phase: { status: "starting", message: "Starting room..." } })

    let start: JigsawRoomCanvasStart

    try {
      start = await dependencies.createCanvas({
        host: options.canvasHost,
        themeRoot: options.themeRoot,
        imageUrl: snapshot?.jigsaw.imageUrl ?? dependencies.fallbackImageUrl,
        fallbackConfig: dependencies.fallbackConfig,
        snapshot,
        isCancelled: () => left,
        getPlayer: () => currentSession.player,
        isPaused: () => state.timer.paused,
        isConnected: () => multiplayer?.isConnected() ?? false,
        send: sendCanvasMessage,
        prepareTheme: options.prepareTheme,
        onStats: applyCanvasStats,
        onHighlightChange(piecesHighlighted) {
          publish({ piecesHighlighted })
        },
        onCanvasPointerDown: options.onCanvasPointerDown,
      })
    } catch (error) {
      if (!left) {
        failVisit("canvas", readErrorMessage(error))
      }

      return
    }

    if (left) {
      start.canvas.destroy()
      return
    }

    canvas = start.canvas
    canvasReady = true
    applyCanvasStats(start.initialStats)
    publishPhase()

    if (state.solved) {
      startResultPolling()
    }

    try {
      multiplayer = dependencies.createMultiplayer({
        roomId: options.roomId,
        sessionToken: currentSession.token,
        onStatus: applyConnectionStatus,
        onMessage: applyServerMessage,
      })
    } catch (error) {
      applyConnectionFailure(readErrorMessage(error))
    }
  }

  function applyConnectionStatus(status: MultiplayerStatus): void {
    if (left) {
      return
    }

    const failure =
      status === "disabled"
        ? failureOf("connection", "Multiplayer disabled")
        : status === "disconnected"
          ? failureOf("connection", "Multiplayer disconnected")
          : status === "unavailable"
            ? failureOf("connection", "Multiplayer unavailable")
            : null

    publish({ connection: { status, failure } })
    publishPhase()
  }

  function applyConnectionFailure(message: string): void {
    if (left) {
      return
    }

    const failure = failureOf("connection", message)
    publish({
      connection: { status: "unavailable", failure },
    })
    publishPhase()
  }

  function applyServerMessage(message: ServerToClientMessage): void {
    if (left) {
      return
    }

    canvas?.applyServerMessage(message)

    if (message.type === "session:paused") {
      applyTimer(message.timer)
      multiplayer?.requestState()
      return
    }

    if (message.type === "session:resumed") {
      applyTimer(message.timer)
      return
    }

    if (message.type === "room:state") {
      authoritativeStats = message.state.stats
      applyTimerAndStats(message.state.timer, message.state.stats, true)
      return
    }

    if (message.type === "player:updated") {
      if (message.player.id === currentSession.player.id) {
        currentSession = {
          ...currentSession,
          player: message.player,
          updatedAt: dependencies.now(),
        }
        const persistenceFailure = persistSession(currentSession)

        restoreFailure = persistenceFailure

        publish({
          session: {
            ...state.session,
            value: currentSession,
            status: profileSavePending
              ? "saving"
              : persistenceFailure
                ? "offline"
                : "saved",
            failure: persistenceFailure,
          },
        })
        publishPhase()
      }

      return
    }

    if (message.type === "chat:message") {
      if (state.chatMessages.some((item) => item.id === message.message.id)) {
        return
      }

      publish({
        chatMessages: [...state.chatMessages, message.message].slice(
          -CHAT_MESSAGE_HISTORY_LIMIT
        ),
      })
      return
    }

    if (message.type === "stats:updated") {
      authoritativeStats = message.stats
      applyStats(message.stats, "reconciled", true)
      return
    }

    if (message.type !== "error") {
      return
    }

    if (
      message.code === "room_not_found" ||
      message.code === "session_required" ||
      message.code === "not_joined"
    ) {
      const failure = failureOf("connection", message.message)
      publish({
        connection: { status: "unavailable", failure },
        phase: canvasReady
          ? { status: "degraded", failure }
          : { status: "failed", failure },
      })
      return
    }

    multiplayer?.requestState()
  }

  function applyTimer(timer: RoomTimer): void {
    publish({
      timer,
      elapsedMs: getTimerElapsedMs(timer, dependencies.now()),
    })
  }

  function applyTimerAndStats(
    timer: RoomTimer,
    stats: RoomStats,
    announceCompletion: boolean
  ): void {
    const wasSolved = state.solved
    const solved = isSolved(stats)
    reconciledSolved = solved
    const completionRevision =
      announceCompletion &&
      solved &&
      (!wasSolved || state.stats.source === "optimistic")
        ? state.completionRevision + 1
        : state.completionRevision

    publish({
      timer,
      elapsedMs: getTimerElapsedMs(timer, dependencies.now()),
      stats: toVisitStats(stats, "reconciled"),
      solved,
      completionRevision,
    })

    if (solved && canvasReady) {
      startResultPolling()
    }
  }

  function applyStats(
    stats: Pick<
      RoomStats,
      "totalPieces" | "placedPieces" | "groupsCount" | "snapCount"
    >,
    source: RoomVisitStats["source"],
    announceCompletion: boolean
  ): void {
    const wasSolved = state.solved
    const solved = isSolved(stats)

    if (source === "reconciled") {
      reconciledSolved = solved
    }

    publish({
      stats: toVisitStats(stats, source),
      solved,
      completionRevision:
        announceCompletion &&
        solved &&
        (!wasSolved || state.stats.source === "optimistic")
          ? state.completionRevision + 1
          : state.completionRevision,
      ...(solved && (source === "reconciled" || developmentFallback)
        ? { elapsedMs: getTimerElapsedMs(state.timer, dependencies.now()) }
        : {}),
    })

    if (solved && source === "reconciled") {
      startResultPolling()
    }
  }

  function applyCanvasStats(stats: JigsawStats): void {
    const matchesAuthority =
      authoritativeStats !== null &&
      stats.totalPieces === authoritativeStats.totalPieces &&
      stats.placedPieces === authoritativeStats.placedPieces &&
      stats.groupsCount === authoritativeStats.groupsCount &&
      stats.snapCount === authoritativeStats.snapCount

    const source = matchesAuthority ? "reconciled" : "optimistic"

    if (
      state.stats.totalPieces === stats.totalPieces &&
      state.stats.placedPieces === stats.placedPieces &&
      state.stats.groupsCount === stats.groupsCount &&
      state.stats.snapCount === stats.snapCount &&
      state.stats.source === source
    ) {
      return
    }

    applyStats(stats, source, canvasReady && developmentFallback)
  }

  function startResultPolling(): void {
    if (
      left ||
      developmentFallback ||
      resultTimer !== null ||
      state.result.status === "loading" ||
      state.result.status === "ready"
    ) {
      return
    }

    const generation = ++resultGeneration
    void pollResult(generation, 1)
  }

  async function pollResult(
    generation: number,
    attempt: number
  ): Promise<void> {
    if (left || generation !== resultGeneration) {
      return
    }

    publish({ result: { status: "loading", attempt, failure: null } })

    try {
      const result = await dependencies.fetchResult(options.roomId)

      if (left || generation !== resultGeneration) {
        return
      }

      if (result.summary) {
        publish({ result: { status: "ready", value: result } })
        return
      }

      scheduleResultRetry(generation, attempt + 1, null)
    } catch (error) {
      if (left || generation !== resultGeneration) {
        return
      }

      scheduleResultRetry(
        generation,
        attempt + 1,
        failureOf("result", readErrorMessage(error))
      )
    }
  }

  function scheduleResultRetry(
    generation: number,
    attempt: number,
    failure: RoomVisitFailure | null
  ): void {
    publish({ result: { status: "loading", attempt, failure } })
    resultTimer = dependencies.setTimeout(() => {
      resultTimer = null
      void pollResult(generation, attempt)
    }, RESULT_FETCH_RETRY_MS)
  }

  function updateElapsedTime(): void {
    if (
      left ||
      state.timer.paused ||
      reconciledSolved ||
      (developmentFallback && state.solved)
    ) {
      return
    }

    const elapsedMs = getTimerElapsedMs(state.timer, dependencies.now())

    if (elapsedMs !== state.elapsedMs) {
      publish({ elapsedMs })
    }
  }

  function act(intent: RoomVisitIntent): RoomVisitIntentResult {
    if (left) {
      return rejected("left")
    }

    if (intent.type === "timer.toggle") {
      if (!state.availability.pause) {
        return rejected("not-connected")
      }

      multiplayer?.send({
        type: state.timer.paused ? "session:resume" : "session:pause",
      })
      return accepted()
    }

    if (intent.type === "preview.set") {
      if (!state.availability.preview || !canvas) {
        return rejected("not-ready")
      }

      canvas.setPreviewVisible(intent.visible)
      publish({ previewVisible: intent.visible })
      return accepted()
    }

    if (intent.type === "pieces.highlight") {
      if (!state.availability.highlight || !canvas) {
        return rejected("not-ready")
      }

      canvas.highlightPieces()
      return accepted()
    }

    if (intent.type === "pieces.arrange") {
      if (!canvasReady || !canvas) {
        return rejected("not-ready")
      }

      if (!state.availability.arrange) {
        return rejected("paused")
      }

      canvas.arrangePieces(intent.mode)
      return accepted()
    }

    if (intent.type === "view.zoom") {
      if (!state.availability.zoom || !canvas) {
        return rejected("not-ready")
      }

      canvas.changeZoom(intent.action)
      return accepted()
    }

    if (intent.type === "chat.send") {
      const text = intent.text.trim()

      if (!text || text.length > CHAT_MESSAGE_MAX_LENGTH) {
        return rejected("invalid")
      }

      if (!state.availability.chat || !multiplayer) {
        return rejected("not-connected")
      }

      const cursor = canvas?.getCursorPosition()
      multiplayer.send({ type: "chat:send", text, ...(cursor ?? {}) })
      return accepted()
    }

    if (intent.type === "player.save") {
      const name = intent.profile.name.trim()

      if (!name) {
        return rejected("invalid")
      }

      if (!state.availability.saveProfile) {
        return rejected("busy")
      }

      profileSavePending = true
      publish({
        session: { ...state.session, status: "saving", failure: null },
      })
      void saveProfile({ name, color: intent.profile.color })
      return accepted()
    }

    if (intent.type === "appearance.refresh") {
      if (!state.availability.refreshTheme || !canvas) {
        return rejected("not-ready")
      }

      canvas.refreshTheme()
      return accepted()
    }

    if (!state.availability.quickSolve || !canvas) {
      return rejected(
        dependencies.isDevelopment ? "not-ready" : "development-only"
      )
    }

    canvas.quickSolve()
    return accepted()
  }

  async function saveProfile(profile: {
    readonly name: string
    readonly color: string
  }): Promise<void> {
    try {
      const session = await dependencies.saveProfile(
        currentSession.token,
        profile
      )

      if (left) {
        return
      }

      currentSession = session
      profileSavePending = false
      const persistenceFailure = persistSession(session)
      restoreFailure = persistenceFailure
      publish({
        session: {
          value: session,
          status: persistenceFailure ? "offline" : "saved",
          failure: persistenceFailure,
          successfulProfileSaves: state.session.successfulProfileSaves + 1,
        },
      })
      publishPhase()
    } catch (error) {
      if (left) {
        return
      }

      profileSavePending = false
      publish({
        session: {
          ...state.session,
          status: "error",
          failure: failureOf("session", readErrorMessage(error)),
        },
      })
    }
  }

  function sendCanvasMessage(message: ClientToServerMessage): void {
    if (!left && multiplayer?.isConnected()) {
      multiplayer.send(message)
    }
  }

  function persistSession(session: PlayerSession): RoomVisitFailure | null {
    const message = dependencies.saveSession(session)

    return message ? failureOf("session", message) : null
  }

  function failVisit(
    scope: Extract<RoomVisitFailure["scope"], "snapshot" | "canvas">,
    message: string
  ): void {
    if (left) {
      return
    }

    fatalFailure = failureOf(scope, message)
    stopTimerInterval()
    publish({ phase: { status: "failed", failure: fatalFailure } })
  }

  function leave(): void {
    if (left) {
      return
    }

    left = true
    resultGeneration++
    stopTimerInterval()

    if (resultTimer !== null) {
      dependencies.clearTimeout(resultTimer)
      resultTimer = null
    }

    multiplayer?.destroy()
    multiplayer = null
    canvas?.destroy()
    canvas = null
    listeners.clear()
  }

  function stopTimerInterval(): void {
    if (timerInterval === null) {
      return
    }

    dependencies.clearInterval(timerInterval)
    timerInterval = null
  }
}

function createInitialState(
  roomId: string,
  session: PlayerSession,
  now: number
): RoomVisitState {
  const timer: RoomTimer = { elapsedMs: 0, paused: false, updatedAt: now }
  const state: RoomVisitState = {
    roomId,
    phase: { status: "starting", message: "Starting room..." },
    connection: { status: "connecting", failure: null },
    session: {
      value: session,
      status: "local",
      failure: null,
      successfulProfileSaves: 0,
    },
    timer,
    elapsedMs: 0,
    stats: {
      totalPieces: 0,
      placedPieces: 0,
      groupsCount: 0,
      snapCount: 0,
      source: "optimistic",
    },
    solved: false,
    completionRevision: 0,
    chatMessages: [],
    result: { status: "idle" },
    previewVisible: false,
    piecesHighlighted: false,
    availability: unavailableActions(),
  }

  return state
}

function deriveAvailability(
  state: RoomVisitState,
  canvasReady: boolean,
  dependencies: Pick<RoomVisitDependencies, "isDevelopment">
): RoomVisitAvailability {
  const connected = state.connection.status === "connected"

  return {
    pause: connected,
    preview: canvasReady,
    highlight: canvasReady,
    arrange: canvasReady && !state.timer.paused,
    zoom: canvasReady,
    chat: connected,
    saveProfile:
      state.session.status !== "restoring" && state.session.status !== "saving",
    refreshTheme: canvasReady,
    quickSolve: canvasReady && dependencies.isDevelopment,
  }
}

function unavailableActions(): RoomVisitAvailability {
  return {
    pause: false,
    preview: false,
    highlight: false,
    arrange: false,
    zoom: false,
    chat: false,
    saveProfile: false,
    refreshTheme: false,
    quickSolve: false,
  }
}

function toVisitStats(
  stats: Pick<
    RoomStats,
    "totalPieces" | "placedPieces" | "groupsCount" | "snapCount"
  >,
  source: RoomVisitStats["source"]
): RoomVisitStats {
  return {
    totalPieces: stats.totalPieces,
    placedPieces: stats.placedPieces,
    groupsCount: stats.groupsCount,
    snapCount: stats.snapCount,
    source,
  }
}

function isSolved(
  stats: Pick<RoomStats, "totalPieces" | "placedPieces">
): boolean {
  return stats.totalPieces > 0 && stats.placedPieces >= stats.totalPieces
}

function failureOf(
  scope: RoomVisitFailure["scope"],
  message: string
): RoomVisitFailure {
  return { scope, message }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Room unavailable"
}

function accepted(): RoomVisitIntentResult {
  return { accepted: true }
}

function rejected(
  reason: Extract<RoomVisitIntentResult, { accepted: false }>["reason"]
): RoomVisitIntentResult {
  return { accepted: false, reason }
}
