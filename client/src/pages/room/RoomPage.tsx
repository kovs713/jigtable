import { useEffect, useRef, useState, useSyncExternalStore } from "react"

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
import { RoomChatWidget } from "./RoomChatWidget"
import { SolvedRoomResults } from "./SolvedRoomResults"
import { enterRoomVisit } from "./room-visit-browser"
import type {
  RoomVisit,
  RoomVisitSessionStatus,
  RoomVisitState,
} from "./room-visit"
import { formatElapsedTime } from "./timer"

import "@/features/room/room.css"
import "./room-page.css"

const RESULTS_REVEAL_DELAY_MS = 2_500
const SOLVED_FIREWORKS_MS = 12_000
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

interface JigsawRoomAppProps {
  roomId?: string
}

const EMPTY_STATS = {
  totalPieces: 0,
  placedPieces: 0,
  groupsCount: 0,
  snapCount: 0,
  source: "optimistic" as const,
}

const NO_VISIT_SUBSCRIPTION = () => () => {}
const GET_NO_VISIT = () => null

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

export function RoomPage({ roomId }: JigsawRoomAppProps) {
  const roomRef = useRef<HTMLDivElement | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDetailsElement | null>(null)
  const visitRef = useRef<RoomVisit | null>(null)
  const resultsRevealTimerRef = useRef<number | null>(null)
  const solvedFireworksTimerRef = useRef<number | null>(null)
  const solvedAnnouncedRef = useRef(false)
  const handledProfileSavesRef = useRef(0)
  const activeRoomId = roomId ?? ""
  const [visit, setVisit] = useState<RoomVisit | null>(null)
  const visitState = useRoomVisitState(visit)
  const [solvedResultsOpen, setSolvedResultsOpen] = useState(false)
  const [solvedResultsExpanded, setSolvedResultsExpanded] = useState(false)
  const [showSolvedFireworks, setShowSolvedFireworks] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState("tg login optional")
  const [telegramWidgetVisible, setTelegramWidgetVisible] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)
  const [profileForm, setProfileForm] = useState(() => ({
    name: "",
    color: "#808080",
  }))
  const [roomBackgroundColor, setRoomBackgroundColor] =
    useState(DARK_ROOM_BACKGROUND)
  const ready =
    visitState?.phase.status === "active" ||
    visitState?.phase.status === "degraded"
  const stats = visitState?.stats ?? EMPTY_STATS
  const roomTimer = visitState?.timer ?? {
    elapsedMs: 0,
    paused: false,
    updatedAt: 0,
  }
  const elapsedMs = visitState?.elapsedMs ?? 0
  const solved = visitState?.solved ?? false
  const previewVisible = visitState?.previewVisible ?? false
  const piecesHighlighted = visitState?.piecesHighlighted ?? false
  const connectionStatus = visitState?.connection.status ?? "connecting"
  const sessionStatus = visitState?.session.status ?? "local"
  const sessionMessage = visitState?.session.failure?.message ?? ""
  const currentSession = visitState?.session.value
  const playerId = currentSession?.player.id ?? ""
  const playerName = currentSession?.player.name ?? "Player"
  const completionResult =
    visitState?.result.status === "ready" ? visitState.result.value : null
  const roomStatus = getRoomStatus(visitState, activeRoomId)
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
  const canQuickSolve = visitState?.availability.quickSolve ?? false
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
      visitRef.current?.act({ type: "appearance.refresh" })
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

  function saveProfile(event: React.SubmitEvent<HTMLFormElement>): void {
    event.preventDefault()

    const name = profileForm.name.trim()

    if (!name) {
      return
    }

    visitRef.current?.act({
      type: "player.save",
      profile: {
        name,
        color: profileForm.color,
      },
    })
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
      const playerSession = visitRef.current?.getState().session.value

      if (!playerSession) {
        throw new Error("Player session unavailable")
      }

      const session = await loginTelegramWebApp(playerSession.token)
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
      const playerSession = visitRef.current?.getState().session.value

      if (!playerSession) {
        throw new Error("Player session unavailable")
      }

      const session = await loginTelegramWidget(payload, playerSession.token)
      const history = await fetchJigsawHistory(session.token)

      setAuthSession(session)
      setHistoryCount(history.length)
      setTelegramWidgetVisible(false)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    }
  }

  function toggleSessionPause(): void {
    visitRef.current?.act({ type: "timer.toggle" })
  }

  function togglePreview(): void {
    const current = visitRef.current?.getState()

    if (!current) {
      return
    }

    visitRef.current?.act({
      type: "preview.set",
      visible: !current.previewVisible,
    })
  }

  function sendChatMessage(text: string): boolean {
    return visitRef.current?.act({ type: "chat.send", text }).accepted ?? false
  }

  function highlightAllPieces(): void {
    visitRef.current?.act({ type: "pieces.highlight" })
  }

  function quickSolveDevRoom(): void {
    visitRef.current?.act({ type: "dev.quick-solve" })
  }

  function arrangePieces(mode: ArrangeLoosePiecesMode): void {
    visitRef.current?.act({ type: "pieces.arrange", mode })
  }

  function zoomInView(): void {
    visitRef.current?.act({ type: "view.zoom", action: "in" })
  }

  function zoomOutView(): void {
    visitRef.current?.act({ type: "view.zoom", action: "out" })
  }

  function resetViewZoom(): void {
    visitRef.current?.act({ type: "view.zoom", action: "fit" })
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
    const themeRoot = roomRef.current
    let cancelled = false

    solvedAnnouncedRef.current = false
    handledProfileSavesRef.current = 0

    if (resultsRevealTimerRef.current !== null) {
      window.clearTimeout(resultsRevealTimerRef.current)
      resultsRevealTimerRef.current = null
    }

    if (solvedFireworksTimerRef.current !== null) {
      window.clearTimeout(solvedFireworksTimerRef.current)
      solvedFireworksTimerRef.current = null
    }

    if (!host || !themeRoot) {
      visitRef.current = null
      queueMicrotask(() => {
        if (!cancelled) {
          setVisit(null)
          setSolvedResultsOpen(false)
          setSolvedResultsExpanded(false)
          setShowSolvedFireworks(false)
        }
      })

      return () => {
        cancelled = true
      }
    }

    let nextVisit: RoomVisit | null = null
    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      nextVisit = enterRoomVisit({
        roomId: activeRoomId,
        canvasHost: host,
        themeRoot,
        prepareTheme(averageLuminance) {
          const autoBackground = getAutoRoomBackground(averageLuminance)
          const nextBackground =
            readStoredRoomBackground(activeRoomId) ?? autoBackground

          applyRoomBackground(nextBackground, { syncScene: false })
        },
        onCanvasPointerDown() {
          if (settingsRef.current?.open) {
            settingsRef.current.open = false
          }
        },
      })

      visitRef.current = nextVisit
      setVisit(nextVisit)
      setSolvedResultsOpen(false)
      setSolvedResultsExpanded(false)
      setShowSolvedFireworks(false)
    })

    return () => {
      cancelled = true

      if (nextVisit && visitRef.current === nextVisit) {
        visitRef.current = null
      }

      nextVisit?.leave()
    }
  }, [activeRoomId, roomId])

  useEffect(() => {
    const completionRevision = visitState?.completionRevision ?? 0

    if (!completionRevision) {
      return
    }

    if (solvedAnnouncedRef.current) {
      return
    }

    solvedAnnouncedRef.current = true
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
  }, [visitState?.completionRevision])

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
    const player = currentSession?.player
    let cancelled = false

    if (!player) {
      return
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setProfileForm({ name: player.name, color: player.color })
      }
    })

    return () => {
      cancelled = true
    }
  }, [currentSession?.player])

  useEffect(() => {
    const successfulSaves = visitState?.session.successfulProfileSaves ?? 0

    if (successfulSaves <= handledProfileSavesRef.current) {
      return
    }

    handledProfileSavesRef.current = successfulSaves

    if (!authSession) {
      return
    }

    const authToken = authSession.token
    let disposed = false

    void fetchAuthMe(authToken).then(
      (session) => {
        if (!disposed) {
          setAuthSession(session)
        }
      },
      (error) => {
        if (!disposed) {
          setAuthStatus(readErrorMessage(error))
        }
      }
    )

    return () => {
      disposed = true
    }
  }, [authSession, visitState?.session.successfulProfileSaves])

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

    const callbackName = `onJigsawTelegramAuth_${playerId.replace(/[^a-z0-9]/gi, "")}`
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
  }, [playerId, telegramWidgetVisible])

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
        !visitRef.current?.getState().availability.preview
      ) {
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        toggleSessionPause()
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
            disabled={!visitState?.availability.pause}
            aria-pressed={roomTimer.paused}
          >
            {roomTimer.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={togglePreview}
            disabled={!visitState?.availability.preview}
            aria-pressed={previewVisible}
          >
            {previewVisible ? "Hide Preview" : "Preview"}
          </button>
          <button
            type="button"
            onClick={highlightAllPieces}
            disabled={!visitState?.availability.highlight}
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
                  disabled={!visitState?.availability.arrange}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
          {canQuickSolve ? (
            <button
              type="button"
              onClick={quickSolveDevRoom}
              disabled={!visitState?.availability.quickSolve}
            >
              Solve
            </button>
          ) : null}
          <button
            type="button"
            onClick={zoomOutView}
            disabled={!visitState?.availability.zoom}
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetViewZoom}
            disabled={!visitState?.availability.zoom}
            aria-label="Fit puzzle to screen"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={zoomInView}
            disabled={!visitState?.availability.zoom}
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
                  !visitState?.availability.saveProfile ||
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
        messages={visitState?.chatMessages ?? []}
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

function useRoomVisitState(visit: RoomVisit | null): RoomVisitState | null {
  return useSyncExternalStore(
    visit?.subscribe ?? NO_VISIT_SUBSCRIPTION,
    visit?.getState ?? GET_NO_VISIT,
    GET_NO_VISIT
  )
}

function getRoomStatus(state: RoomVisitState | null, roomId: string): string {
  if (!state) {
    return roomId ? "Starting room..." : "Invite link required"
  }

  if (state.phase.status === "starting") {
    return state.phase.message
  }

  if (state.phase.status === "failed") {
    return state.phase.failure.message
  }

  return ""
}

function getSessionStatusText(
  status: RoomVisitSessionStatus,
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
