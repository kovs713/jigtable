import { useMemo, useState } from "react"

import "./index.css"
import { Button } from "@/components/ui/button"
import type { CreateJigsawRoomResponse } from "./multiplayer/protocol"

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"
const DEFAULT_IMAGE_URL = "/test_puzzle.png"
const PIECE_COUNT_OPTIONS = [48, 100, 150, 300, 600, 1_000, 1_500, 2_000]

export function JigsawRoomCreateApp() {
  const initialImageUrl = useMemo(() => getInitialImageUrl(), [])
  const initialSourceSize = useMemo(() => getInitialSourceSize(), [])
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [pieceCount, setPieceCount] = useState(150)
  const [status, setStatus] = useState("Choose puzzle size")
  const [creating, setCreating] = useState(false)
  const [createdRoom, setCreatedRoom] =
    useState<CreateJigsawRoomResponse | null>(null)

  async function createRoom(): Promise<void> {
    const trimmedImageUrl = imageUrl.trim()

    if (!trimmedImageUrl) {
      setStatus("Image URL is required")
      return
    }

    setCreating(true)
    setStatus("Creating room...")

    try {
      const sourceSize =
        trimmedImageUrl === initialImageUrl ? initialSourceSize : null
      const response = await fetch(`${API_BASE_URL}/api/jigsaw/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: trimmedImageUrl,
          pieceCount,
          sourceWidth: sourceSize?.width,
          sourceHeight: sourceSize?.height,
        }),
      })
      const payload = await readJsonResponse<CreateJigsawRoomResponse>(response)

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
    } finally {
      setCreating(false)
    }
  }

  async function copyLink(): Promise<void> {
    if (!createdRoom) {
      return
    }

    await navigator.clipboard.writeText(createdRoom.joinUrl)
    setStatus("Link copied")
  }

  return (
    <main className="jigsaw-room jigsaw-room--create">
      <section className="jigsaw-room__create-panel">
        <div className="jigsaw-room__create-copy">
          <p className="jigsaw-room__create-kicker">Multiplayer jigsaw</p>
          <h1>Create room</h1>
          <p>
            Pick a puzzle size, create a temporary room, then share the link.
            Friends join as guests.
          </p>
        </div>

        <div className="jigsaw-room__create-form">
          <label>
            <span>Image URL</span>
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </label>

          <fieldset>
            <legend>Target pieces</legend>
            <div className="jigsaw-room__piece-options">
              {PIECE_COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pieceCount === option}
                  onClick={() => setPieceCount(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <Button disabled={creating} onClick={() => void createRoom()}>
            {creating ? "Creating..." : "Create room"}
          </Button>

          <p className="jigsaw-room__create-status">{status}</p>
        </div>

        {createdRoom ? (
          <div className="jigsaw-room__share-box">
            <span>Share link</span>
            <p>{createdRoom.state.stats.totalPieces} pieces generated</p>
            <code>{createdRoom.joinUrl}</code>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyLink()}
              >
                Copy link
              </Button>
              <Button asChild size="sm">
                <a href={`/jigsaw/${createdRoom.roomId}`}>Open room</a>
              </Button>
            </div>
          </div>
        ) : null}
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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (isRecord(payload) && typeof payload.error === "string") {
      throw new Error(payload.error)
    }

    throw new Error(`Request failed: ${response.status}`)
  }

  return payload as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export default JigsawRoomCreateApp
