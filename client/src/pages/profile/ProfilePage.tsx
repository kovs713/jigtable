import { useEffect, useMemo, useRef, useState } from "react"

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
import {
  fetchJigsawHistory,
  type JigsawHistoryItem,
} from "@/features/history/history"
import { readLocalJigsawSession } from "@/features/session/session"
import { formatDate, formatDuration } from "@/shared/formatting/date-time"

import { ProfileLoadingSkeleton } from "./ProfileLoadingSkeleton"

import "@/features/room/room.css"
import "./profile-page.css"

export function ProfilePage() {
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const anonSessionRef = useRef(readLocalJigsawSession())
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [history, setHistory] = useState<JigsawHistoryItem[]>([])
  const [status, setStatus] = useState(() =>
    readLocalAuthSession() ? "loading profile..." : "tg login required"
  )
  const [isLoading, setIsLoading] = useState(() => Boolean(authSession))
  const [widgetVisible, setWidgetVisible] = useState(false)
  const stats = useMemo(() => createProfileStats(history), [history])

  async function refreshHistory(session: AuthSession): Promise<void> {
    const nextHistory = await fetchJigsawHistory(session.token)

    setAuthSession(session)
    setHistory(nextHistory)
    setStatus(nextHistory.length ? "history synced" : "no solved jigsaws yet")
  }

  async function loginWithTelegram(): Promise<void> {
    if (!hasTelegramWebAppInitData()) {
      if (!getTelegramBotUsername()) {
        setStatus(
          "Set VITE_TELEGRAM_BOT_USERNAME to bot username ending with bot"
        )
        return
      }

      const widgetBlocker = getTelegramLoginWidgetBlocker()

      if (widgetBlocker) {
        setStatus(widgetBlocker)
        return
      }

      setWidgetVisible(true)
      setStatus("confirm in tg widget")
      return
    }

    setIsLoading(true)
    setStatus("tg webapp login...")

    try {
      const session = await loginTelegramWebApp(anonSessionRef.current.token)
      await refreshHistory(session)
    } catch (error) {
      setStatus(readErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const saved = readLocalAuthSession()

    if (!saved) {
      return
    }

    const authToken = saved.token
    let disposed = false

    async function loadProfile(): Promise<void> {
      setIsLoading(true)

      try {
        const session = await fetchAuthMe(authToken)
        const nextHistory = await fetchJigsawHistory(session.token)

        if (disposed) {
          return
        }

        saveLocalAuthSession(session)
        setAuthSession(session)
        setHistory(nextHistory)
        setStatus(
          nextHistory.length ? "history synced" : "no solved jigsaws yet"
        )
      } catch (error) {
        if (!disposed) {
          setStatus(readErrorMessage(error))
        }
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const host = widgetRef.current
    const botUsername = getTelegramBotUsername()

    if (!widgetVisible || !host || !botUsername) {
      return
    }

    const callbackName = `onJigsawProfileTelegramAuth_${anonSessionRef.current.player.id.replace(/[^a-z0-9]/gi, "")}`
    const anonSessionToken = anonSessionRef.current.token
    const callbacks = window as unknown as Record<
      string,
      (payload: Record<string, unknown>) => void
    >
    const script = document.createElement("script")

    host.replaceChildren()
    callbacks[callbackName] = (payload) => {
      setIsLoading(true)
      setStatus("Telegram widget login...")
      void loginTelegramWidget(payload, anonSessionToken)
        .then(async (session) => {
          const nextHistory = await fetchJigsawHistory(session.token)

          saveLocalAuthSession(session)
          setAuthSession(session)
          setHistory(nextHistory)
          setWidgetVisible(false)
          setStatus(
            nextHistory.length ? "history synced" : "no solved jigsaws yet"
          )
        })
        .catch((error) => {
          setStatus(readErrorMessage(error))
        })
        .finally(() => {
          setIsLoading(false)
        })
    }

    script.async = true
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", "large")
    script.setAttribute("data-userpic", "false")
    script.setAttribute("data-request-access", "write")
    script.setAttribute("data-onauth", `${callbackName}(user)`)
    host.appendChild(script)

    return () => {
      delete callbacks[callbackName]
      host.replaceChildren()
    }
  }, [widgetVisible])

  if (isLoading) {
    return <ProfileLoadingSkeleton />
  }

  return (
    <main className="jigsaw-room jigsaw-room--profile">
      <section className="jigsaw-room__profile-shell corner-brackets">
        <div className="jigsaw-room__profile-hero">
          <div className="jigsaw-room__profile-hero-info">
            <p className="jigsaw-room__profile-kicker">Player ledger</p>

            <div className="jigsaw-room__profile-headline">
              {authSession?.user.photoUrl ? (
                <img
                  className="jigsaw-room__profile-avatar"
                  src={authSession.user.photoUrl}
                  alt=""
                />
              ) : (
                <div className="jigsaw-room__profile-avatar jigsaw-room__profile-avatar--fallback">
                  {getInitials(authSession?.user.displayName)}
                </div>
              )}
              <h1>{authSession?.user.displayName ?? "Guest profile"}</h1>
            </div>
            <span className="jigsaw-room__profile-status" aria-live="polite">
              {status}
            </span>
          </div>

          <div className="jigsaw-room__profile-hero-side">
            <div className="jigsaw-room__profile-actions">
              <a
                href="/rooms/new"
                className="jigsaw-room__btn jigsaw-room__btn--outline"
              >
                Create room
              </a>
              <button
                type="button"
                className="jigsaw-room__btn jigsaw-room__btn--primary"
                disabled={isLoading}
                onClick={loginWithTelegram}
              >
                {isLoading
                  ? "Loading..."
                  : authSession
                    ? "Relink Telegram"
                    : "Telegram login"}
              </button>
            </div>

            {widgetVisible ? (
              <div ref={widgetRef} className="jigsaw-room__telegram-widget" />
            ) : null}
          </div>
        </div>

        <dl className="jigsaw-room__profile-scoreboard">
          <div>
            <dt>Solved</dt>
            <dd>{stats.solved}</dd>
          </div>
          <div>
            <dt>XP</dt>
            <dd>{authSession?.user.xpTotal ?? 0}</dd>
          </div>
          <div>
            <dt>Pieces</dt>
            <dd>{stats.pieces}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatDuration(stats.elapsedMs)}</dd>
          </div>
          <div>
            <dt>Partners</dt>
            <dd>{stats.partners}</dd>
          </div>
        </dl>

        <section
          className="jigsaw-room__history-panel"
          aria-label="Jigsaw history"
        >
          <div className="jigsaw-room__history-heading">
            <span>Saved jigsaw history</span>
            <strong>{history.length} records</strong>
          </div>

          {history.length ? (
            <div className="jigsaw-room__history-list">
              {history.map((item) => (
                <a
                  key={item.roomId}
                  href={`/profile/history/${encodeURIComponent(item.roomId)}`}
                  className="jigsaw-room__history-card"
                >
                  <div className="jigsaw-room__history-card-header">
                    <span>{item.source.label}</span>
                    <strong>{formatDate(item.completedAt)}</strong>
                  </div>

                  <dl className="jigsaw-room__history-card-stats">
                    <div>
                      <dt>Pieces</dt>
                      <dd>{item.pieceCount}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatDuration(item.elapsedMs)}</dd>
                    </div>
                  </dl>

                  <div className="jigsaw-room__history-people">
                    {item.participants.map((participant, index) => (
                      <span
                        key={`${item.roomId}-${participant.playerId ?? participant.telegramId ?? participant.name}-${index}`}
                        className="jigsaw-room__participant-chip"
                        style={{
                          borderLeftColor: participant.color,
                          color: participant.color,
                        }}
                      >
                        {participant.name}
                      </span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="jigsaw-room__history-empty">
              <p>
                finish a jigsaw room while linked with tg. safe refs keep raw
                image urls and tokens out of history.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

function createProfileStats(history: JigsawHistoryItem[]) {
  const partners = new Set<string>()

  for (const item of history) {
    for (const participant of item.participants) {
      partners.add(participant.telegramId ?? participant.name)
    }
  }

  return {
    solved: history.length,
    pieces: history.reduce((sum, item) => sum + item.pieceCount, 0),
    elapsedMs: history.reduce((sum, item) => sum + item.elapsedMs, 0),
    partners: partners.size,
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Profile unavailable"
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default ProfilePage
