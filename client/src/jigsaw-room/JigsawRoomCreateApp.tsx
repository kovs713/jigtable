import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import type { CreateJigsawRoomResponse } from "@jigtable/jigsaw-core/multiplayer/protocol"
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
import { API_BASE_URL } from "@/config"
import { createJigsawRoom, createJigsawRoomFromBatch } from "./room-api"

import "./jigsaw-room.css"
import "./jigsaw-room-create.css"

type BatchLayoutItem = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
}

type BatchLayout = {
  canvas: { width: number; height: number }
  items: BatchLayoutItem[]
}

const DEFAULT_IMAGE_URL = "/test_jigsaw.png"
const PRESETS = [48, 100, 300, 600, 1_000, 1_500, 2_000]
const DEV_LOGIN_ENABLED = import.meta.env.DEV

function getPresetRanges(presets: number[]) {
  return presets.map((value, index) => {
    const prev = index > 0 ? presets[index - 1] : value
    const next = index < presets.length - 1 ? presets[index + 1] : value
    const min = index === 0 ? value : Math.floor((prev + value) / 2) + 1
    const max = index === presets.length - 1 ? value : Math.ceil((value + next) / 2)
    return { value, min, max }
  })
}

function findActivePreset(pieceCount: number, presets: number[]) {
  const ranges = getPresetRanges(presets)
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (pieceCount >= ranges[i].min) {
      return ranges[i].value
    }
  }
  return presets[0]
}

export function JigsawRoomCreateApp() {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const initialImageUrl = useMemo(() => getInitialImageUrl(), [])
  const initialSourceSize = useMemo(() => getInitialSourceSize(), [])
  const initialBatchId = useMemo(() => getInitialBatchId(), [])
  const initialBatchToken = useMemo(() => getInitialBatchToken(), [])
  const hasBatchParams = Boolean(initialBatchId && initialBatchToken)

  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState(() =>
    readLocalAuthSession()
      ? "Checking Telegram session..."
      : "Telegram login required"
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [widgetVisible, setWidgetVisible] = useState(false)
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [pieceCount, setPieceCount] = useState(150)
  const [status, setStatus] = useState("Choose jigsaw size")
  const [isError, setIsError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdRoom, setCreatedRoom] =
    useState<CreateJigsawRoomResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [imgValid, setImgValid] = useState(true)
  const [batchPreview, setBatchPreview] = useState<BatchLayout | null>(null)
  const [history, setHistory] = useState<JigsawHistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!authSession) return
    let disposed = false

    void fetchJigsawHistory(authSession.token)
      .then((items) => {
        if (!disposed) setHistory(items)
      })
      .catch(() => {})

    return () => { disposed = true }
  }, [authSession])

  useEffect(() => {
    if (!historyOpen) return
    function handleClickOutside(event: PointerEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [historyOpen])

  function selectHistoryItem(item: JigsawHistoryItem) {
    setPieceCount(item.pieceCount)
    if (item.source.kind === "batch_render" && item.source.label) {
      setImageUrl(item.source.label)
    }
    setHistoryOpen(false)
    setStatus(`Loaded: ${item.source.label}`)
  }

  useEffect(() => {
    if (!initialBatchId || !initialBatchToken || !authSession) return

    let disposed = false

    void fetch(
      `${API_BASE_URL}/api/batches/${initialBatchId}/layout?token=${encodeURIComponent(initialBatchToken)}`,
      { headers: { Authorization: `Bearer ${authSession.token}` } }
    )
      .then((r) => r.json())
      .then((payload: unknown) => {
        if (disposed) return
        const p = payload as { layout?: BatchLayout }
        if (p?.layout) setBatchPreview(p.layout)
      })
      .catch(() => {})

    return () => { disposed = true }
  }, [initialBatchId, initialBatchToken, authSession])

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
        setAuthStatus("Telegram session restored")
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
      setAuthStatus("Confirm in Telegram widget")
      return
    }

    setAuthLoading(true)
    setAuthStatus("Telegram WebApp login...")

    try {
      const session = await loginTelegramWebApp()

      setAuthSession(session)
      setAuthStatus("Telegram linked")
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
    setAuthStatus("Telegram widget login...")

    try {
      const session = await loginTelegramWidget(payload)

      setAuthSession(session)
      setWidgetVisible(false)
      setAuthStatus("Telegram linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function loginWithDev(): Promise<void> {
    setAuthLoading(true)
    setAuthStatus("Dev login...")

    try {
      const session = await loginDev()

      saveLocalAuthSession(session)
      setAuthSession(session)
      setAuthStatus("Dev session active")
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
      setStatus("Telegram login required")
      setIsError(true)
      return
    }

    const batchId = getInitialBatchId()
    const batchToken = getInitialBatchToken()

    if (!batchId || !batchToken) {
      const trimmedImageUrl = imageUrl.trim()

      if (!trimmedImageUrl) {
        setStatus("Image URL is required")
        setIsError(true)
        return
      }

      setCreating(true)
      setStatus("Creating room...")
      setIsError(false)

      try {
        const sourceSize =
          trimmedImageUrl === initialImageUrl ? initialSourceSize : null
        const payload = await createJigsawRoom(
          {
            imageUrl: trimmedImageUrl,
            pieceCount,
            sourceWidth: sourceSize?.width,
            sourceHeight: sourceSize?.height,
          },
          authSession.token
        )

        setCreatedRoom(payload)
        setStatus("Room ready")
        window.history.replaceState(
          null,
          "",
          `/jigsaw/new?roomId=${encodeURIComponent(payload.roomId)}`
        )
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to create room"
        )
        setIsError(true)
      } finally {
        setCreating(false)
      }
      return
    }

    setCreating(true)
    setStatus("Rendering and creating room...")
    setIsError(false)

    try {
      const payload = await createJigsawRoomFromBatch(
        batchId,
        batchToken,
        pieceCount,
        authSession.token
      )

      setCreatedRoom(payload)
      setStatus("Room ready")
      window.history.replaceState(
        null,
        "",
        `/jigsaw/new?roomId=${encodeURIComponent(payload.roomId)}`
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
      setStatus("Link copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setStatus("Failed to copy link")
      setIsError(true)
    }
  }

  return (
    <main className="jigsaw-room jigsaw-room--create">
      <section className="jigsaw-room__create-panel corner-brackets">
        <div className="jigsaw-room__create-copy">
          <p className="jigsaw-room__create-kicker">Multiplayer jigsaw</p>
          <h1>Create room</h1>
          <p>
            Pick a jigsaw size, create a temporary room, then share the invite
            link. Friends join as guests.
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
                  ? "TG linked"
                  : "Telegram login"}
            </Button>
            {DEV_LOGIN_ENABLED ? (
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={authLoading}
                onClick={() => void loginWithDev()}
              >
                Dev login
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
          {hasBatchParams ? (
            <div className="jigsaw-room__input-group">
              <span>Source</span>
              <div className="jigsaw-room__image-preview">
                {batchPreview ? (
                  <BatchCanvasPreview layout={batchPreview} />
                ) : (
                  <div className="jigsaw-room__image-placeholder">
                    <span>Loading preview…</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {history.length > 0 && (
                <div className="jigsaw-room__input-group" ref={historyRef}>
                  <span>Saved builds</span>
                  <div className="jigsaw-room__history-selector">
                    <button
                      type="button"
                      className="jigsaw-room__history-trigger"
                      onClick={() => setHistoryOpen(!historyOpen)}
                    >
                      {history.length} saved build{history.length !== 1 ? "s" : ""}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
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

              <label className="jigsaw-room__input-group">
                <span>Image URL</span>
                <Input
                  aria-invalid={isError}
                  className="jigsaw-room__input"
                  placeholder="https://example.com/image.png"
                  type="url"
                  value={imageUrl}
                  onChange={(event) => {
                    setImageUrl(event.target.value)
                    setImgValid(true)
                  }}
                />
              </label>

              <div className="jigsaw-room__image-preview">
                {imageUrl.trim() ? (
                  imgValid ? (
                    <img
                      src={imageUrl.trim()}
                      alt="Preview"
                      onError={() => setImgValid(false)}
                      onLoad={() => setImgValid(true)}
                    />
                  ) : (
                    <div className="jigsaw-room__image-placeholder jigsaw-room__image-placeholder--error">
                      <span>Cannot load image. Please check the URL.</span>
                    </div>
                  )
                ) : (
                  <div className="jigsaw-room__image-placeholder">
                    <span>Image preview will appear here</span>
                  </div>
                )}
              </div>
            </>
          )}

          <label className="jigsaw-room__slider-group">
            <span>Pieces</span>
            <output className="jigsaw-room__slider-value">
              {pieceCount.toLocaleString()}
            </output>
            <div className="jigsaw-room__presets" role="radiogroup">
              {PRESETS.map((p) => {
                const isActive = findActivePreset(pieceCount, PRESETS) === p
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={isActive ? "is-active" : ""}
                    onClick={() => setPieceCount(p)}
                  >
                    {p >= 1_000 ? `${p / 1_000}k` : p}
                  </button>
                )
              })}
            </div>
            <Slider
              className="jigsaw-room__slider"
              max={2_000}
              min={48}
              step={1}
              value={[pieceCount]}
              onValueChange={([value]) => setPieceCount(value ?? 48)}
            />
          </label>

          <Button
            className="jigsaw-room__submit-btn"
            disabled={creating || (!hasBatchParams && !imageUrl.trim()) || !authSession}
            onClick={() => void createRoom()}
          >
            {creating && (
              <span className="jigsaw-room__spinner" aria-hidden="true" />
            )}
            {creating
              ? "Creating..."
              : authSession
                ? "Create room"
                : "Login required"}
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
            aria-label="Room sharing"
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
                {copied ? "✓ Copied!" : "Copy link"}
              </Button>
              <Button asChild size="sm">
                <a href={`/jigsaw/${createdRoom.roomId}`}>Open room</a>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Telegram login failed"
}

function getInitialImageUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get("imageUrl") ?? DEFAULT_IMAGE_URL
}

function getInitialBatchId(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("batchId")?.trim() || null
}

function getInitialBatchToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("batchToken")?.trim() || null
}

function getInitialSourceSize(): { width: number; height: number } | null {
  const params = new URLSearchParams(window.location.search)
  const width = Number(params.get("sourceWidth"))
  const height = Number(params.get("sourceHeight"))

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  return { width: Math.round(width), height: Math.round(height) }
}

function BatchCanvasPreview({ layout }: { layout: BatchLayout }) {
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
