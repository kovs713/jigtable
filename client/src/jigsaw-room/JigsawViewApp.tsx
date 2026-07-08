import { useEffect, useState } from "react"

import {
  fetchJigsawRoomResult,
  type JigsawRoomResult,
} from "./room-api"
import { HistoryPreview } from "./HistoryPreview"
import { formatDate, formatDuration } from "./time"

import "./jigsaw-room.css"
import "./jigsaw-room-view.css"

export function JigsawViewApp({ roomId }: { roomId: string }) {
  const [result, setResult] = useState<JigsawRoomResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false

    void fetchJigsawRoomResult(roomId)
      .then((data) => {
        if (!disposed) {
          setResult(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!disposed) {
          setError(err instanceof Error ? err.message : "Failed to load")
          setLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [roomId])

  if (loading) {
    return (
      <main className="jigsaw-room jigsaw-room--view">
        <div className="jigsaw-room__view-status">
          <span className="jigsaw-room__view-dot" />
          <span>Loading puzzle…</span>
        </div>
      </main>
    )
  }

  if (error || !result) {
    return (
      <main className="jigsaw-room jigsaw-room--view">
        <div className="jigsaw-room__view-status">
          <span>{error ?? "Puzzle not found"}</span>
          <a href="/profile" className="jigsaw-room__view-link">
            Back to profile
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="jigsaw-room jigsaw-room--view">
      <div className="jigsaw-room__view-shell corner-brackets">
        <div className="jigsaw-room__view-toolbar">
          <a href="/profile" className="jigsaw-room__view-link">
            ← Profile
          </a>
          <span className="jigsaw-room__view-meta">
            {result.pieceCount} pieces · {formatDuration(result.elapsedMs)}
          </span>
        </div>

        <div className="jigsaw-room__view-canvas">
          {result.imageUrl ? (
            <HistoryPreview
              imageUrl={result.imageUrl}
              pieceCount={result.pieceCount}
              jigsawConfig={result.jigsawConfig}
              className="jigsaw-room__view-image"
            />
          ) : (
            <div className="jigsaw-room__view-placeholder">
              Image unavailable
            </div>
          )}
        </div>

        <div className="jigsaw-room__view-footer">
          <span className="jigsaw-room__view-date">
            {formatDate(result.completedAt)}
          </span>
          <div className="jigsaw-room__view-participants">
            {result.participants.map((p, i) => (
              <span
                key={`${p.telegramId ?? p.name}-${i}`}
                className="jigsaw-room__participant-chip"
                style={{
                  borderLeftColor: p.color,
                  color: p.color,
                }}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

export default JigsawViewApp
