import { useCallback, useEffect, useRef, useState } from "react"

import type { AuthSession } from "@/features/auth/auth"
import {
  fetchUserCompositions,
  type UserCompositionItem,
} from "@/features/compositions/compositions"

import {
  fetchCompositionLayout,
  renderComposition,
  updateCompositionLayout,
} from "../api/compositions"
import {
  getInitialCompositionRef,
  parseCompositionInput,
} from "../model/composition"
import { normalizeCanvasLayout } from "../model/layout"
import type {
  CanvasLayout,
  CompositionRef,
  SelectedComposition,
} from "../model/types"

type CompositionSessionOptions = {
  authSession: AuthSession | null
  applyLayout: (layout: CanvasLayout, preserveAsOriginal?: boolean) => void
  setStatus: (
    message: string,
    kind?: "idle" | "loading" | "success" | "error"
  ) => void
}

export function useCompositionSession(options: CompositionSessionOptions) {
  const optionsRef = useRef(options)
  const authSession = options.authSession
  const [remoteComposition, setRemoteComposition] =
    useState<CompositionRef | null>(() =>
      getInitialCompositionRef(window.location.search)
    )
  const [compositions, setCompositions] = useState<UserCompositionItem[]>([])
  const [selectedComposition, setSelectedComposition] =
    useState<SelectedComposition | null>(null)
  const [loadCode, setLoadCode] = useState("")
  const didLoadRemoteRef = useRef(false)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const loadComposition = useCallback(
    async (composition: CompositionRef, syncUrl = true) => {
      if (!authSession) {
        optionsRef.current.setStatus("tg login required", "idle")
        return false
      }
      optionsRef.current.setStatus("Loading images...", "loading")
      try {
        const payload = await fetchCompositionLayout(
          composition,
          authSession.token
        )
        optionsRef.current.applyLayout(
          normalizeCanvasLayout(payload.layout),
          true
        )
        setRemoteComposition({
          compositionId: payload.compositionId,
          token: composition.token,
          jigsawImageUrl: payload.jigsawImageUrl,
        })
        if (syncUrl)
          window.history.replaceState(
            null,
            "",
            `?compositionId=${encodeURIComponent(payload.compositionId)}&token=${encodeURIComponent(composition.token)}`
          )
        optionsRef.current.setStatus("Ready to edit", "success")
      } catch (error) {
        optionsRef.current.setStatus(
          error instanceof Error ? error.message : "Failed to load images",
          "error"
        )
        return false
      }
      return true
    },
    [authSession]
  )

  useEffect(() => {
    if (!authSession) return
    let disposed = false
    void fetchUserCompositions(authSession.token)
      .then((items) => {
        if (disposed) return
        setCompositions(items)
        if (!remoteComposition && !selectedComposition && items[0]) {
          const first = items[0]
          setSelectedComposition({
            compositionId: first.compositionId,
            compositionToken: first.compositionToken,
          })
          void loadComposition({
            compositionId: first.compositionId,
            token: first.compositionToken,
            jigsawImageUrl: null,
          })
        }
      })
      .catch((error) => {
        if (!disposed)
          optionsRef.current.setStatus(readErrorMessage(error), "error")
      })
    return () => {
      disposed = true
    }
  }, [authSession, loadComposition, remoteComposition, selectedComposition])

  useEffect(() => {
    if (didLoadRemoteRef.current || !remoteComposition) return
    if (!authSession) {
      queueMicrotask(() =>
        optionsRef.current.setStatus("tg login required", "idle")
      )
      return
    }
    didLoadRemoteRef.current = true
    queueMicrotask(() => {
      void loadComposition(remoteComposition, false).then((loaded) => {
        if (!loaded) didLoadRemoteRef.current = false
      })
    })
  }, [authSession, loadComposition, remoteComposition])

  async function loadFromCode() {
    const composition = parseCompositionInput(loadCode)
    if (!composition) {
      options.setStatus("Paste bot edit link or compositionId token", "idle")
      return
    }
    await loadComposition(composition)
  }

  function selectComposition(item: UserCompositionItem) {
    setSelectedComposition({
      compositionId: item.compositionId,
      compositionToken: item.compositionToken,
    })
    void loadComposition({
      compositionId: item.compositionId,
      token: item.compositionToken,
      jigsawImageUrl: null,
    })
  }

  async function save(layout: CanvasLayout) {
    if (!remoteComposition) {
      options.setStatus("Open the link from the bot", "idle")
      return
    }
    if (!options.authSession) {
      options.setStatus("tg login required", "idle")
      return
    }
    options.setStatus("Saving edits...", "loading")
    try {
      const payload = await updateCompositionLayout(
        remoteComposition,
        options.authSession.token,
        layout
      )
      options.applyLayout(normalizeCanvasLayout(payload.layout))
      setRemoteComposition({
        compositionId: payload.compositionId,
        token: remoteComposition.token,
        jigsawImageUrl: payload.jigsawImageUrl,
      })
      options.setStatus("Edits saved", "success")
    } catch (error) {
      options.setStatus(
        error instanceof Error ? error.message : "Failed to save edits",
        "error"
      )
    }
  }

  async function render(layout: CanvasLayout) {
    if (!remoteComposition) {
      options.setStatus("No composition loaded", "idle")
      return
    }
    if (!options.authSession) {
      options.setStatus("tg login required", "idle")
      return
    }
    options.setStatus("Rendering image...", "loading")
    try {
      const payload = await renderComposition(
        remoteComposition,
        options.authSession.token,
        layout
      )
      setRemoteComposition({
        ...remoteComposition,
        jigsawImageUrl: payload.jigsawImageUrl,
      })
      window.open(payload.jigsawImageUrl, "_blank")
      options.setStatus("Image ready", "success")
    } catch (error) {
      options.setStatus(
        error instanceof Error ? error.message : "Failed to render image",
        "error"
      )
    }
  }

  function getCreateRoomUrl(layout: CanvasLayout) {
    if (!remoteComposition) return "/rooms/new"
    const params = new URLSearchParams({
      compositionId: remoteComposition.compositionId,
      compositionToken: remoteComposition.token,
      sourceWidth: String(layout.canvas.width),
      sourceHeight: String(layout.canvas.height),
    })
    return `/rooms/new?${params}`
  }

  return {
    remoteComposition,
    compositions,
    selectedComposition,
    loadCode,
    setLoadCode,
    loadFromCode,
    selectComposition,
    save,
    render,
    getCreateRoomUrl,
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}
