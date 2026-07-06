import type { Application } from "pixi.js"
import type * as React from "react"
import { useEffect, useRef, useState } from "react"

import {
  createImageJigsawConfig,
  getPlayAreaBounds,
  JIGSAW_CONFIG_2000,
} from "@jigtable/jigsaw-core/jigsaw/config"
import { createJigsawState } from "@jigtable/jigsaw-core/jigsaw/generate-jigsaw"
import {
  getGroupAnchor,
  moveGroupToAnchor,
} from "@jigtable/jigsaw-core/jigsaw/groups"
import { scatterAllPieces } from "@jigtable/jigsaw-core/jigsaw/scatter"
import type {
  JigsawState,
  JigsawStats,
} from "@jigtable/jigsaw-core/jigsaw/types"
import type {
  JigsawGroupLock,
  JigsawPlayer,
  JigsawRoomSnapshot,
  JigsawRoomTimer,
  JigsawSession,
  ServerToClientMessage,
} from "@jigtable/jigsaw-core/multiplayer/protocol"
import { loadImageTexture } from "./image-texture"
import {
  fetchAuthMe,
  fetchJigsawHistory,
  getTelegramBotUsername,
  getTelegramLoginWidgetBlocker,
  hasTelegramWebAppInitData,
  loginTelegramWebApp,
  loginTelegramWidget,
  readLocalAuthSession,
  saveLocalAuthSession,
  type AuthSession,
} from "./multiplayer/auth"
import type {
  JigsawMultiplayerClient,
  MultiplayerStatus,
} from "./multiplayer/client"
import {
  createJigsawMultiplayerClient,
  readLocalJigsawSession,
  restoreJigsawSession,
  saveJigsawSessionProfile,
  saveLocalJigsawSession,
} from "./multiplayer/client"
import type { CameraController } from "./pixi/camera"
import { createCameraController } from "./pixi/camera"
import { createJigsawPixiApp, destroyJigsawPixiApp } from "./pixi/create-app"
import type { JigsawScene } from "./pixi/create-scene"
import { createJigsawScene, readSceneColors } from "./pixi/create-scene"
import type {
  CursorBroadcastController,
  RemoteCursorViewSet,
} from "./pixi/cursors"
import { createRemoteCursorViews, setupCursorBroadcast } from "./pixi/cursors"
import type { DebugTicker } from "./pixi/debug"
import { createDebugTicker, getJigsawStats } from "./pixi/debug"
import type { InteractionController } from "./pixi/interactions"
import { setupPieceInteractions } from "./pixi/interactions"
import type { PieceViewSet } from "./pixi/pieces"
import { createPieceViews } from "./pixi/pieces"
import { fetchJigsawRoomSnapshot } from "./room-api"
import {
  createInitialTimer,
  formatElapsedTime,
  getTimerElapsedMs,
} from "./time"

import "./jigsaw-room-game.css"
import "./jigsaw-room.css"

const JIGSAW_IMAGE_URL = "/test_jigsaw.png"
const DEV_ROOM_ID = "dev-room"
const ACTIVE_JIGSAW_CONFIG = JIGSAW_CONFIG_2000
const GROUP_MOVE_SEND_INTERVAL_MS = 66
const SOLVED_CELEBRATION_MS = 5600
const FIREWORK_BURSTS = Array.from({ length: 4 }, (_, index) => index)

type JigsawSessionStatus =
  "local" | "restoring" | "saved" | "saving" | "offline" | "error"

interface JigsawRoomAppProps {
  roomId?: string
}

interface JigsawRuntime {
  app: Application
  state: JigsawState
  scene: JigsawScene
  camera: CameraController
  pieces: PieceViewSet
  cursors: RemoteCursorViewSet
  cursorBroadcast: CursorBroadcastController
  debug: DebugTicker
  interactions: InteractionController
}

const EMPTY_STATS = {
  fps: 0,
  zoom: 1,
  totalPieces: ACTIVE_JIGSAW_CONFIG.rows * ACTIVE_JIGSAW_CONFIG.cols,
  placedPieces: 0,
  groupsCount: ACTIVE_JIGSAW_CONFIG.rows * ACTIVE_JIGSAW_CONFIG.cols,
  snapCount: 0,
} satisfies JigsawStats

export function JigsawRoomApp({ roomId }: JigsawRoomAppProps) {
  const initialSessionRef = useRef<JigsawSession | null>(null)

  const initialSession = initialSessionRef.current ?? readLocalJigsawSession()

  initialSessionRef.current = initialSession
  const mountRef = useRef<HTMLDivElement | null>(null)
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<JigsawRuntime | null>(null)
  const multiplayerRef = useRef<JigsawMultiplayerClient | null>(null)
  const handleServerMessageRef = useRef<
    (message: ServerToClientMessage) => void
  >(() => {})
  const toggleSessionPauseRef = useRef<() => void>(() => {})
  const sessionRef = useRef<JigsawSession>(initialSession)
  const playerRef = useRef<JigsawPlayer>(initialSession.player)
  const groupLocksRef = useRef(new Map<string, JigsawGroupLock>())
  const roomTimerRef = useRef<JigsawRoomTimer>(createInitialTimer())
  const lastMoveSentAtRef = useRef(0)
  const highlightTimerRef = useRef<number | null>(null)
  const solvedCelebrationTimerRef = useRef<number | null>(null)
  const solvedAnnouncedRef = useRef(false)
  const activeRoomId = roomId ?? ""
  const [ready, setReady] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [piecesHighlighted, setPiecesHighlighted] = useState(false)
  const [showSolvedCelebration, setShowSolvedCelebration] = useState(false)
  const [connectionStatus, setConnectionStatus] =
    useState<MultiplayerStatus>("connecting")
  const [playersCount, setPlayersCount] = useState(1)
  const [lastServerEvent, setLastServerEvent] = useState("none")
  const [roomStatus, setRoomStatus] = useState("Starting Pixi room...")
  const [sessionStatus, setSessionStatus] =
    useState<JigsawSessionStatus>("local")
  const [sessionMessage, setSessionMessage] = useState("")
  const [playerProfile, setPlayerProfile] = useState<JigsawPlayer>(
    initialSession.player
  )
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState("Telegram login optional")
  const [telegramWidgetVisible, setTelegramWidgetVisible] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)
  const [profileForm, setProfileForm] = useState(() => ({
    name: initialSession.player.name,
    color: initialSession.player.color,
  }))
  const [roomTimer, setRoomTimer] = useState<JigsawRoomTimer>(() =>
    createInitialTimer()
  )
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const [stats, setStats] = useState<JigsawStats>(EMPTY_STATS)
  const elapsedMs = getTimerElapsedMs(roomTimer, timerNow)
  const solved = stats.totalPieces > 0 && stats.placedPieces >= stats.totalPieces
  const remainingPieces = Math.max(stats.totalPieces - stats.placedPieces, 0)
  const completionLabel = !ready
    ? "Loading"
    : solved
      ? "Solved"
      : `${remainingPieces} left`
  const completionClassName = solved
    ? "jigsaw-room__completion jigsaw-room__completion--solved"
    : "jigsaw-room__completion"

  roomTimerRef.current = roomTimer
  handleServerMessageRef.current = handleServerMessage
  toggleSessionPauseRef.current = toggleSessionPause

  useEffect(() => {
    const host = mountRef.current
    let disposed = false
    let cleanup = () => {}

    if (!host) {
      return cleanup
    }

    const bootHost = host

    async function boot() {
      setReady(false)
      setStats(EMPTY_STATS)
      setShowSolvedCelebration(false)
      solvedAnnouncedRef.current = false

      if (solvedCelebrationTimerRef.current !== null) {
        window.clearTimeout(solvedCelebrationTimerRef.current)
        solvedCelebrationTimerRef.current = null
      }

      setRoomStatus(roomId ? "Loading room..." : "Invite link required")

      if (!roomId) {
        setConnectionStatus("unavailable")
        return
      }

      const app = await createJigsawPixiApp(bootHost)

      try {
        if (disposed) {
          destroyJigsawPixiApp(app)
          return
        }

        let activeSession = sessionRef.current

        setSessionStatus("restoring")
        setSessionMessage("")

        try {
          activeSession = await restoreJigsawSession(activeSession, roomId)

          if (disposed) {
            destroyJigsawPixiApp(app)
            return
          }

          applyJigsawSession(activeSession)
          setSessionStatus("saved")
        } catch (error) {
          if (disposed) {
            destroyJigsawPixiApp(app)
            return
          }

          setSessionStatus("offline")
          setSessionMessage(readErrorMessage(error))
        }

        let initialSnapshot: JigsawRoomSnapshot | null = null

        if (roomId) {
          try {
            initialSnapshot = await fetchJigsawRoomSnapshot(roomId)
          } catch (error) {
            if (!isLocalDevRoom(roomId)) {
              throw error
            }

            setSessionStatus("offline")
            setSessionMessage("Local test room")
          }
        }

        const imageTexture = await loadImageTexture(
          initialSnapshot?.jigsaw.imageUrl ?? JIGSAW_IMAGE_URL
        )

        if (disposed) {
          imageTexture.destroy(true)
          destroyJigsawPixiApp(app)
          return
        }

        const jigsawConfig =
          initialSnapshot?.jigsaw.config ??
          createImageJigsawConfig(ACTIVE_JIGSAW_CONFIG, {
            width: imageTexture.width,
            height: imageTexture.height,
          })
        const state = createJigsawState(jigsawConfig)

        if (initialSnapshot) {
          state.pieces = structuredClone(initialSnapshot.pieces)
          state.groups = structuredClone(initialSnapshot.groups)
          state.snapCount = initialSnapshot.stats.snapCount
          applyRoomTimer(initialSnapshot.timer)
        } else {
          scatterAllPieces(state)
        }

        const colors = readSceneColors(bootHost)
        const scene = createJigsawScene(app, state, imageTexture, colors)
        const pieces = createPieceViews(
          scene.piecesLayer,
          state,
          imageTexture,
          colors.pieceHighlight
        )
        const camera = createCameraController(app, scene.world, state.config, {
          canStartPrimaryPan(_event, world) {
            const pieceId = pieces.pickPieceAt(world.x, world.y, {
              includeLocked: true,
            })

            if (!pieceId) {
              return true
            }

            const piece = state.pieces[pieceId]

            return Boolean(
              piece && (piece.locked || state.groups[piece.groupId]?.locked)
            )
          },
        })
        camera.fitToRect(getPlayAreaBounds(state.config))
        const cursors = createRemoteCursorViews(app, scene.overlayLayer, camera)

        if (initialSnapshot) {
          cursors.syncCursors(initialSnapshot.cursors, playerRef.current.id)
        }

        const refreshStats = () => {
          setStats(getJigsawStats(state, app.ticker.FPS || 0, camera.zoom))
        }
        const interactions = setupPieceInteractions({
          app,
          state,
          camera,
          pieces,
          canDragGroup(groupId) {
            if (roomTimerRef.current.paused) {
              return false
            }

            const lock = groupLocksRef.current.get(groupId)

            return !lock || lock.playerId === playerRef.current.id
          },
          isServerMode() {
            return multiplayerRef.current?.isConnected() ?? false
          },
          onChange: refreshStats,
          onGroupGrab(groupId) {
            multiplayerRef.current?.send({ type: "group:grab", groupId })
          },
          onGroupMove(groupId) {
            const connection = multiplayerRef.current

            if (!connection?.isConnected()) {
              return
            }

            const now = performance.now()

            if (now - lastMoveSentAtRef.current < GROUP_MOVE_SEND_INTERVAL_MS) {
              return
            }

            const anchor = getGroupAnchor(state, groupId)

            if (!anchor) {
              return
            }

            lastMoveSentAtRef.current = now
            connection.send({
              type: "group:move",
              groupId,
              x: anchor.x,
              y: anchor.y,
            })
          },
          onGroupDrop(groupId) {
            const anchor = getGroupAnchor(state, groupId)

            if (!anchor) {
              multiplayerRef.current?.send({ type: "group:release", groupId })
              return
            }

            lastMoveSentAtRef.current = 0
            multiplayerRef.current?.send({
              type: "group:drop",
              groupId,
              x: anchor.x,
              y: anchor.y,
            })
          },
        })
        const cursorBroadcast = setupCursorBroadcast({
          app,
          camera,
          getConnection() {
            return multiplayerRef.current
          },
        })
        const debug = createDebugTicker(app, state, camera, setStats)

        runtimeRef.current = {
          app,
          state,
          scene,
          camera,
          pieces,
          cursors,
          cursorBroadcast,
          debug,
          interactions,
        }

        multiplayerRef.current = createJigsawMultiplayerClient({
          roomId: activeRoomId,
          sessionToken: activeSession.token,
          onStatus: setConnectionStatus,
          onMessage(message) {
            handleServerMessageRef.current(message)
          },
        })

        cleanup = () => {
          if (highlightTimerRef.current !== null) {
            window.clearTimeout(highlightTimerRef.current)
            highlightTimerRef.current = null
          }

          interactions.destroy()
          cursorBroadcast.destroy()
          multiplayerRef.current?.destroy()
          multiplayerRef.current = null
          debug.destroy()
          camera.destroy()
          cursors.destroy()
          pieces.destroy()
          imageTexture.destroy(true)
          destroyJigsawPixiApp(app)
        }

        setReady(true)
        setRoomStatus("")
        refreshStats()
      } catch (error) {
        if (!disposed) {
          setReady(false)
          setConnectionStatus("unavailable")
          setRoomStatus(
            error instanceof Error ? error.message : "Failed to start room"
          )
          destroyJigsawPixiApp(app)
        }
      }
    }

    void boot()

    return () => {
      disposed = true
      runtimeRef.current = null
      cleanup()
    }
  }, [activeRoomId, roomId])

  useEffect(() => {
    if (!solved) {
      return
    }

    if (solvedAnnouncedRef.current) {
      return
    }

    solvedAnnouncedRef.current = true
    setShowSolvedCelebration(true)

    if (solvedCelebrationTimerRef.current !== null) {
      window.clearTimeout(solvedCelebrationTimerRef.current)
    }

    solvedCelebrationTimerRef.current = window.setTimeout(() => {
      setShowSolvedCelebration(false)
      solvedCelebrationTimerRef.current = null
    }, SOLVED_CELEBRATION_MS)
  }, [solved])

  useEffect(() => {
    return () => {
      if (solvedCelebrationTimerRef.current !== null) {
        window.clearTimeout(solvedCelebrationTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimerNow(Date.now())
    }, 500)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const saved = readLocalAuthSession()

    if (!saved) {
      return
    }

    const authToken = saved.token
    let disposed = false

    async function refreshAuthSession(): Promise<void> {
      try {
        const session = await fetchAuthMe(authToken)
        const history = await fetchJigsawHistory(session.token)

        if (disposed) {
          return
        }

        saveLocalAuthSession(session)
        setAuthSession(session)
        setHistoryCount(history.length)
        setAuthStatus("Telegram session restored")
      } catch (error) {
        if (!disposed) {
          setAuthStatus(readErrorMessage(error))
        }
      }
    }

    void refreshAuthSession()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const host = telegramWidgetRef.current
    const botUsername = getTelegramBotUsername()

    if (!telegramWidgetVisible || !host || !botUsername) {
      return
    }

    const callbackName = `onJigsawTelegramAuth_${sessionRef.current.player.id.replace(/[^a-z0-9]/gi, "")}`
    const callbacks = window as unknown as Record<
      string,
      (payload: Record<string, unknown>) => void
    >
    const script = document.createElement("script")

    host.replaceChildren()
    callbacks[callbackName] = (payload) => {
      void loginWithTelegramWidget(payload)
    }

    script.async = true
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", "medium")
    script.setAttribute("data-userpic", "false")
    script.setAttribute("data-request-access", "write")
    script.setAttribute("data-onauth", `${callbackName}(user)`)
    host.appendChild(script)

    return () => {
      delete callbacks[callbackName]
      host.replaceChildren()
    }
  }, [telegramWidgetVisible])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.code !== "Space" ||
        event.repeat ||
        isEditableTarget(event.target) ||
        !runtimeRef.current
      ) {
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        toggleSessionPauseRef.current()
        return
      }

      togglePreview()
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  function refreshStatsNow(): void {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    setStats(
      getJigsawStats(
        runtime.state,
        runtime.app.ticker.FPS || 0,
        runtime.camera.zoom
      )
    )
  }

  function applyRoomTimer(timer: JigsawRoomTimer): void {
    roomTimerRef.current = timer
    setRoomTimer(timer)
    setTimerNow(Date.now())
  }

  function applyJigsawSession(session: JigsawSession): void {
    saveLocalJigsawSession(session)
    sessionRef.current = session
    playerRef.current = session.player
    setPlayerProfile(session.player)
    setProfileForm({
      name: session.player.name,
      color: session.player.color,
    })
  }

  async function saveProfile(
    event: React.SubmitEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault()

    const name = profileForm.name.trim()

    if (!name) {
      setSessionStatus("error")
      setSessionMessage("Nickname required")
      return
    }

    setSessionStatus("saving")
    setSessionMessage("")

    try {
      const session = await saveJigsawSessionProfile(sessionRef.current.token, {
        name,
        color: profileForm.color,
      })

      applyJigsawSession(session)
      setSessionStatus("saved")
    } catch (error) {
      setSessionStatus("error")
      setSessionMessage(readErrorMessage(error))
    }
  }

  async function loginWithTelegram(): Promise<void> {
    if (!hasTelegramWebAppInitData()) {
      if (!getTelegramBotUsername()) {
        setAuthStatus(
          "Set VITE_TELEGRAM_BOT_USERNAME to bot username ending with bot"
        )
        return
      }

      const widgetBlocker = getTelegramLoginWidgetBlocker()

      if (widgetBlocker) {
        setAuthStatus(widgetBlocker)
        return
      }

      setTelegramWidgetVisible(true)
      setAuthStatus("Confirm in Telegram widget")
      return
    }

    setAuthStatus("Telegram WebApp login...")

    try {
      const session = await loginTelegramWebApp(sessionRef.current.token)
      const history = await fetchJigsawHistory(session.token)

      setAuthSession(session)
      setHistoryCount(history.length)
      setAuthStatus("Telegram linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    }
  }

  async function loginWithTelegramWidget(
    payload: Record<string, unknown>
  ): Promise<void> {
    setAuthStatus("Telegram widget login...")

    try {
      const session = await loginTelegramWidget(
        payload,
        sessionRef.current.token
      )
      const history = await fetchJigsawHistory(session.token)

      setAuthSession(session)
      setHistoryCount(history.length)
      setTelegramWidgetVisible(false)
      setAuthStatus("Telegram linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    }
  }

  function handleServerMessage(message: ServerToClientMessage): void {
    const runtime = runtimeRef.current

    if (message.type === "cursor:moved") {
      if (message.cursor.playerId !== playerRef.current.id) {
        runtime?.cursors.applyCursor(message.cursor)
      }

      return
    }

    if (message.type === "cursor:hidden") {
      runtime?.cursors.removeCursor(message.playerId)
      return
    }

    setLastServerEvent(message.type)

    if (message.type === "session:paused") {
      applyRoomTimer(message.timer)
      runtime?.interactions.cancelDrag()
      multiplayerRef.current?.requestState()
      return
    }

    if (message.type === "session:resumed") {
      applyRoomTimer(message.timer)
      return
    }

    if (message.type === "room:state") {
      setRoomStatus("")
      setPlayersCount(message.state.players.length)
      applyRoomTimer(message.state.timer)
      groupLocksRef.current.clear()

      for (const lock of message.state.locks) {
        groupLocksRef.current.set(lock.groupId, lock)
      }

      runtime?.cursors.syncCursors(message.state.cursors, playerRef.current.id)

      if (message.state.timer.paused) {
        runtime?.interactions.cancelDrag()
      }

      applyRoomState(runtime, message.state)
      setStats((current) => ({
        ...current,
        totalPieces: message.state.stats.totalPieces,
        placedPieces: message.state.stats.placedPieces,
        groupsCount: message.state.stats.groupsCount,
        snapCount: message.state.stats.snapCount,
      }))
      return
    }

    if (message.type === "player:joined") {
      setPlayersCount(message.playersCount)
      return
    }

    if (message.type === "player:updated") {
      if (message.player.id === playerRef.current.id) {
        applyJigsawSession({
          ...sessionRef.current,
          player: message.player,
          updatedAt: Date.now(),
        })
      }

      return
    }

    if (message.type === "player:left") {
      setPlayersCount(message.playersCount)
      runtime?.cursors.removeCursor(message.playerId)
      return
    }

    if (message.type === "group:locked") {
      groupLocksRef.current.set(message.lock.groupId, message.lock)
      return
    }

    if (message.type === "group:unlocked") {
      groupLocksRef.current.delete(message.groupId)
      return
    }

    if (message.type === "group:moved") {
      if (!runtime) {
        return
      }

      const movedPieceIds = moveGroupToAnchor(
        runtime.state,
        message.groupId,
        message.x,
        message.y
      )
      runtime.pieces.syncPieces(movedPieceIds)
      refreshStatsNow()
      return
    }

    if (message.type === "groups:merged" || message.type === "pieces:placed") {
      if (!runtime) {
        return
      }

      applyStatePatch(
        runtime,
        message.pieces,
        message.groups,
        message.type === "groups:merged" ? message.removedGroupIds : [],
        message.snapCount
      )
      return
    }

    if (message.type === "stats:updated") {
      setStats((current) => ({
        ...current,
        totalPieces: message.stats.totalPieces,
        placedPieces: message.stats.placedPieces,
        groupsCount: message.stats.groupsCount,
        snapCount: message.stats.snapCount,
      }))
      setPlayersCount(message.stats.playersCount)
      return
    }

    if (message.type === "error") {
      if (message.code === "room_not_found") {
        setRoomStatus(message.message)
        setConnectionStatus("unavailable")
        return
      }

      if (
        message.code === "session_required" ||
        message.code === "not_joined"
      ) {
        setRoomStatus(message.message)
        setConnectionStatus("unavailable")
        return
      }

      if (message.code === "session_paused") {
        runtime?.interactions.cancelDrag()
        multiplayerRef.current?.requestState()
        return
      }

      multiplayerRef.current?.requestState()
    }
  }

  function toggleSessionPause(): void {
    const connection = multiplayerRef.current

    if (!connection?.isConnected()) {
      return
    }

    connection.send({
      type: roomTimer.paused ? "session:resume" : "session:pause",
    })
  }

  function togglePreview(): void {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    setPreviewVisible((current) => {
      const next = !current
      runtime.scene.setPreviewVisible(next)
      return next
    })
  }

  function highlightAllPieces(): void {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
    }

    runtime.pieces.setAllHighlighted(true)
    setPiecesHighlighted(true)
    highlightTimerRef.current = window.setTimeout(() => {
      runtimeRef.current?.pieces.setAllHighlighted(false)
      setPiecesHighlighted(false)
      highlightTimerRef.current = null
    }, 900)
  }

  function zoomInView(): void {
    runtimeRef.current?.camera.zoomIn()
    refreshStatsNow()
  }

  function zoomOutView(): void {
    runtimeRef.current?.camera.zoomOut()
    refreshStatsNow()
  }

  function resetViewZoom(): void {
    runtimeRef.current?.camera.resetView()
    refreshStatsNow()
  }

  return (
    <div className="jigsaw-room">
      <div ref={mountRef} className="jigsaw-room__stage" />

      <div className="jigsaw-room__toolbar" aria-label="Jigsaw room controls">
        <div className="jigsaw-room__brand">
          <strong>Jigsaw room</strong>
          <span className="jigsaw-room__timer">
            {formatElapsedTime(elapsedMs)}
            {roomTimer.paused ? " paused" : ""}
          </span>
          <span className={completionClassName}>{completionLabel}</span>
        </div>
        <div className="jigsaw-room__actions">
          <button
            type="button"
            onClick={toggleSessionPause}
            disabled={!ready || connectionStatus !== "connected"}
            aria-pressed={roomTimer.paused}
          >
            {roomTimer.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={togglePreview}
            disabled={!ready}
            aria-pressed={previewVisible}
          >
            {previewVisible ? "Hide Preview" : "Preview"}
          </button>
          <button
            type="button"
            onClick={highlightAllPieces}
            disabled={!ready}
            aria-pressed={piecesHighlighted}
          >
            Highlight
          </button>
          {/* <button */}
          {/*   type="button" */}
          {/*   onClick={shuffleUnsolved} */}
          {/*   disabled={!ready || connectionStatus === "connected"} */}
          {/*   title={ */}
          {/*     connectionStatus === "connected" */}
          {/*       ? "Shuffle is local-only for now" */}
          {/*       : undefined */}
          {/*   } */}
          {/* > */}
          {/*   {connectionStatus === "connected" ? "Shuffle off" : "Shuffle"} */}
          {/* </button> */}
          <button
            type="button"
            onClick={() => {
              window.location.href = "/profile"
            }}
          >
            Profile
          </button>
        </div>
      </div>

      <form
        className="jigsaw-room__profile"
        aria-label="Player profile"
        onSubmit={saveProfile}
      >
        <label>
          <span>Nick</span>
          <input
            type="text"
            value={profileForm.name}
            maxLength={24}
            onChange={(event) => {
              setProfileForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }}
          />
        </label>
        <label className="jigsaw-room__profile-color">
          <span>Color</span>
          <input
            type="color"
            value={profileForm.color}
            onChange={(event) => {
              setProfileForm((current) => ({
                ...current,
                color: event.target.value,
              }))
            }}
          />
        </label>
        <button
          type="submit"
          disabled={
            sessionStatus === "restoring" ||
            sessionStatus === "saving" ||
            !profileForm.name.trim()
          }
        >
          {sessionStatus === "saving" ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          disabled={sessionStatus === "restoring"}
          onClick={() => void loginWithTelegram()}
        >
          {authSession ? "TG linked" : "TG login"}
        </button>
        <p>
          {getSessionStatusText(sessionStatus, sessionMessage)}. {authStatus}
          {historyCount === null ? "" : `. Solved ${historyCount}`}
        </p>
        {telegramWidgetVisible ? (
          <div
            ref={telegramWidgetRef}
            className="jigsaw-room__telegram-widget"
          />
        ) : null}
      </form>

      <dl className="jigsaw-room__stats" aria-label="Jigsaw stats">
        <div>
          <dt>FPS</dt>
          <dd>{Math.round(stats.fps)}</dd>
        </div>
        <div>
          <dt>Zoom</dt>
          <dd>{stats.zoom.toFixed(2)}x</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{stats.totalPieces}</dd>
        </div>
        <div>
          <dt>Placed</dt>
          <dd>{stats.placedPieces}</dd>
        </div>
        <div>
          <dt>Groups</dt>
          <dd>{stats.groupsCount}</dd>
        </div>
        <div>
          <dt>Snaps</dt>
          <dd>{stats.snapCount}</dd>
        </div>
      </dl>

      <div className="jigsaw-room__zoom-controls" aria-label="Zoom controls">
        <button
          type="button"
          onClick={zoomOutView}
          disabled={!ready}
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetViewZoom}
          disabled={!ready}
          aria-label="Fit puzzle to screen"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={zoomInView}
          disabled={!ready}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      <div className="jigsaw-room__hint">
        Drag pieces. <kbd className="jigsaw-room__shortcut">Wheel</kbd>, pinch,
        or zoom buttons zoom. Empty/solved/
        <kbd className="jigsaw-room__shortcut">middle/right drag</kbd> pans.
        <kbd className="jigsaw-room__shortcut">Space</kbd> preview.
        <kbd className="jigsaw-room__shortcut">Shift+Space</kbd> pause. Drop
        near the board or a true neighbor to snap.
      </div>

      {roomTimer.paused ? (
        <div className="jigsaw-room__pause-banner">
          Paused
          {roomTimer.pausedByPlayerName
            ? ` by ${roomTimer.pausedByPlayerName}`
            : ""}
        </div>
      ) : null}

      {showSolvedCelebration ? (
        <div
          className="jigsaw-room__solved-celebration"
          role="status"
          aria-live="polite"
        >
          <div className="jigsaw-room__fireworks" aria-hidden="true">
            {FIREWORK_BURSTS.map((burst) => (
              <span key={burst} />
            ))}
          </div>
          <div className="jigsaw-room__solved-card">
            <span>Jigsaw solved</span>
            <strong>{formatElapsedTime(elapsedMs)}</strong>
          </div>
        </div>
      ) : null}

      <div className="jigsaw-room__multiplayer" aria-label="Multiplayer debug">
        <div>
          <span>Status</span>
          <strong>{connectionStatus}</strong>
        </div>
        <div>
          <span>Room</span>
          <strong>{activeRoomId}</strong>
        </div>
        <div>
          <span>Player</span>
          <strong style={{ color: playerProfile.color }}>
            {playerProfile.name}
          </strong>
        </div>
        <div>
          <span>Players</span>
          <strong>{playersCount}</strong>
        </div>
        <div>
          <span>Last</span>
          <strong>{lastServerEvent}</strong>
        </div>
      </div>

      {!ready && (
        <div className="jigsaw-room__loading">
          <span className="jigsaw-room__spinner" aria-hidden="true" />
          {roomStatus}
        </div>
      )}
    </div>
  )
}

function applyRoomState(
  runtime: JigsawRuntime | null,
  snapshot: JigsawRoomSnapshot
): void {
  if (!runtime) {
    return
  }

  runtime.state.pieces = structuredClone(snapshot.pieces)
  runtime.state.groups = structuredClone(snapshot.groups)
  runtime.state.snapCount = snapshot.stats.snapCount
  runtime.pieces.syncAll()
}

function applyStatePatch(
  runtime: JigsawRuntime,
  pieces: JigsawRoomSnapshot["pieces"],
  groups: JigsawRoomSnapshot["groups"],
  removedGroupIds: string[],
  snapCount: number
): void {
  const affectedPieceIds = Object.keys(pieces)

  for (const [pieceId, piece] of Object.entries(pieces)) {
    runtime.state.pieces[pieceId] = structuredClone(piece)
  }

  for (const groupId of removedGroupIds) {
    delete runtime.state.groups[groupId]
  }

  for (const [groupId, group] of Object.entries(groups)) {
    runtime.state.groups[groupId] = structuredClone(group)
  }

  runtime.state.snapCount = snapCount
  runtime.pieces.syncPieces(affectedPieceIds)
}

function getSessionStatusText(
  status: JigsawSessionStatus,
  message: string
): string {
  if (message && (status === "error" || status === "offline")) {
    return message
  }

  if (status === "restoring") {
    return "Restoring session"
  }

  if (status === "saving") {
    return "Saving profile"
  }

  if (status === "saved") {
    return "Session saved"
  }

  if (status === "offline") {
    return "Local session"
  }

  if (status === "error") {
    return "Session error"
  }

  return "Local profile"
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Session unavailable"
}

function isLocalDevRoom(roomId: string): boolean {
  return import.meta.env.DEV && roomId === DEV_ROOM_ID
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export default JigsawRoomApp
