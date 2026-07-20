import { useEffect, useState } from "react"

import type {
  PlayerSessionResult,
  SessionLabel,
} from "@jigtable/core/session-history"

import { HistoryPreview } from "./HistoryPreview"
import { fetchJigsawRoomResult, type JigsawRoomResult } from "./room-api"
import { formatDate, formatDuration } from "./time"

import "./jigsaw-room-view.css"
import "./jigsaw-room.css"

const SESSION_LABELS: Record<SessionLabel, string> = {
  mvp: "MVP",
  first_blood: "First blood",
  last_hit: "Last hit",
  glue_master: "Glue master",
  closer: "Closer",
  wall_builder: "Wall builder",
  corner_hunter: "Corner hunter",
  biggest_build: "Biggest build",
  largest_region: "Largest region",
  ping_lord: "Ping lord",
  preview_enjoyer: "Preview enjoyer",
  locksmith: "Locksmith",
  team_player: "Team player",
}

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

  const rankedPlayers = result.summary
    ? [...result.summary.players].sort(comparePlayerResults)
    : []

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

        <section
          className="jigsaw-room__result-summary"
          aria-label="Session statistics"
        >
          <div className="jigsaw-room__result-summary-heading">
            <div>
              <span>Session report</span>
              <strong>Player contribution</strong>
            </div>
            {result.summary ? (
              <span>
                Score v{result.summary.scoringVersion} · Contribution v
                {result.summary.contributionVersion}
              </span>
            ) : null}
          </div>

          {rankedPlayers.length ? (
            <div className="jigsaw-room__result-players">
              {rankedPlayers.map((player, index) => (
                <PlayerResultRow
                  key={player.playerId}
                  player={player}
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <div className="jigsaw-room__result-summary-empty">
              Detailed statistics are unavailable for this legacy result.
            </div>
          )}
        </section>

        <div className="jigsaw-room__view-footer">
          <span className="jigsaw-room__view-date">
            {formatDate(result.completedAt)}
          </span>
          <div className="jigsaw-room__view-participants">
            {result.participants.map((p, i) => (
              <span
                key={`${p.playerId ?? p.telegramId ?? p.name}-${i}`}
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

function PlayerResultRow({
  player,
  rank,
}: {
  player: PlayerSessionResult
  rank: number
}) {
  const joins = player.stats.piecesJoined + player.stats.groupsJoined

  return (
    <article
      className="jigsaw-room__result-player"
      style={{ borderLeft: `3px solid ${player.color}` }}
    >
      <div className="jigsaw-room__result-player-heading">
        <span className="jigsaw-room__result-rank">
          {String(rank).padStart(2, "0")}
        </span>
        <span
          className="jigsaw-room__result-player-dot"
          style={{ backgroundColor: player.color }}
          aria-hidden="true"
        />
        <strong>{player.name}</strong>
        <div className="jigsaw-room__result-labels">
          {player.labels.map((label) => (
            <span key={label}>{SESSION_LABELS[label]}</span>
          ))}
        </div>
      </div>

      <dl className="jigsaw-room__result-stats">
        <ResultStat label="Score" value={String(player.score.points)} />
        <ResultStat
          label="Contribution"
          value={formatPercentage(player.stats.contributionPercentage)}
        />
        <ResultStat
          label="Primary pieces"
          value={String(player.stats.primaryPieces)}
        />
        <ResultStat label="Joins" value={String(joins)} />
        <ResultStat label="Placed" value={String(player.stats.piecesSnapped)} />
        <ResultStat
          label="XP"
          value={player.userId ? `+${player.xpGained}` : "Guest"}
        />
      </dl>
    </article>
  )
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function comparePlayerResults(
  left: PlayerSessionResult,
  right: PlayerSessionResult
): number {
  return (
    right.score.points - left.score.points ||
    right.stats.contributionPercentage - left.stats.contributionPercentage ||
    left.name.localeCompare(right.name)
  )
}

function formatPercentage(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`
}

export default JigsawViewApp
