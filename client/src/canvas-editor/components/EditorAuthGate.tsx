import type { RefObject } from "react"

import { Button } from "@/shared/ui/button"

type EditorAuthGateProps = {
  authLoading: boolean
  authStatus: string
  telegramWidgetVisible: boolean
  telegramWidgetRef: RefObject<HTMLDivElement | null>
  onLogin: () => void
}

export function EditorAuthGate({
  authLoading,
  authStatus,
  telegramWidgetVisible,
  telegramWidgetRef,
  onLogin,
}: EditorAuthGateProps) {
  return (
    <main className="editor-auth-gate canvas-grid">
      <section
        className="editor-auth-gate__panel glass corner-brackets"
        aria-labelledby="editor-auth-title"
      >
        <span className="editor-auth-gate__kicker">private composition</span>
        <h1 id="editor-auth-title" className="editor-auth-gate__title">
          Sign in to edit this composition
        </h1>
        <p className="editor-auth-gate__description">
          This edit link is private. Sign in with the Telegram account that owns
          this composition to view or change it.
        </p>
        <div className="editor-auth-gate__actions">
          <Button disabled={authLoading} size="lg" onClick={onLogin}>
            {authLoading ? "Signing in..." : "Sign in with Telegram"}
          </Button>
          <a className="editor-auth-gate__back" href="/">
            Back to Jigtable
          </a>
        </div>
        <p className="editor-auth-gate__status" aria-live="polite">
          {authStatus}
        </p>
        {telegramWidgetVisible ? (
          <div
            ref={telegramWidgetRef}
            className="editor-auth-gate__telegram-widget"
          />
        ) : null}
      </section>
    </main>
  )
}
