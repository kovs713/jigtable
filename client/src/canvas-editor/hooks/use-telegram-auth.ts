import { useCallback, useEffect, useRef, useState } from "react"

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

export function useTelegramAuth() {
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState(() =>
    readLocalAuthSession() ? "checking tg session..." : "tg login required"
  )
  const [authLoading, setAuthLoading] = useState(() => Boolean(authSession))
  const [telegramWidgetVisible, setTelegramWidgetVisible] = useState(false)

  useEffect(() => {
    const saved = readLocalAuthSession()
    if (!saved) return
    let disposed = false
    void fetchAuthMe(saved.token)
      .then((session) => {
        if (disposed) return
        saveLocalAuthSession(session)
        setAuthSession(session)
        setAuthStatus("tg session restored")
      })
      .catch((error) => {
        if (!disposed) {
          setAuthSession(null)
          setAuthStatus(readErrorMessage(error))
        }
      })
      .finally(() => {
        if (!disposed) setAuthLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [])

  const loginWithTelegramWidget = useCallback(
    async (payload: Record<string, unknown>) => {
      setAuthLoading(true)
      setAuthStatus("tg widget login...")
      try {
        const session = await loginTelegramWidget(payload)
        setAuthSession(session)
        setTelegramWidgetVisible(false)
        setAuthStatus("tg linked")
      } catch (error) {
        setAuthStatus(readErrorMessage(error))
      } finally {
        setAuthLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    const host = telegramWidgetRef.current
    const botUsername = getTelegramBotUsername()
    if (!telegramWidgetVisible || !host || !botUsername) return
    const callbackName = "onCanvasTelegramAuth"
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
  }, [loginWithTelegramWidget, telegramWidgetVisible])

  async function loginWithTelegram() {
    if (!hasTelegramWebAppInitData()) {
      if (!getTelegramBotUsername()) {
        setAuthStatus(
          "Set VITE_TELEGRAM_BOT_USERNAME to bot username ending with bot"
        )
        return
      }
      const blocker = getTelegramLoginWidgetBlocker()
      if (blocker) {
        setAuthStatus(blocker)
        return
      }
      setTelegramWidgetVisible(true)
      setAuthStatus("confirm in tg widget")
      return
    }
    setAuthLoading(true)
    setAuthStatus("tg webapp login...")
    try {
      setAuthSession(await loginTelegramWebApp())
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  return {
    authSession,
    authStatus,
    authLoading,
    telegramWidgetVisible,
    telegramWidgetRef,
    loginWithTelegram,
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}
