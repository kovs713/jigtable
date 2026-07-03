import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import type { CreateJigsawRoomResponse } from "@jigtable/jigsaw-core/multiplayer/protocol"
import { createJigsawRoom } from "./room-api"

import "./jigsaw-room.css"
import "./jigsaw-room-create.css"

const DEFAULT_IMAGE_URL = "/test_jigsaw.png"
const PIECE_COUNT_OPTIONS = [48, 100, 150, 300, 600, 1_000, 1_500, 2_000]

export function JigsawRoomCreateApp() {
  const initialImageUrl = useMemo(() => getInitialImageUrl(), [])
  const initialSourceSize = useMemo(() => getInitialSourceSize(), [])

  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [pieceCount, setPieceCount] = useState(150)
  const [status, setStatus] = useState("Choose jigsaw size")
  const [isError, setIsError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdRoom, setCreatedRoom] =
    useState<CreateJigsawRoomResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [imgValid, setImgValid] = useState(true)

  async function createRoom(): Promise<void> {
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
      const payload = await createJigsawRoom({
        imageUrl: trimmedImageUrl,
        pieceCount,
        sourceWidth: sourceSize?.width,
        sourceHeight: sourceSize?.height,
      })

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
            Pick a jigsaw size, create a temporary room, then share the link.
            Friends join as guests.
          </p>
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
            disabled={creating || !imageUrl.trim()}
            onClick={() => void createRoom()}
          >
            {creating && (
              <span className="jigsaw-room__spinner" aria-hidden="true" />
            )}
            {creating ? "Creating..." : "Create room"}
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
