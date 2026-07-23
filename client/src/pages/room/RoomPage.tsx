import { useEffect, useRef, useState } from "react"

import { JIGSAW_CONFIG_2000 } from "@jigtable/core/config"
import type {
  ChatMessage,
  Player as JigsawPlayer,
  RoomSnapshot as JigsawRoomSnapshot,
  RoomTimer as JigsawRoomTimer,
  PlayerSession as JigsawSession,
  ServerToClientMessage,
} from "@jigtable/core/protocol"
import type { ArrangeLoosePiecesMode } from "@jigtable/core/scatter"

import {
  fetchAuthMe,
  getTelegramBotUsername,
  getTelegramLoginWidgetBlocker,
  hasTelegramWebAppInitData,
  loginTelegramWebApp,
  loginTelegramWidget,
  readLocalAuthSession,
  saveLocalAuthSession,
  type AuthSession,
} from "@/features/auth/auth"
import { fetchJigsawHistory } from "@/features/history/history"
import type {
  JigsawMultiplayerClient,
  MultiplayerStatus,
} from "@/features/room/multiplayer"
import { createJigsawMultiplayerClient } from "@/features/room/multiplayer"
import {
  readLocalJigsawSession,
  restoreJigsawSession,
  saveJigsawSessionProfile,
  saveLocalJigsawSession,
} from "@/features/session/session"
import {
  fetchJigsawRoomResult,
  fetchJigsawRoomSnapshot,
  type JigsawRoomResult,
} from "@/features/room/data"

import { RoomChatWidget } from "./RoomChatWidget"
import { SolvedRoomResults } from "./SolvedRoomResults"
import {
  createJigsawRoomCanvas,
  type JigsawRoomCanvas,
  type JigsawStats,
} from "./pixi/room-canvas"
import {
  createInitialTimer,
  formatElapsedTime,
  getTimerElapsedMs,
} from "./timer"

import "@/features/room/room.css"
import "./room-page.css"

const JIGSAW_IMAGE_URL = "/test_jigsaw.png"
const ACTIVE_JIGSAW_CONFIG = JIGSAW_CONFIG_2000
const CHAT_MESSAGE_HISTORY_LIMIT = 100
const RESULTS_REVEAL_DELAY_MS = 2_500
const SOLVED_FIREWORKS_MS = 12_000
const RESULT_FETCH_RETRY_MS = 400
const FIREWORK_COUNT = 40
const LIGHT_ROOM_BACKGROUND = "#f2efe4"
const DARK_ROOM_BACKGROUND = "#151a20"
const LIGHT_ROOM_PIECE_HIGHLIGHT = "#00b8d9"
const DARK_ROOM_PIECE_HIGHLIGHT = "#f7ff4d"
const DARK_BACKGROUND_MIN_IMAGE_LUMINANCE = 0.45
const ROOM_BACKGROUND_STORAGE_PREFIX = "jigsaw-room-background:"
const ARRANGE_MODES = [
  { mode: "perimeter", label: "All sides" },
  { mode: "top", label: "Top side" },
  { mode: "right", label: "Right side" },
  { mode: "bottom", label: "Bottom side" },
  { mode: "left", label: "Left side" },
] as const satisfies ReadonlyArray<{
  mode: ArrangeLoosePiecesMode
  label: string
}>

type JigsawSessionStatus =
  "local" | "restoring" | "saved" | "saving" | "offline" | "error"

interface JigsawRoomAppProps {
  roomId?: string
}

const EMPTY_STATS = {
  fps: 0,
  zoom: 1,
  totalPieces: ACTIVE_JIGSAW_CONFIG.rows * ACTIVE_JIGSAW_CONFIG.cols,
  placedPieces: 0,
  groupsCount: ACTIVE_JIGSAW_CONFIG.rows * ACTIVE_JIGSAW_CONFIG.cols,
  snapCount: 0,
} satisfies JigsawStats

type FireworkBurst = {
  delay: number
  top: number
  left: number
  size: number
}

const FIREWORK_BURSTS = Array.from({ length: FIREWORK_COUNT }, (_, index) =>
  createFireworkBurst(index)
)

function createFireworkBurst(index: number): FireworkBurst {
  const isCenterBurst = index < 7
  const isFinale = index >= FIREWORK_COUNT - 5

  let delay: number

  if (isCenterBurst) {
    delay = seededUnit(index, 1) * 180
  } else if (isFinale) {
    delay = 6800 + seededUnit(index, 2) * 300
  } else {
    delay = 300 + seededUnit(index, 3) * 6500
  }

  return {
    delay,
    top:
      isCenterBurst || isFinale
        ? 30 + seededUnit(index, 4) * 40
        : seededUnit(index, 5) * 100,
    left:
      isCenterBurst || isFinale
        ? 30 + seededUnit(index, 6) * 40
        : seededUnit(index, 7) * 100,
    size:
      isCenterBurst || isFinale
        ? 7 + seededUnit(index, 8) * 4
        : 4 + seededUnit(index, 9) * 4,
  }
}

function seededUnit(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x119de1f3)

  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)

  return ((value >>> 0) % 10_000) / 10_000
}

function readCurrentTimeMs(): number {
  return Date.now()
}

export function RoomPage({ roomId }: JigsawRoomAppProps) {
  const [initialSession] = useState<JigsawSession>(() =>
    readLocalJigsawSession()
  )
  const roomRef = useRef<HTMLDivElement | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDetailsElement | null>(null)
  const runtimeRef = useRef<JigsawRoomCanvas | null>(null)
  const multiplayerRef = useRef<JigsawMultiplayerClient | null>(null)
  const handleServerMessageRef = useRef<
    (message: ServerToClientMessage) => void
  >(() => {})
  const toggleSessionPauseRef = useRef<() => void>(() => {})
  const sessionRef = useRef<JigsawSession>(initialSession)
  const playerRef = useRef<JigsawPlayer>(initialSession.player)
  const roomTimerRef = useRef<JigsawRoomTimer>(createInitialTimer())
  const resultsRevealTimerRef = useRef<number | null>(null)
  const solvedFireworksTimerRef = useRef<number | null>(null)
  const solvedAnnouncedRef = useRef(false)
  const activeRoomId = roomId ?? ""
  const [ready, setReady] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [piecesHighlighted, setPiecesHighlighted] = useState(false)
  const [solvedResultsOpen, setSolvedResultsOpen] = useState(false)
  const [solvedResultsExpanded, setSolvedResultsExpanded] = useState(false)
  const [showSolvedFireworks, setShowSolvedFireworks] = useState(false)
  const [completionResult, setCompletionResult] =
    useState<JigsawRoomResult | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<MultiplayerStatus>("connecting")
  const [roomStatus, setRoomStatus] = useState("Starting Pixi room...")
  const [sessionStatus, setSessionStatus] =
    useState<JigsawSessionStatus>("local")
  const [sessionMessage, setSessionMessage] = useState("")
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState("tg login optional")
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [playerId, setPlayerId] = useState(initialSession.player.id)
  const [playerName, setPlayerName] = useState(initialSession.player.name)
  const [roomBackgroundColor, setRoomBackgroundColor] =
    useState(DARK_ROOM_BACKGROUND)
  const elapsedMs = getTimerElapsedMs(roomTimer, timerNow)
  const solved =
    stats.totalPieces > 0 && stats.placedPieces >= stats.totalPieces
  const remainingPieces = Math.max(stats.totalPieces - stats.placedPieces, 0)

  const fireworkBursts = showSolvedFireworks ? FIREWORK_BURSTS : []
  const completionPercent =
    stats.totalPieces > 0
      ? Math.round((stats.placedPieces / stats.totalPieces) * 100)
      : 0
  const completionLabel = !ready
    ? "Loading"
    : solved
      ? "Solved"
      : `${remainingPieces} left · ${completionPercent}%`
  const completionClassName = solved
    ? "jigsaw-room__completion jigsaw-room__completion--solved"
    : "jigsaw-room__completion"
  const canQuickSolve = import.meta.env.DEV
  const roomStyle = createRoomBackgroundStyle(
    roomBackgroundColor
  ) as React.CSSProperties

  function applyRoomBackground(
    color: string,
    { syncScene = true }: { syncScene?: boolean } = {}
  ): void {
    setRoomBackgroundColor(color)

    const root = roomRef.current

    if (!root) {
      return
    }

    setRoomBackgroundStyle(root, color)

    if (syncScene) {
      runtimeRef.current?.refreshTheme()
    }
  }

  function changeRoomBackground(
    event: React.ChangeEvent<HTMLInputElement>
  ): void {
    const color = normalizeHexColor(event.target.value)

    if (!color) {
      return
    }

    applyRoomBackground(color)
    saveStoredRoomBackground(activeRoomId, color)
  }

  function applyRoomTimer(timer: JigsawRoomTimer): void {
    roomTimerRef.current = timer
    setRoomTimer(timer)
    setTimerNow(readCurrentTimeMs())
  }

  function applyJigsawSession(session: JigsawSession): void {
    saveLocalJigsawSession(session)
    sessionRef.current = session
    playerRef.current = session.player
    setPlayerId(session.player.id)
    setPlayerName(session.player.name)
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

      if (authSession) {
        const refreshed = await fetchAuthMe(authSession.token)

        setAuthSession(refreshed)
      }

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
      setAuthStatus("confirm in tg widget")
      return
    }

    setAuthStatus("tg webapp login...")

    try {
      const session = await loginTelegramWebApp(sessionRef.current.token)
      const history = await fetchJigsawHistory(session.token)

      setAuthSession(session)
      setHistoryCount(history.length)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    }
  }

  async function loginWithTelegramWidget(
    payload: Record<string, unknown>
  ): Promise<void> {
    setAuthStatus("tg widget login...")

    try {
      const session = await loginTelegramWidget(
        payload,
        sessionRef.current.token
      )
      const history = await fetchJigsawHistory(session.token)

      setAuthSession(session)
      setHistoryCount(history.length)
      setTelegramWidgetVisible(false)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    }
  }

  function handleServerMessage(message: ServerToClientMessage): void {
    const runtime = runtimeRef.current

    runtime?.applyServerMessage(message)

    if (message.type === "cursor:moved") {
      return
    }

    if (message.type === "cursor:hidden") {
      return
    }

    if (message.type === "session:paused") {
      applyRoomTimer(message.timer)
      multiplayerRef.current?.requestState()
      return
    }

    if (message.type === "session:resumed") {
      applyRoomTimer(message.timer)
      return
    }

    if (message.type === "room:state") {
      setRoomStatus("")
      applyRoomTimer(message.state.timer)
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
      return
    }

    if (message.type === "player:updated") {
      if (message.player.id === playerRef.current.id) {
        applyJigsawSession({
          ...sessionRef.current,
          player: message.player,
          updatedAt: readCurrentTimeMs(),
        })
      }

      return
    }

    if (message.type === "player:left") {
      return
    }

    if (message.type === "room:pinged") {
      return
    }

    if (message.type === "chat:message") {
      setChatMessages((current) => {
        if (current.some((item) => item.id === message.message.id)) {
          return current
        }

        return [...current, message.message].slice(-CHAT_MESSAGE_HISTORY_LIMIT)
      })
      return
    }

    if (message.type === "group:locked") {
      return
    }

    if (message.type === "group:unlocked") {
      return
    }

    if (message.type === "room:lock-updated") {
      return
    }

    if (message.type === "room:lock-rejected") {
      return
    }

    if (message.type === "group:moved") {
      return
    }

    if (message.type === "groups:merged" || message.type === "pieces:placed") {
      return
    }

    if (message.type === "groups:arranged") {
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
        multiplayerRef.current?.requestState()
        return
      }

      multiplayerRef.current?.requestState()
    }
  }

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage
  })

  function toggleSessionPause(): void {
    const connection = multiplayerRef.current

    if (!connection?.isConnected()) {
      return
    }

    connection.send({
      type: roomTimerRef.current.paused ? "session:resume" : "session:pause",
    })
  }

  useEffect(() => {
    toggleSessionPauseRef.current = toggleSessionPause
  })

  function togglePreview(): void {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    setPreviewVisible((current) => {
      const next = !current
      runtime.setPreviewVisible(next)
      return next
    })
  }

  function sendChatMessage(text: string): boolean {
    const connection = multiplayerRef.current

    if (!connection?.isConnected()) {
      return false
    }

    const cursor = runtimeRef.current?.getCursorPosition()

    connection.send({
      type: "chat:send",
      text,
      ...(cursor ?? {}),
    })
    return true
  }

  function highlightAllPieces(): void {
    runtimeRef.current?.highlightPieces()
  }

  function quickSolveDevRoom(): void {
    const runtime = runtimeRef.current

    if (!runtime || !canQuickSolve) {
      return
    }

    runtime.quickSolve()
  }

  function arrangePieces(mode: ArrangeLoosePiecesMode): void {
    const runtime = runtimeRef.current

    if (!runtime || !ready || roomTimer.paused) {
      return
    }

    runtime.arrangePieces(mode)
  }

  function zoomInView(): void {
    runtimeRef.current?.changeZoom("in")
  }

  function zoomOutView(): void {
    runtimeRef.current?.changeZoom("out")
  }

  function resetViewZoom(): void {
    runtimeRef.current?.changeZoom("fit")
  }

  function closeSolvedResults(): void {
    setSolvedResultsOpen(false)
    setSolvedResultsExpanded(false)
    setShowSolvedFireworks(false)

    if (resultsRevealTimerRef.current !== null) {
      window.clearTimeout(resultsRevealTimerRef.current)
      resultsRevealTimerRef.current = null
    }

    if (solvedFireworksTimerRef.current !== null) {
      window.clearTimeout(solvedFireworksTimerRef.current)
      solvedFireworksTimerRef.current = null
    }
  }

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
      setSolvedResultsOpen(false)
      setSolvedResultsExpanded(false)
      setShowSolvedFireworks(false)
      setCompletionResult(null)
      setChatMessages([])
      solvedAnnouncedRef.current = false

      if (resultsRevealTimerRef.current !== null) {
        window.clearTimeout(resultsRevealTimerRef.current)
        resultsRevealTimerRef.current = null
      }

      if (solvedFireworksTimerRef.current !== null) {
        window.clearTimeout(solvedFireworksTimerRef.current)
        solvedFireworksTimerRef.current = null
      }

      setRoomStatus(roomId ? "Loading room..." : "Invite link required")

      if (!roomId) {
        setConnectionStatus("unavailable")
        return
      }

      try {
        if (disposed) {
          return
        }

        let activeSession = sessionRef.current

        setSessionStatus("restoring")
        setSessionMessage("")

        try {
          activeSession = await restoreJigsawSession(activeSession, roomId)

          if (disposed) {
            return
          }

          applyJigsawSession(activeSession)
          setSessionStatus("saved")
        } catch (error) {
          if (disposed) {
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
            if (!isLocalDevRoom()) {
              throw error
            }

            setSessionStatus("offline")
            setSessionMessage("Local test room")
          }
        }

        if (disposed) {
          return
        }

        if (initialSnapshot) {
          applyRoomTimer(initialSnapshot.timer)
        }

        const start = await createJigsawRoomCanvas({
          host: bootHost,
          themeRoot: roomRef.current ?? bootHost,
          imageUrl: initialSnapshot?.jigsaw.imageUrl ?? JIGSAW_IMAGE_URL,
          fallbackConfig: ACTIVE_JIGSAW_CONFIG,
          snapshot: initialSnapshot,
          isCancelled() {
            return disposed
          },
          getPlayer() {
            return playerRef.current
          },
          isPaused() {
            return roomTimerRef.current.paused
          },
          isConnected() {
            return multiplayerRef.current?.isConnected() ?? false
          },
          send(message) {
            multiplayerRef.current?.send(message)
          },
          prepareTheme(averageLuminance) {
            const autoBackground = getAutoRoomBackground(averageLuminance)
            const nextBackground =
              readStoredRoomBackground(activeRoomId) ?? autoBackground

            applyRoomBackground(nextBackground, { syncScene: false })
          },
          onStats: setStats,
          onHighlightChange: setPiecesHighlighted,
          onCanvasPointerDown() {
            if (settingsRef.current?.open) {
              settingsRef.current.open = false
            }
          },
        })

        if (disposed) {
          start.canvas.destroy()
          return
        }

        runtimeRef.current = start.canvas

        cleanup = () => {
          multiplayerRef.current?.destroy()
          multiplayerRef.current = null

          if (runtimeRef.current === start.canvas) {
            runtimeRef.current = null
          }

          start.canvas.destroy()
        }

        multiplayerRef.current = createJigsawMultiplayerClient({
          roomId: activeRoomId,
          sessionToken: activeSession.token,
          onStatus: setConnectionStatus,
          onMessage(message) {
            handleServerMessageRef.current(message)
          },
        })

        setReady(true)
        setRoomStatus("")

        if (
          start.initialStats.totalPieces > 0 &&
          start.initialStats.placedPieces >= start.initialStats.totalPieces
        ) {
          solvedAnnouncedRef.current = true
        }
      } catch (error) {
        cleanup()

        if (!disposed) {
          setReady(false)
          setConnectionStatus("unavailable")
          setRoomStatus(
            error instanceof Error ? error.message : "Failed to start room"
          )
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
    setTimerNow(readCurrentTimeMs())
    setSolvedResultsOpen(true)
    setSolvedResultsExpanded(false)
    setShowSolvedFireworks(true)

    if (resultsRevealTimerRef.current !== null) {
      window.clearTimeout(resultsRevealTimerRef.current)
    }

    if (solvedFireworksTimerRef.current !== null) {
      window.clearTimeout(solvedFireworksTimerRef.current)
    }

    resultsRevealTimerRef.current = window.setTimeout(() => {
      setSolvedResultsExpanded(true)
      resultsRevealTimerRef.current = null
    }, RESULTS_REVEAL_DELAY_MS)

    solvedFireworksTimerRef.current = window.setTimeout(() => {
      setShowSolvedFireworks(false)
      solvedFireworksTimerRef.current = null
    }, SOLVED_FIREWORKS_MS)
  }, [solved])

  useEffect(() => {
    if (!solved || !activeRoomId || !solvedResultsOpen || completionResult) {
      return
    }

    let disposed = false

    void fetchCompletionResult(activeRoomId, () => disposed).then((result) => {
      if (!disposed) {
        setCompletionResult(result)
      }
    })

    return () => {
      disposed = true
    }
  }, [activeRoomId, completionResult, solved, solvedResultsOpen])

  useEffect(() => {
    return () => {
      if (resultsRevealTimerRef.current !== null) {
        window.clearTimeout(resultsRevealTimerRef.current)
      }

      if (solvedFireworksTimerRef.current !== null) {
        window.clearTimeout(solvedFireworksTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (solved) return

    const interval = window.setInterval(() => {
      setTimerNow(Date.now())
    }, 500)

    return () => {
      window.clearInterval(interval)
    }
  }, [solved])

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
        setAuthStatus("tg session restored")
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
      if (event.key === "Escape" && settingsRef.current?.open) {
        event.preventDefault()
        settingsRef.current.open = false
        return
      }

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

  return (
    <div ref={roomRef} className="jigsaw-room" style={roomStyle}>
      <div ref={mountRef} className="jigsaw-room__stage" />

      <div
        className="jigsaw-room__toolbar corner-brackets"
        aria-label="Jigsaw room controls"
      >
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
          <details className="jigsaw-room__arrange">
            <summary>Arrange</summary>
            <div className="jigsaw-room__arrange-panel corner-brackets">
              {ARRANGE_MODES.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(event) => {
                    arrangePieces(mode)
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open")
                  }}
                  disabled={!ready || roomTimer.paused}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
          {canQuickSolve ? (
            <button type="button" onClick={quickSolveDevRoom} disabled={!ready}>
              Solve
            </button>
          ) : null}
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
          <button
            type="button"
            onClick={() => {
              window.location.href = "/profile"
            }}
          >
            Profile
          </button>
          <details ref={settingsRef} className="jigsaw-room__settings">
            <summary>Settings</summary>
            <form
              className="jigsaw-room__settings-panel corner-brackets"
              aria-label="Player and room settings"
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
              <label>
                <span>Player color</span>
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
              <label>
                <span>Background</span>
                <input
                  type="color"
                  value={roomBackgroundColor}
                  aria-label="Room background color"
                  onChange={changeRoomBackground}
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
                {sessionStatus === "saving" ? "Saving" : "Save profile"}
              </button>
              <button
                type="button"
                disabled={sessionStatus === "restoring"}
                onClick={() => void loginWithTelegram()}
              >
                {authSession ? "tg linked" : "tg login"}
              </button>
              <p>
                {getSessionStatusText(sessionStatus, sessionMessage)}.{" "}
                {authStatus}
                {historyCount === null ? "" : `. Solved ${historyCount}`}
              </p>
              {telegramWidgetVisible ? (
                <div
                  ref={telegramWidgetRef}
                  className="jigsaw-room__telegram-widget"
                />
              ) : null}
            </form>
          </details>
        </div>
      </div>

      {roomTimer.paused ? (
        <div className="jigsaw-room__pause-banner">
          Paused
          {roomTimer.pausedByPlayerName
            ? ` by ${roomTimer.pausedByPlayerName}`
            : ""}
        </div>
      ) : null}

      <RoomChatWidget
        messages={chatMessages}
        ownPlayerId={playerId}
        connected={connectionStatus === "connected"}
        onSend={sendChatMessage}
      />

      {solvedResultsOpen ? (
        <div
          className={
            solvedResultsExpanded
              ? "jigsaw-room__solved-celebration jigsaw-room__solved-celebration--results"
              : "jigsaw-room__solved-celebration"
          }
          role={solvedResultsExpanded ? "dialog" : "status"}
          aria-live="polite"
          aria-modal={solvedResultsExpanded ? "true" : undefined}
          aria-labelledby="solved-room-title"
        >
          <div className="jigsaw-room__fireworks" aria-hidden="true">
            {fireworkBursts.map((burst, i) => (
              <span
                key={i}
                style={
                  {
                    top: `${burst.top}%`,
                    left: `${burst.left}%`,
                    "--size": `${burst.size}px`,
                    animationDelay: `${burst.delay}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <SolvedRoomResults
            roomId={activeRoomId}
            result={completionResult}
            fallbackElapsedMs={elapsedMs}
            currentPlayerId={playerId}
            currentUserId={authSession?.user.id}
            currentPlayerName={playerName}
            expanded={solvedResultsExpanded}
            onClose={closeSolvedResults}
          />
        </div>
      ) : null}

      {!ready && (
        <div className="jigsaw-room__loading">
          <span className="jigsaw-room__spinner" aria-hidden="true" />
          {roomStatus}
        </div>
      )}
    </div>
  )
}

async function fetchCompletionResult(
  roomId: string,
  isCancelled: () => boolean
): Promise<JigsawRoomResult | null> {
  while (!isCancelled()) {
    try {
      const result = await fetchJigsawRoomResult(roomId)

      if (result.summary) return result
    } catch {
      // Completion reaches the client before finalization can commit the result.
    }

    await wait(RESULT_FETCH_RETRY_MS)
  }

  return null
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs))
}

function getSessionStatusText(
  status: JigsawSessionStatus,
  message: string
): string {
  if (message && (status === "error" || status === "offline")) {
    return message
  }

  if (status === "restoring") {
    return "restoring session"
  }

  if (status === "saving") {
    return "saving profile"
  }

  if (status === "saved") {
    return "session saved"
  }

  if (status === "offline") {
    return "local session"
  }

  if (status === "error") {
    return "session error"
  }

  return "local profile"
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Session unavailable"
}

function isLocalDevRoom(): boolean {
  return import.meta.env.DEV
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

function getAutoRoomBackground(averageLuminance: number | null): string {
  if (averageLuminance === null) {
    return LIGHT_ROOM_BACKGROUND
  }

  return averageLuminance >= DARK_BACKGROUND_MIN_IMAGE_LUMINANCE
    ? DARK_ROOM_BACKGROUND
    : LIGHT_ROOM_BACKGROUND
}

function readStoredRoomBackground(roomId: string): string | null {
  if (!roomId) {
    return null
  }

  try {
    return normalizeHexColor(
      window.localStorage.getItem(`${ROOM_BACKGROUND_STORAGE_PREFIX}${roomId}`)
    )
  } catch {
    return null
  }
}

function saveStoredRoomBackground(roomId: string, color: string): void {
  if (!roomId) {
    return
  }

  try {
    window.localStorage.setItem(
      `${ROOM_BACKGROUND_STORAGE_PREFIX}${roomId}`,
      color
    )
  } catch {
    // Local preference only; ignore blocked storage.
  }
}

function setRoomBackgroundStyle(root: HTMLElement, color: string): void {
  const styles = createRoomBackgroundStyle(color)

  for (const [property, value] of Object.entries(styles)) {
    root.style.setProperty(property, value)
  }
}

function createRoomBackgroundStyle(color: string): Record<string, string> {
  const isLight = getHexLuminance(color) > 0.52
  const contrast = isLight ? "#000000" : "#ffffff"

  return {
    "--jigsaw-room-bg": color,
    "--jigsaw-pixi-board-fill": mixHexColors(color, contrast, 0.08),
    "--jigsaw-pixi-board-stroke": mixHexColors(color, contrast, 0.24),
    "--jigsaw-pixi-board-grid": mixHexColors(color, contrast, 0.16),
    "--jigsaw-pixi-preview-overlay": contrast,
    "--jigsaw-pixi-preview-overlay-alpha": isLight ? "0.18" : "0.12",
    "--jigsaw-pixi-piece-highlight": isLight
      ? LIGHT_ROOM_PIECE_HIGHLIGHT
      : DARK_ROOM_PIECE_HIGHLIGHT,
  }
}

function normalizeHexColor(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i)

  if (shortHex) {
    return `#${shortHex[1]
      .split("")
      .map((digit) => `${digit}${digit}`)
      .join("")}`.toLowerCase()
  }

  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : null
}

function mixHexColors(base: string, overlay: string, amount: number): string {
  const baseRgb = hexToRgb(base)
  const overlayRgb = hexToRgb(overlay)

  return rgbToHex({
    red: baseRgb.red + (overlayRgb.red - baseRgb.red) * amount,
    green: baseRgb.green + (overlayRgb.green - baseRgb.green) * amount,
    blue: baseRgb.blue + (overlayRgb.blue - baseRgb.blue) * amount,
  })
}

function getHexLuminance(color: string): number {
  const { red, green, blue } = hexToRgb(color)

  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function hexToRgb(color: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(color) ?? LIGHT_ROOM_BACKGROUND
  const value = Number.parseInt(normalized.slice(1), 16)

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }
}

function rgbToHex({
  red,
  green,
  blue,
}: {
  red: number
  green: number
  blue: number
}): string {
  return `#${[red, green, blue]
    .map((channel) => {
      const normalized = Math.min(255, Math.max(0, Math.round(channel)))

      return normalized.toString(16).padStart(2, "0")
    })
    .join("")}`
}

export default RoomPage
