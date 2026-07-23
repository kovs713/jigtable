import { useEffect, useRef } from "react"

import type { PlayerSessionResult } from "@jigtable/core/session-history"

import { paths } from "@/app/routes"

import type { JigsawRoomResult } from "@/features/room/data"
import {
  comparePlayerResults,
  formatContributionPercentage,
  SESSION_LABELS,
} from "@/features/history/session-results"

import { formatElapsedTime } from "./timer"

interface SolvedRoomResultsProps {
  roomId: string
  result: JigsawRoomResult | null
  fallbackElapsedMs: number
  currentPlayerId: string
  currentUserId?: string
  currentPlayerName: string
  expanded: boolean
  onClose: () => void
}

export function SolvedRoomResults({
  roomId,
  result,
  fallbackElapsedMs,
  currentPlayerId,
  currentUserId,
  currentPlayerName,
  expanded,
  onClose,
}: SolvedRoomResultsProps) {
  const cardRef = useRef<HTMLElement | null>(null)
  const rankedPlayers = result?.summary
    ? [...result.summary.players].sort(comparePlayerResults)
    : []
  const currentPlayer = findCurrentPlayer(
    rankedPlayers,
    currentPlayerId,
    currentUserId
  )
  const currentRank = currentPlayer
    ? rankedPlayers.findIndex(
        (player) => player.playerId === currentPlayer.playerId
      ) + 1
    : null
  const elapsedTime = formatElapsedTime(result?.elapsedMs ?? fallbackElapsedMs)

  useEffect(() => {
    if (!expanded) return

    cardRef.current?.focus()

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", closeOnEscape)

    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [expanded, onClose])

  return (
    <section
      ref={cardRef}
      className={
        expanded
          ? "jigsaw-room__solved-card jigsaw-room__solved-card--results"
          : "jigsaw-room__solved-card"
      }
      aria-labelledby="solved-room-title"
      tabIndex={expanded ? -1 : undefined}
    >
      <header className="jigsaw-room__solved-heading">
        <span id="solved-room-title">
          Room solved{expanded ? ` · ${elapsedTime}` : ""}
        </span>
        {!expanded ? <strong>{elapsedTime}</strong> : null}
      </header>

      {expanded ? (
        <div className="jigsaw-room__final-results">
          {result?.summary ? (
            <>
              <div className="jigsaw-room__result-intro">
                <div>
                  <span>Nice work,</span>
                  <strong>{currentPlayer?.name ?? currentPlayerName}</strong>
                </div>
                {currentPlayer && currentRank ? (
                  <p>
                    #{currentRank} · {currentPlayer.score.points} points ·{" "}
                    {formatXp(currentPlayer)}
                  </p>
                ) : (
                  <p>Room complete · Final standings ready</p>
                )}
              </div>

              {currentPlayer?.labels.length ? (
                <div
                  className="jigsaw-room__earned-titles"
                  aria-label="Titles earned"
                >
                  {currentPlayer.labels.map((label) => (
                    <span key={label}>{SESSION_LABELS[label]}</span>
                  ))}
                </div>
              ) : null}

              <div className="jigsaw-room__results-table-wrap">
                <table className="jigsaw-room__results-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Player</th>
                      <th scope="col">Score</th>
                      <th scope="col">Contribution</th>
                      <th scope="col">XP</th>
                      <th scope="col">Titles</th>
                      <th scope="col">Pieces solved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedPlayers.map((player, index) => {
                      const isCurrentPlayer =
                        player.playerId === currentPlayer?.playerId

                      return (
                        <tr
                          key={player.playerId}
                          className={
                            isCurrentPlayer
                              ? "jigsaw-room__results-row--current"
                              : undefined
                          }
                          aria-current={isCurrentPlayer ? "true" : undefined}
                        >
                          <td>{index + 1}</td>
                          <td>
                            <span
                              className="jigsaw-room__results-player-color"
                              style={{ backgroundColor: player.color }}
                              aria-hidden="true"
                            />
                            <strong>{player.name}</strong>
                            {isCurrentPlayer ? <small>You</small> : null}
                          </td>
                          <td>{player.score.points}</td>
                          <td>
                            {formatContributionPercentage(
                              player.stats.contributionPercentage
                            )}
                          </td>
                          <td>{formatXp(player, false)}</td>
                          <td>
                            <div className="jigsaw-room__results-titles">
                              {player.labels.length
                                ? player.labels.map((label) => (
                                    <span key={label}>
                                      {SESSION_LABELS[label]}
                                    </span>
                                  ))
                                : "-"}
                            </div>
                          </td>
                          <td>{player.stats.primaryPieces}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="jigsaw-room__results-pending" role="status">
              <span className="jigsaw-room__spinner" aria-hidden="true" />
              Finalizing scores and titles...
            </div>
          )}

          <footer className="jigsaw-room__results-actions">
            <a href={paths.profileHistoryItem(roomId)}>View detailed result</a>
            <a href={paths.profile()}>Profile</a>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      ) : null}
    </section>
  )
}

function findCurrentPlayer(
  players: PlayerSessionResult[],
  playerId: string,
  userId?: string
): PlayerSessionResult | null {
  return (
    players.find((player) => player.playerId === playerId) ??
    players.find((player) => Boolean(userId) && player.userId === userId) ??
    null
  )
}

function formatXp(player: PlayerSessionResult, includeUnit = true): string {
  return player.userId
    ? `+${player.xpGained}${includeUnit ? " XP" : ""}`
    : "Guest"
}
