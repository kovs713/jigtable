import { useEffect, useRef, useState } from "react"

import {
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatMessage,
} from "@jigtable/core/protocol"

type RoomChatWidgetProps = {
  messages: readonly ChatMessage[]
  ownPlayerId: string
  connected: boolean
  onSend: (text: string) => boolean
}

export function RoomChatWidget({
  messages,
  ownPlayerId,
  connected,
  onSend,
}: RoomChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(
    null
  )
  const feedRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latestMessage = messages.at(-1)
  const lastReadIndex = lastReadMessageId
    ? messages.findIndex((message) => message.id === lastReadMessageId)
    : -1
  const unread = open
    ? 0
    : messages
        .slice(lastReadIndex + 1)
        .filter((message) => message.player.id !== ownPlayerId).length

  useEffect(() => {
    if (!open) return

    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const feed = feedRef.current

    if (feed) {
      feed.scrollTop = feed.scrollHeight
    }
  }, [open, messages])

  function submitMessage(event: React.SubmitEvent<HTMLFormElement>): void {
    event.preventDefault()

    const text = draft.trim()

    if (!text || !connected || !onSend(text)) return

    setDraft("")
  }

  if (!open) {
    return (
      <button
        type="button"
        className="jigsaw-room__chat-launcher corner-brackets"
        aria-label={unread ? `Open chat, ${unread} unread` : "Open room chat"}
        aria-expanded="false"
        aria-controls="jigsaw-room-chat"
        onClick={() => {
          setLastReadMessageId(latestMessage?.id ?? null)
          setOpen(true)
        }}
      >
        <span className="jigsaw-room__chat-launcher-mark" aria-hidden="true">
          //
        </span>
        <span>Chat</span>
        {unread ? (
          <span className="jigsaw-room__chat-unread" aria-hidden="true">
            {Math.min(unread, 99)}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <aside
      id="jigsaw-room-chat"
      className="jigsaw-room__chat-panel corner-brackets"
      aria-label="Room chat"
    >
      <header className="jigsaw-room__chat-header">
        <div>
          <span className="jigsaw-room__chat-kicker">Room comms</span>
          <strong>Player chat</strong>
        </div>
        <span
          className={
            connected
              ? "jigsaw-room__chat-connection jigsaw-room__chat-connection--live"
              : "jigsaw-room__chat-connection"
          }
        >
          {connected ? "live" : "offline"}
        </span>
        <button
          type="button"
          aria-label="Close room chat"
          aria-expanded="true"
          aria-controls="jigsaw-room-chat"
          onClick={() => {
            setLastReadMessageId(latestMessage?.id ?? null)
            setOpen(false)
          }}
        >
          Close
        </button>
      </header>

      <div
        ref={feedRef}
        className="jigsaw-room__chat-feed"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length ? (
          messages.map((message) => {
            const own = message.player.id === ownPlayerId

            return (
              <article
                key={message.id}
                className={
                  own
                    ? "jigsaw-room__chat-message jigsaw-room__chat-message--own"
                    : "jigsaw-room__chat-message"
                }
              >
                <div className="jigsaw-room__chat-message-meta">
                  <span
                    className="jigsaw-room__chat-player-dot"
                    style={{
                      color: message.player.color,
                      backgroundColor: message.player.color,
                    }}
                    aria-hidden="true"
                  />
                  <strong>{own ? "You" : message.player.name}</strong>
                  <time dateTime={new Date(message.createdAt).toISOString()}>
                    {formatChatTime(message.createdAt)}
                  </time>
                </div>
                <p>{message.text}</p>
              </article>
            )
          })
        ) : (
          <div className="jigsaw-room__chat-empty">
            <span>Channel clear</span>
            <p>Send the first message to your teammates.</p>
          </div>
        )}
      </div>

      <form className="jigsaw-room__chat-form" onSubmit={submitMessage}>
        <label htmlFor="jigsaw-room-chat-message">Message</label>
        <div>
          <input
            ref={inputRef}
            id="jigsaw-room-chat-message"
            type="text"
            value={draft}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            autoComplete="off"
            placeholder={connected ? "Type to the room..." : "Chat unavailable"}
            disabled={!connected}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={!connected || !draft.trim()}>
            Send
          </button>
        </div>
      </form>
    </aside>
  )
}

function formatChatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}
