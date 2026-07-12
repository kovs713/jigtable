import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import type { CreateJigsawRoomResponse } from "@jigtable/core/protocol"
import { apiRoutes } from "@jigtable/shared/api-routes"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { API_BASE_URL } from "@/config"
import {
  fetchAuthMe,
  fetchJigsawHistory,
  getTelegramBotUsername,
  getTelegramLoginWidgetBlocker,
  hasTelegramWebAppInitData,
  loginDev,
  loginTelegramWebApp,
  loginTelegramWidget,
  readLocalAuthSession,
  saveLocalAuthSession,
  type AuthSession,
  type JigsawHistoryItem,
} from "./multiplayer/auth"
import {
  createJigsawRoomFromComposition,
  fetchUserCompositions,
  type UserCompositionItem,
} from "./room-api"

import "./jigsaw-room-create.css"
import "./jigsaw-room.css"

type CompositionLayoutItem = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
}

type CompositionLayout = {
  canvas: { width: number; height: number }
  items: CompositionLayoutItem[]
}

type DifficultyTier = {
  pieces: number
  label: string
  icon: string
}

const DIFFICULTY_TIERS: DifficultyTier[] = [
  { pieces: 48, label: "изи", icon: "○" },
  { pieces: 100, label: "окэй", icon: "◔" },
  { pieces: 300, label: "крепыш", icon: "◑" },
  { pieces: 600, label: "жеско", icon: "◕" },
  { pieces: 1_000, label: "хард", icon: "⬤" },
  { pieces: 1_500, label: "инсейн", icon: "✦" },
  { pieces: 2_000, label: "ЛЕГЕНДА 💪", icon: "🔥" },
]

// const PRESETS = [48, 100, 300, 600, 1_000, 1_500, 2_000]
const PRESETS = DIFFICULTY_TIERS.map((t) => t.pieces)
const DEV_LOGIN_ENABLED = import.meta.env.DEV

function findActiveTierIndex(pieceCount: number, presets: number[]) {
  const ranges = getPresetRanges(presets)
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (pieceCount >= ranges[i].min) return i
  }
  return 0
}

function getPresetRanges(presets: number[]) {
  return presets.map((value, index) => {
    const prev = index > 0 ? presets[index - 1] : value
    const next = index < presets.length - 1 ? presets[index + 1] : value
    const min = index === 0 ? value : Math.floor((prev + value) / 2) + 1
    const max =
      index === presets.length - 1 ? value : Math.ceil((value + next) / 2)
    return { value, min, max }
  })
}

export function JigsawRoomCreateApp() {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const initialCompositionId = useMemo(() => getInitialCompositionId(), [])
  const initialCompositionToken = useMemo(
    () => getInitialCompositionToken(),
    []
  )
  const hasCompositionParams = Boolean(
    initialCompositionId && initialCompositionToken
  )

  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState(() =>
    readLocalAuthSession() ? "checking tg session..." : "tg login required"
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [widgetVisible, setWidgetVisible] = useState(false)
  const [pieceCount, setPieceCount] = useState(150)
  const [status, setStatus] = useState("choose jigsaw size")
  const [isError, setIsError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdRoom, setCreatedRoom] =
    useState<CreateJigsawRoomResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [compositionPreview, setCompositionPreview] =
    useState<CompositionLayout | null>(null)
  const [compositions, setCompositions] = useState<UserCompositionItem[]>([])
  const [selectedComposition, setSelectedComposition] = useState<{
    compositionId: string
    compositionToken: string
  } | null>(() =>
    initialCompositionId && initialCompositionToken
      ? {
          compositionId: initialCompositionId,
          compositionToken: initialCompositionToken,
        }
      : null
  )
  const [history, setHistory] = useState<JigsawHistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement | null>(null)

  const activeTierIndex = findActiveTierIndex(pieceCount, PRESETS)
  const activeTier = DIFFICULTY_TIERS[activeTierIndex]

  useEffect(() => {
    if (!authSession) return
    let disposed = false

    void fetchJigsawHistory(authSession.token)
      .then((items) => {
        if (!disposed) setHistory(items)
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [authSession])

  useEffect(() => {
    if (!authSession) return
    let disposed = false

    void fetchUserCompositions(authSession.token)
      .then((items) => {
        if (disposed) return
        setCompositions(items)
        if (!selectedComposition && items[0]) {
          setSelectedComposition({
            compositionId: items[0].compositionId,
            compositionToken: items[0].compositionToken,
          })
        }
      })
      .catch((error) => {
        if (!disposed) setStatus(readErrorMessage(error))
      })

    return () => {
      disposed = true
    }
  }, [authSession, selectedComposition])

  useEffect(() => {
    if (!historyOpen) return
    function handleClickOutside(event: PointerEvent) {
      if (
        historyRef.current &&
        !historyRef.current.contains(event.target as Node)
      ) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [historyOpen])

  function selectHistoryItem(item: JigsawHistoryItem) {
    setPieceCount(item.pieceCount)
    setHistoryOpen(false)
    setStatus(`Loaded: ${item.source.label}`)
  }

  function selectComposition(composition: UserCompositionItem): void {
    setSelectedComposition({
      compositionId: composition.compositionId,
      compositionToken: composition.compositionToken,
    })
    setCompositionPreview(null)
    setStatus("Choose jigsaw size")
  }

  useEffect(() => {
    if (!selectedComposition || !authSession) return

    let disposed = false

    void fetch(
      `${API_BASE_URL}${apiRoutes.compositions.get.layout.build(selectedComposition.compositionId)}?token=${encodeURIComponent(selectedComposition.compositionToken)}`,
      { headers: { Authorization: `Bearer ${authSession.token}` } }
    )
      .then((r) => r.json())
      .then((payload: unknown) => {
        if (disposed) return
        const p = payload as { layout?: CompositionLayout }
        if (p?.layout) setCompositionPreview(p.layout)
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [selectedComposition, authSession])

  useEffect(() => {
    const saved = readLocalAuthSession()

    if (!saved) {
      return
    }

    let disposed = false

    void fetchAuthMe(saved.token)
      .then((session) => {
        if (disposed) {
          return
        }

        saveLocalAuthSession(session)
        setAuthSession(session)
        setAuthStatus("tg session restored")
      })
      .catch((error) => {
        if (!disposed) {
          setAuthSession(null)
          setAuthStatus(readErrorMessage(error))
        }
      })
      .finally(() => {
        if (!disposed) {
          setAuthLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [])

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

      setWidgetVisible(true)
      setAuthStatus("confirm in tg widget")
      return
    }

    setAuthLoading(true)
    setAuthStatus("tg webapp login...")

    try {
      const session = await loginTelegramWebApp()

      setAuthSession(session)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function loginWithTelegramWidget(
    payload: Record<string, unknown>
  ): Promise<void> {
    setAuthLoading(true)
    setAuthStatus("tg widget login...")

    try {
      const session = await loginTelegramWidget(payload)

      setAuthSession(session)
      setWidgetVisible(false)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function loginWithDev(): Promise<void> {
    setAuthLoading(true)
    setAuthStatus("dev login...")

    try {
      const session = await loginDev()

      saveLocalAuthSession(session)
      setAuthSession(session)
      setAuthStatus("dev session active")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    const host = widgetRef.current
    const botUsername = getTelegramBotUsername()

    if (!widgetVisible || !host || !botUsername) {
      return
    }

    const callbackName = "onJigsawCreateTelegramAuth"
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
  }, [widgetVisible])

  async function createRoom(): Promise<void> {
    if (!authSession) {
      setStatus("tg login required")
      setIsError(true)
      return
    }

    const compositionId = selectedComposition?.compositionId
    const compositionToken = selectedComposition?.compositionToken

    if (!compositionId || !compositionToken) {
      setStatus("choose a build first")
      setIsError(true)
      return
    }

    setCreating(true)
    setStatus("rendering and creating room...")
    setIsError(false)

    try {
      const payload = await createJigsawRoomFromComposition(
        compositionId,
        compositionToken,
        pieceCount,
        authSession.token
      )

      setCreatedRoom(payload)
      setStatus("room ready")
      window.history.replaceState(
        null,
        "",
        `/rooms/new?roomId=${encodeURIComponent(payload.roomId)}`
      )
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to create room"
      )
      setIsError(true)
    } finally {
      setCreating(false)
    }
  }

  async function copyLink(): Promise<void> {
    if (!createdRoom) return

    try {
      await navigator.clipboard.writeText(createdRoom.joinUrl)
      setCopied(true)
      setStatus("link copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setStatus("failed to copy link")
      setIsError(true)
    }
  }

  const selectedCompositionInfo = selectedComposition
    ? compositions.find(
        (composition) =>
          composition.compositionId === selectedComposition.compositionId
      )
    : null
  const selectedCompositionView = selectedCompositionInfo ?? null

  return (
    <main className="jigsaw-room jigsaw-room--create">
      <section className="jigsaw-room__create-panel corner-brackets">
        <div className="jigsaw-room__create-copy">
          <p className="jigsaw-room__create-kicker">Multiplayer jigsaw</p>
          <h1>create room</h1>
          <p>
            pick a jigsaw size, create a temporary room, then share the invite
            link. friends join as guests.
          </p>
          <div className="jigsaw-room__share-actions">
            <Button
              size="sm"
              type="button"
              variant={authSession ? "outline" : "default"}
              disabled={authLoading}
              onClick={() => void loginWithTelegram()}
            >
              {authLoading
                ? "Loading..."
                : authSession
                  ? "tg linked"
                  : "tg login"}
            </Button>
            {DEV_LOGIN_ENABLED ? (
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={authLoading}
                onClick={() => void loginWithDev()}
              >
                dev login
              </Button>
            ) : null}
            <span className="jigsaw-room__create-status" role="status">
              {authStatus}
            </span>
          </div>
          {widgetVisible ? (
            <div ref={widgetRef} className="jigsaw-room__telegram-widget" />
          ) : null}
        </div>

        <div className="jigsaw-room__create-form">
          {selectedComposition ? (
            <div className="jigsaw-room__input-group">
              <span>Build</span>
              <Select
                value={selectedComposition.compositionId}
                onValueChange={(value) => {
                  const composition = compositions.find(
                    (item) => item.compositionId === value
                  )
                  if (composition) selectComposition(composition)
                }}
              >
                <SelectTrigger className="jigsaw-room__build-select-trigger">
                  <SelectValue>
                    {formatCompositionTitle(selectedCompositionView)} ·{" "}
                    {formatCompositionMeta(selectedCompositionView)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="jigsaw-room__build-select-content">
                  {compositions.map((composition, index) => (
                    <SelectItem
                      key={composition.compositionId}
                      value={composition.compositionId}
                    >
                      {String(index + 1).padStart(2, "0")} ·{" "}
                      {composition.imageCount} images ·{" "}
                      {formatCompositionMeta(composition)}
                    </SelectItem>
                  ))}
                  {!compositions.length ? (
                    <SelectItem
                      value={selectedComposition.compositionId}
                      disabled
                    >
                      no other builds found
                    </SelectItem>
                  ) : null}
                  {hasCompositionParams &&
                  !compositions.some(
                    (composition) =>
                      composition.compositionId ===
                      selectedComposition.compositionId
                  ) ? (
                    <SelectItem value={selectedComposition.compositionId}>
                      Current composition · Opened from bot link
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <div className="jigsaw-room__image-preview">
                {compositionPreview ? (
                  <CompositionCanvasPreview layout={compositionPreview} />
                ) : (
                  <div className="jigsaw-room__image-placeholder">
                    <span>Loading preview…</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="jigsaw-room__input-group">
              {history.length > 0 && (
                <div className="jigsaw-room__input-group" ref={historyRef}>
                  <span>Saved builds</span>
                  <div className="jigsaw-room__history-selector">
                    <button
                      type="button"
                      className="jigsaw-room__history-trigger"
                      onClick={() => setHistoryOpen(!historyOpen)}
                    >
                      {history.length} saved build
                      {history.length !== 1 ? "s" : ""}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M3 5l3 3 3-3" />
                      </svg>
                    </button>
                    {historyOpen && (
                      <div className="jigsaw-room__history-dropdown corner-brackets">
                        {history.slice(0, 10).map((item) => (
                          <button
                            key={item.roomId}
                            type="button"
                            className="jigsaw-room__history-option"
                            onClick={() => selectHistoryItem(item)}
                          >
                            <span className="jigsaw-room__history-option-label">
                              {item.source.label}
                            </span>
                            <span className="jigsaw-room__history-option-meta">
                              {item.pieceCount}p · {item.source.kind}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="jigsaw-room__image-preview">
                <div className="jigsaw-room__image-placeholder">
                  <span>no saved builds yet. create one in the bot first.</span>
                </div>
              </div>
            </div>
          )}

          <label className="jigsaw-room__slider-group">
            <span>Pieces</span>
            <output
              className="jigsaw-room__slider-value"
              data-tier={activeTierIndex}
            >
              <span className="jigsaw-room__tier-icon">{activeTier.icon}</span>
              <span className="jigsaw-room__tier-label">
                {activeTier.label}
              </span>
              <span className="jigsaw-room__tier-count">
                {pieceCount.toLocaleString()} pcs
              </span>
            </output>
            <div className="jigsaw-room__presets" role="radiogroup">
              {DIFFICULTY_TIERS.map((tier, index) => {
                const isActive = activeTierIndex === index
                return (
                  <button
                    key={tier.pieces}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    data-tier={index}
                    className={isActive ? "is-active" : ""}
                    title={`${tier.pieces.toLocaleString()} деталей`}
                    onClick={() => setPieceCount(tier.pieces)}
                  >
                    <span className="jigsaw-room__preset-icon">
                      {tier.icon}
                    </span>
                    <span className="jigsaw-room__preset-label">
                      {tier.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <Slider
              ariaLabel="Pieces"
              className="jigsaw-room__slider"
              max={2_000}
              min={48}
              step={1}
              value={pieceCount}
              onChange={setPieceCount}
            />
          </label>

          <Button
            className="jigsaw-room__submit-btn"
            disabled={creating || !selectedComposition || !authSession}
            onClick={() => void createRoom()}
          >
            {creating && (
              <span className="jigsaw-room__spinner" aria-hidden="true" />
            )}
            {creating
              ? "creating..."
              : authSession
                ? "create room"
                : "login required"}
          </Button>

          <p
            className={`jigsaw-room__create-status ${isError ? "jigsaw-room__create-status--error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
        </div>

        {createdRoom && (
          <div
            className="jigsaw-room__share-box"
            role="region"
            aria-label="room sharing"
          >
            <div className="jigsaw-room__share-header">
              <span>Share link</span>
              <p>{createdRoom.state.stats.totalPieces} pieces generated</p>
            </div>
            <code>{createdRoom.joinUrl}</code>
            <div className="jigsaw-room__share-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyLink()}
              >
                {copied ? "✓ copied!" : "copy link"}
              </Button>
              <Button asChild size="sm">
                <a href={`/rooms/${createdRoom.roomId}`}>open room</a>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "tg login failed"
}

function getInitialCompositionId(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("compositionId")?.trim() || null
}

function getInitialCompositionToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("compositionToken")?.trim() || null
}

function formatCompositionDate(value: string | null): string {
  if (!value) return "no date"

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatCompositionTitle(
  composition: UserCompositionItem | null
): string {
  if (!composition) return "Current composition"

  return `${composition.imageCount} images`
}

function formatCompositionMeta(
  composition: UserCompositionItem | null
): string {
  if (!composition) return "Opened from bot link"

  const canvas = composition.canvas
    ? `${Math.round(composition.canvas.width)}x${Math.round(composition.canvas.height)}`
    : "canvas pending"

  return `${canvas} · ${formatCompositionDate(composition.createdAt)}`
}

function CompositionCanvasPreview({ layout }: { layout: CompositionLayout }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = layout.canvas.width
    canvas.height = layout.canvas.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const dataUrl = () => canvas.toDataURL()
    let pending = layout.items.length
    if (pending === 0) {
      setSrc(dataUrl())
      return
    }

    function onDone() {
      pending--
      if (pending <= 0) {
        setSrc(dataUrl())
      }
    }

    for (const item of layout.items) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        ctx.drawImage(img, item.x, item.y, item.width, item.height)
        onDone()
      }
      img.onerror = onDone
      img.src = item.src
    }
  }, [layout])

  return (
    <>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {src ? (
        <img src={src} alt="Canvas preview" />
      ) : (
        <div className="jigsaw-room__image-placeholder">
          <span>Loading…</span>
        </div>
      )}
    </>
  )
}

export default JigsawRoomCreateApp
