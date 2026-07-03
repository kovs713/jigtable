import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { CreateJigsawRoomResponse } from "@jigtable/jigsaw-core/multiplayer/protocol"
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
} from "./multiplayer/auth"
import { createJigsawRoom } from "./room-api"

import "./jigsaw-room.css"
import "./jigsaw-room-create.css"

const DEFAULT_IMAGE_URL = "/test_jigsaw.png"
const PIECE_COUNT_OPTIONS = [48, 100, 150, 300, 600, 1_000, 1_500, 2_000]

export function JigsawRoomCreateApp() {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const initialImageUrl = useMemo(() => getInitialImageUrl(), [])
  const initialSourceSize = useMemo(() => getInitialSourceSize(), [])

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
      <section className="jigsaw-room__create-panel">
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
            <span className="jigsaw-room__create-status" role="status">
              {authStatus}
            </span>
          </div>
          {widgetVisible ? (
            <div ref={widgetRef} className="jigsaw-room__telegram-widget" />
          ) : null}
        </div>

        <div className="jigsaw-room__create-form">
          <label className="jigsaw-room__input-group">
            <span>Image URL</span>
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value)
                setImgValid(true)
              }}
              placeholder="https://example.com/image.png"
              aria-invalid={isError}
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

          <fieldset>
            <legend>Target pieces</legend>
            <div className="jigsaw-room__piece-options" role="radiogroup">
              {PIECE_COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={pieceCount === option}
                  className={pieceCount === option ? "is-selected" : ""}
                  onClick={() => setPieceCount(option)}
                >
                  {option.toLocaleString()}
                </button>
              ))}
            </div>
          </fieldset>

          <Button
            className="jigsaw-room__submit-btn"
            disabled={creating || !imageUrl.trim() || !authSession}
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

export default JigsawRoomCreateApp
