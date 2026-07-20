import type {
  ButtonHTMLAttributes,
  CSSProperties,
  DragEvent,
  MouseEvent,
  PointerEvent,
} from "react"
import { forwardRef, useCallback, useEffect, useRef, useState } from "react"

import { apiRoutes } from "@jigtable/shared/api-routes"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { API_BASE_URL } from "@/config"
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
} from "@/jigsaw-room/multiplayer/auth"
import {
  fetchUserCompositions,
  type UserCompositionItem,
} from "@/jigsaw-room/room-api"
import { readJsonResponse } from "@/lib/api-response"
import { cn } from "@/lib/utils"

import "./app.css"

type CanvasLayout = {
  canvas: {
    width: number
    height: number
  }
  items: CanvasItem[]
}

type CanvasItem = {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale?: number
  zIndex?: number
}

type ApiCompositionLayout = {
  compositionId: string
  status: string | null
  layout: CanvasLayout
  jigsawImageUrl: string | null
}

type RemoteComposition = {
  compositionId: string
  token: string
  jigsawImageUrl: string | null
}

type AspectRatioPreset = {
  label: string
  width: number
  height: number
}

type ResizeEdge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"

type DragState =
  | {
      mode: "move"
      ids: string[]
      startClientX: number
      startClientY: number
      startItems: CanvasItem[]
    }
  | {
      mode: "item-resize"
      id: string
      edge: ResizeEdge
      startClientX: number
      startClientY: number
      startItem: CanvasItem
      startItems: CanvasItem[]
      keepRatio: boolean
    }
  | {
      mode: "canvas-resize"
      edge: ResizeEdge
      startClientX: number
      startClientY: number
      startCanvas: CanvasLayout["canvas"]
      startItems: CanvasItem[]
      scaleItems: boolean
    }

type ResizeHandle = {
  edge: ResizeEdge
  label: string
  className: string
  indicatorClassName: string
  type: "edge" | "corner"
}

type LayerEntry = {
  item: CanvasItem
  itemIndex: number
  layerIndex: number
}

type LayerAction = "top" | "up" | "down" | "bottom"

type LayerDropPreview = {
  itemId: string
  placement: "above" | "below"
}

type HoverLinkLine = {
  itemIndex: number
  path: string
}

type ItemBounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const MIN_ITEM_SIZE = 32
const MIN_CANVAS_SIZE = 120
const MAX_CANVAS_SIZE = 2000
const DEFAULT_ZOOM = 42
const MOVE_DRAG_THRESHOLD = 4
const RESIZE_EDGE_HOVER_BORDER_CLASS = "border"
const RESIZE_CORNER_HOVER_BORDER_CLASS = "border"
const RESIZE_EDGE_SELECTED_BORDER_CLASS = "border-2"
const RESIZE_CORNER_SELECTED_BORDER_CLASS = "border-2"
const RESIZE_HANDLE_COLOR_CLASS =
  "border-[var(--image-marker)] bg-[var(--image-marker)]"
const IMAGE_MARKER_COUNT = 20

const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { label: "1:1", width: 1, height: 1 },
  { label: "4:5", width: 4, height: 5 },
  { label: "3:4", width: 3, height: 4 },
  { label: "4:3", width: 4, height: 3 },
  { label: "16:9", width: 16, height: 9 },
  { label: "9:16", width: 9, height: 16 },
]

const RESIZE_HANDLES: ResizeHandle[] = [
  {
    edge: "n",
    label: "Resize top edge",
    className: "-top-1.5 left-1/2 h-3 w-10 -translate-x-1/2 cursor-n-resize",
    indicatorClassName: "top-1 right-2 left-2 h-0.5",
    type: "edge",
  },
  {
    edge: "ne",
    label: "Resize top right corner",
    className: "-top-1.5 -right-1.5 size-3 cursor-nesw-resize",
    indicatorClassName: "top-0.5 right-0.5 size-2",
    type: "corner",
  },
  {
    edge: "e",
    label: "Resize right edge",
    className: "top-1/2 -right-1.5 h-10 w-3 -translate-y-1/2 cursor-e-resize",
    indicatorClassName: "top-2 bottom-2 left-1/2 w-0.5 -translate-x-1/2",
    type: "edge",
  },
  {
    edge: "se",
    label: "Resize bottom right corner",
    className: "-right-1.5 -bottom-1.5 size-3 cursor-nwse-resize",
    indicatorClassName: "right-0.5 bottom-0.5 size-2",
    type: "corner",
  },
  {
    edge: "s",
    label: "Resize bottom edge",
    className: "-bottom-1.5 left-1/2 h-3 w-10 -translate-x-1/2 cursor-s-resize",
    indicatorClassName: "right-2 bottom-1 left-2 h-0.5",
    type: "edge",
  },
  {
    edge: "sw",
    label: "Resize bottom left corner",
    className: "-bottom-1.5 -left-1.5 size-3 cursor-nesw-resize",
    indicatorClassName: "bottom-0.5 left-0.5 size-2",
    type: "corner",
  },
  {
    edge: "w",
    label: "Resize left edge",
    className: "top-1/2 -left-1.5 h-10 w-3 -translate-y-1/2 cursor-w-resize",
    indicatorClassName: "top-2 bottom-2 left-1/2 w-0.5 -translate-x-1/2",
    type: "edge",
  },
  {
    edge: "nw",
    label: "Resize top left corner",
    className: "-top-1.5 -left-1.5 size-3 cursor-nwse-resize",
    indicatorClassName: "top-0.5 left-0.5 size-2",
    type: "corner",
  },
]

const EMPTY_LAYOUT: CanvasLayout = {
  canvas: {
    width: 1200,
    height: 800,
  },
  items: [],
}

export function App() {
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<CanvasLayout>(EMPTY_LAYOUT)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [status, setStatus] = useState("Open the link from the bot")
  const [loadCode, setLoadCode] = useState("")
  const [draggedLayerId, setDraggedLayerId] = useState("")
  const [hoverLinkItemId, setHoverLinkItemId] = useState("")
  const [hoverLinkLine, setHoverLinkLine] = useState<HoverLinkLine | null>(null)
  const [showCanvasMarkers, setShowCanvasMarkers] = useState(true)
  const [layerDropPreview, setLayerDropPreview] =
    useState<LayerDropPreview | null>(null)
  const [originalCanvas, setOriginalCanvas] = useState<CanvasLayout["canvas"]>(
    EMPTY_LAYOUT.canvas
  )
  const [remoteComposition, setRemoteComposition] =
    useState<RemoteComposition | null>(() => getInitialRemoteComposition())
  const [compositions, setCompositions] = useState<UserCompositionItem[]>([])
  const [selectedComposition, setSelectedComposition] = useState<{
    compositionId: string
    compositionToken: string
  } | null>(null)
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    readLocalAuthSession()
  )
  const [authStatus, setAuthStatus] = useState(() =>
    readLocalAuthSession() ? "checking tg session..." : "tg login required"
  )
  const [authLoading, setAuthLoading] = useState(false)
  const [telegramWidgetVisible, setTelegramWidgetVisible] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const didLoadRemoteRef = useRef(false)
  const canvasItemRefs = useRef(new Map<string, HTMLElement>())
  const layerActionRefs = useRef(new Map<string, HTMLButtonElement>())
  const layerRowRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingLayerFocusRef = useRef<{
    itemId: string
    action: LayerAction
  } | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const pastRef = useRef<CanvasLayout[]>([])
  const futureRef = useRef<CanvasLayout[]>([])
  const dragStartLayoutRef = useRef<CanvasLayout | null>(null)

  const pushHistory = useCallback(() => {
    pastRef.current.push(structuredClone(layoutRef.current))

    if (pastRef.current.length > 200) {
      pastRef.current.shift()
    }

    futureRef.current.length = 0
  }, [])

  const recordLayoutChange = useCallback(
    (next: CanvasLayout | ((prev: CanvasLayout) => CanvasLayout)) => {
      pushHistory()
      setLayout(next)
    },
    [pushHistory]
  )

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()

    if (!prev) {
      return
    }

    futureRef.current.push(structuredClone(layoutRef.current))
    setLayout(prev)
    setStatus("Undo")
  }, [])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()

    if (!next) {
      return
    }

    pastRef.current.push(structuredClone(layoutRef.current))
    setLayout(next)
    setStatus("Redo")
  }, [])

  const zoomRef = useRef(zoom / 100)
  const selectedId = selectedIds[0] ?? ""
  const selectedIdSet = new Set(selectedIds)
  const selectedItem = layout.items.find((item) => item.id === selectedId)
  const selectedIndex = layout.items.findIndex((item) => item.id === selectedId)
  const selectedItems = layout.items.filter((item) =>
    selectedIdSet.has(item.id)
  )
  const layerEntries = getLayerEntries(layout.items)
  const layerListEntries = [...layerEntries].reverse()
  const layerIndexById = new Map(
    layerEntries.map((entry) => [entry.item.id, entry.layerIndex])
  )
  const viewportScale = zoom / 100
  const activeRatio = getCanvasRatioLabel(layout.canvas, originalCanvas)
  const canvasMaxSide = Math.max(layout.canvas.width, layout.canvas.height)
  const getHoverLinkLine = useCallback(
    (itemId: string): HoverLinkLine | null => {
      const row = layerRowRefs.current.get(itemId)
      const item = canvasItemRefs.current.get(itemId)
      const itemIndex = layout.items.findIndex((item) => item.id === itemId)

      if (!row || !item || itemIndex < 0) {
        return null
      }

      return {
        itemIndex,
        path: getConnectorPath(
          row.getBoundingClientRect(),
          item.getBoundingClientRect()
        ),
      }
    },
    [layout.items]
  )

  const applyCompositionLayout = useCallback(
    (payload: ApiCompositionLayout, token: string) => {
      const layout = normalizeCanvasLayout(payload.layout)
      const firstItemId = layout.items[0]?.id ?? ""

      setLayout(layout)
      setSelectedIds(firstItemId ? [firstItemId] : [])
      setRemoteComposition({
        compositionId: payload.compositionId,
        token,
        jigsawImageUrl: payload.jigsawImageUrl,
      })
    },
    []
  )

  const saveRemoteLayout = useCallback(async () => {
    if (!remoteComposition) {
      setStatus("Open the link from the bot")
      return
    }

    if (!authSession) {
      setStatus("tg login required")
      return
    }

    setStatus("Saving edits...")

    try {
      const payload = await requestCompositionLayout(
        remoteComposition,
        authSession.token,
        "PATCH",
        { layout }
      )

      applyCompositionLayout(payload, remoteComposition.token)
      setStatus("Edits saved")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save edits")
    }
  }, [authSession, layout, remoteComposition, applyCompositionLayout])

  const applyRemoteComposition = useCallback(
    async (composition: RemoteComposition) => {
      if (!authSession) {
        setStatus("tg login required")
        return
      }

      setStatus("Loading images...")

      try {
        const payload = await fetchCompositionLayout(
          composition,
          authSession.token
        )
        const layout = normalizeCanvasLayout(payload.layout)

        setOriginalCanvas(layout.canvas)
        setLayout(layout)
        selectOnlyItem(layout.items[0]?.id ?? "")
        setRemoteComposition({
          compositionId: payload.compositionId,
          token: composition.token,
          jigsawImageUrl: payload.jigsawImageUrl,
        })
        window.history.replaceState(
          null,
          "",
          `?compositionId=${encodeURIComponent(payload.compositionId)}&token=${encodeURIComponent(composition.token)}`
        )
        setStatus("Ready to edit")
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to load images"
        )
      }
    },
    [authSession]
  )

  useEffect(() => {
    zoomRef.current = viewportScale
  }, [viewportScale])

  useEffect(() => {
    if (!hoverLinkItemId) {
      return
    }

    let animationFrame = 0
    const updateHoverLink = () => {
      animationFrame = 0
      setHoverLinkLine(getHoverLinkLine(hoverLinkItemId))
    }
    const scheduleHoverLinkUpdate = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateHoverLink)
      }
    }

    scheduleHoverLinkUpdate()
    window.addEventListener("resize", scheduleHoverLinkUpdate)
    window.addEventListener("scroll", scheduleHoverLinkUpdate, true)

    return () => {
      window.removeEventListener("resize", scheduleHoverLinkUpdate)
      window.removeEventListener("scroll", scheduleHoverLinkUpdate, true)

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [getHoverLinkLine, hoverLinkItemId, viewportScale])

  useEffect(() => {
    const pending = pendingLayerFocusRef.current

    if (!pending) {
      return
    }

    pendingLayerFocusRef.current = null

    const row = layerRowRefs.current.get(pending.itemId)
    const action = layerActionRefs.current.get(
      getLayerActionKey(pending.itemId, pending.action)
    )

    row?.scrollIntoView({ block: "nearest" })

    if (action && !action.disabled) {
      action.focus({ preventScroll: true })
      return
    }

    row
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true })
  })

  useEffect(() => {
    const saved = readLocalAuthSession()

    if (!saved) {
      return
    }

    let disposed = false

    void fetchAuthMe(saved.token)
      .then((session) => {
        if (disposed) {
          return
        }

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
        if (!disposed) {
          setAuthLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!authSession) {
      return
    }

    let disposed = false

    void fetchUserCompositions(authSession.token)
      .then((items) => {
        if (disposed) {
          return
        }

        setCompositions(items)

        if (!remoteComposition && !selectedComposition && items[0]) {
          const first = items[0]

          setSelectedComposition({
            compositionId: first.compositionId,
            compositionToken: first.compositionToken,
          })
          void applyRemoteComposition({
            compositionId: first.compositionId,
            token: first.compositionToken,
            jigsawImageUrl: null,
          })
        }
      })
      .catch((error) => {
        if (!disposed) {
          setStatus(readErrorMessage(error))
        }
      })

    return () => {
      disposed = true
    }
  }, [
    authSession,
    applyRemoteComposition,
    remoteComposition,
    selectedComposition,
  ])

  useEffect(() => {
    const host = telegramWidgetRef.current
    const botUsername = getTelegramBotUsername()

    if (!telegramWidgetVisible || !host || !botUsername) {
      return
    }

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
  }, [telegramWidgetVisible])

  useEffect(() => {
    if (didLoadRemoteRef.current || !remoteComposition) {
      return
    }

    if (!authSession) {
      queueMicrotask(() => setStatus("tg login required"))
      return
    }

    didLoadRemoteRef.current = true
    queueMicrotask(() => setStatus("Loading images..."))

    void fetchCompositionLayout(remoteComposition, authSession.token)
      .then((payload) => {
        const layout = normalizeCanvasLayout(payload.layout)

        setOriginalCanvas(layout.canvas)
        setLayout(layout)
        selectOnlyItem(layout.items[0]?.id ?? "")
        setRemoteComposition({
          compositionId: payload.compositionId,
          token: remoteComposition.token,
          jigsawImageUrl: payload.jigsawImageUrl,
        })
        setStatus("Ready to edit")
      })
      .catch((error: unknown) => {
        didLoadRemoteRef.current = false
        setStatus(
          error instanceof Error ? error.message : "Failed to load images"
        )
      })
  }, [authSession, remoteComposition])

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current

      if (!drag) {
        return
      }

      event.preventDefault()

      const clientDx = event.clientX - drag.startClientX
      const clientDy = event.clientY - drag.startClientY

      if (
        drag.mode === "move" &&
        Math.hypot(clientDx, clientDy) < MOVE_DRAG_THRESHOLD
      ) {
        return
      }

      const dx = clientDx / zoomRef.current
      const dy = clientDy / zoomRef.current

      if (drag.mode === "canvas-resize") {
        setLayout(() => resizeCanvasLayout(drag, dx, dy))
        return
      }

      setLayout((current) => {
        if (drag.mode === "move") {
          const movedItems = moveItemsWithinCanvas(
            drag.startItems,
            current.canvas,
            dx,
            dy
          )
          const movedItemById = new Map(
            movedItems.map((item) => [item.id, item])
          )

          return {
            ...current,
            items: current.items.map(
              (item) => movedItemById.get(item.id) ?? item
            ),
          }
        }

        if (drag.startItems.length > 1) {
          const resizedItems = resizeItemsFromEdge(
            drag.startItems,
            current.canvas,
            dx,
            dy,
            drag.edge,
            event.shiftKey || drag.keepRatio
          )
          const resizedItemById = new Map(
            resizedItems.map((item) => [item.id, item])
          )

          return {
            ...current,
            items: current.items.map(
              (item) => resizedItemById.get(item.id) ?? item
            ),
          }
        }

        return {
          ...current,
          items: current.items.map((item) => {
            if (item.id !== drag.id) {
              return item
            }

            return resizeItemFromEdge(
              drag.startItem,
              current.canvas,
              dx,
              dy,
              drag.edge,
              event.shiftKey || drag.keepRatio
            )
          }),
        }
      })
    }

    const handlePointerUp = () => {
      if (dragRef.current && dragStartLayoutRef.current) {
        const startLayout = dragStartLayoutRef.current
        const currentLayout = layoutRef.current
        const changed =
          startLayout.canvas !== currentLayout.canvas ||
          startLayout.items !== currentLayout.items
        if (changed) {
          pastRef.current.push(startLayout)
          if (pastRef.current.length > 200) pastRef.current.shift()
          futureRef.current.length = 0
        }
      }
      dragRef.current = null
      dragStartLayoutRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        void saveRemoteLayout()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (event.key === "Escape") {
        if (isEditableTarget(event.target)) {
          ;(event.target as HTMLElement).blur()
        }

        clearSelection()
        setStatus("Selection cleared")
        return
      }

      if (!selectedIds.length || isEditableTarget(event.target)) {
        return
      }

      const keyOffset = getArrowOffset(event.key, event.shiftKey ? 10 : 1)

      if (!keyOffset) {
        return
      }

      event.preventDefault()
      recordLayoutChange((current) => {
        const selectedIdSet = new Set(selectedIds)
        const movedItems = moveItemsWithinCanvas(
          current.items.filter((item) => selectedIdSet.has(item.id)),
          current.canvas,
          keyOffset.x,
          keyOffset.y
        )
        const movedItemById = new Map(movedItems.map((item) => [item.id, item]))

        return {
          ...current,
          items: current.items.map(
            (item) => movedItemById.get(item.id) ?? item
          ),
        }
      })
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [recordLayoutChange, saveRemoteLayout, selectedIds, redo, undo])

  function clearSelection() {
    setSelectedIds([])
  }

  function selectOnlyItem(itemId: string) {
    setSelectedIds(itemId ? [itemId] : [])
  }

  function focusItem(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? [itemId, ...current.filter((id) => id !== itemId)]
        : [itemId]
    )
  }

  function selectItem(itemId: string, mode: "add" | "replace" | "toggle") {
    if (mode === "replace") {
      selectOnlyItem(itemId)
      return
    }

    setSelectedIds((current) => {
      if (mode === "add") {
        return [itemId, ...current.filter((id) => id !== itemId)]
      }

      if (current.includes(itemId)) {
        return current.filter((id) => id !== itemId)
      }

      return [itemId, ...current]
    })
  }

  function getSelectionMode(
    event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">
  ) {
    if (event.ctrlKey || event.metaKey) {
      return "toggle"
    }

    if (event.shiftKey) {
      return "add"
    }

    return "replace"
  }

  function setLayerActionRef(itemId: string, action: LayerAction) {
    return (node: HTMLButtonElement | null) => {
      const key = getLayerActionKey(itemId, action)

      if (node) {
        layerActionRefs.current.set(key, node)
        return
      }

      layerActionRefs.current.delete(key)
    }
  }

  function setLayerRowRef(itemId: string) {
    return (node: HTMLDivElement | null) => {
      if (node) {
        layerRowRefs.current.set(itemId, node)
        return
      }

      layerRowRefs.current.delete(itemId)
    }
  }

  function setCanvasItemRef(itemId: string) {
    return (node: HTMLElement | null) => {
      if (node) {
        canvasItemRefs.current.set(itemId, node)
        return
      }

      canvasItemRefs.current.delete(itemId)
    }
  }

  function startLayerDrag(event: DragEvent<HTMLElement>, itemId: string) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", itemId)
    setDraggedLayerId(itemId)
    focusItem(itemId)
    setStatus("Drag layer")
  }

  function endLayerDrag() {
    setDraggedLayerId("")
    setLayerDropPreview(null)
  }

  function overLayerDropTarget(
    event: DragEvent<HTMLDivElement>,
    targetItemId: string
  ) {
    if (!draggedLayerId) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setLayerDropPreview({
      itemId: targetItemId,
      placement: getLayerDropPlacement(event),
    })
  }

  function leaveLayerDropTarget(
    event: DragEvent<HTMLDivElement>,
    targetItemId: string
  ) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setLayerDropPreview((current) =>
      current?.itemId === targetItemId ? null : current
    )
  }

  function dropLayerOn(event: DragEvent<HTMLDivElement>, targetItemId: string) {
    event.preventDefault()
    setLayerDropPreview(null)

    const sourceItemId =
      draggedLayerId || event.dataTransfer.getData("text/plain")

    if (!sourceItemId || sourceItemId === targetItemId) {
      setDraggedLayerId("")
      return
    }

    reorderItemLayer(sourceItemId, targetItemId, getLayerDropPlacement(event))
    setDraggedLayerId("")
  }

  function startMove(event: PointerEvent<HTMLElement>, item: CanvasItem) {
    if (!isPrimaryPointer(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const wasSelected = selectedIdSet.has(item.id)
    const selectionMode = getSelectionMode(event)

    if (selectionMode !== "replace") {
      selectItem(item.id, selectionMode)
      setStatus("Selection updated")
      return
    }

    if (!wasSelected) {
      selectOnlyItem(item.id)
      setStatus("Image selected. Drag selected image to move")
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const startItems = selectedItems.length ? selectedItems : [item]

    focusItem(item.id)

    setStatus(
      startItems.length > 1 ? `Drag ${startItems.length} images` : "Drag image"
    )
    dragRef.current = {
      ids: startItems.map((item) => item.id),
      mode: "move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startItems,
    }
    dragStartLayoutRef.current = structuredClone(layoutRef.current)
  }

  function startItemResize(
    event: PointerEvent<Element>,
    item: CanvasItem,
    edge: ResizeEdge
  ) {
    if (!isPrimaryPointer(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startItems = selectedIdSet.has(item.id) ? selectedItems : [item]

    if (selectedIdSet.has(item.id)) {
      focusItem(item.id)
    } else {
      selectOnlyItem(item.id)
    }
    setStatus(
      startItems.length > 1
        ? `Resize ${startItems.length} images. Shift keeps group ratio`
        : "Resize image. Shift keeps corner ratio"
    )
    dragRef.current = {
      id: item.id,
      edge,
      mode: "item-resize",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startItem: item,
      startItems,
      keepRatio: event.shiftKey,
    }
    dragStartLayoutRef.current = structuredClone(layoutRef.current)
  }

  function startCanvasResize(event: PointerEvent<Element>, edge: ResizeEdge) {
    if (!isPrimaryPointer(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const scaleItems = !event.ctrlKey && !event.metaKey
    clearSelection()
    setStatus(scaleItems ? "Resize canvas and images" : "Resize canvas only")
    dragRef.current = {
      edge,
      mode: "canvas-resize",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCanvas: layout.canvas,
      startItems: layout.items,
      scaleItems,
    }
    dragStartLayoutRef.current = structuredClone(layoutRef.current)
  }

  function updateCanvasSize(field: "width" | "height", value: number) {
    recordLayoutChange((current) => {
      const canvas = {
        ...current.canvas,
        [field]: clampCanvasSize(value),
      }
      const nextCanvas = clampCanvas(canvas)

      return {
        canvas: nextCanvas,
        items: scaleItemsToCanvas(current.canvas, current.items, nextCanvas),
      }
    })
  }

  function applyCanvasSize(canvas: CanvasLayout["canvas"], message: string) {
    const nextCanvas = clampCanvas(canvas)

    recordLayoutChange((current) => ({
      canvas: nextCanvas,
      items: scaleItemsToCanvas(current.canvas, current.items, nextCanvas),
    }))
    clearSelection()
    setStatus(message)
  }

  function updateCanvasScale(maxSide: number) {
    applyCanvasSize(
      getCanvasForMaxSide(layout.canvas, maxSide),
      "Canvas size updated"
    )
  }

  function applyAspectRatioPreset(preset: AspectRatioPreset) {
    const canvas = getCanvasForRatio(
      layout.canvas,
      preset.width / preset.height
    )
    applyCanvasSize(canvas, `Canvas ratio ${preset.label}`)
  }

  function restoreOriginalCanvas() {
    applyCanvasSize(originalCanvas, "original canvas ratio")
  }

  function moveItemLayer(
    itemId: string,
    direction: -1 | 1,
    action: LayerAction
  ) {
    const layerIndex = layerIndexById.get(itemId)

    if (layerIndex === undefined) {
      return
    }

    moveItemLayerTo(
      itemId,
      layerIndex + direction,
      direction > 0 ? "Layer raised" : "Layer lowered",
      action
    )
  }

  function moveItemLayerTo(
    itemId: string,
    targetLayerIndex: number,
    message: string,
    action: LayerAction
  ) {
    const layerIndex = layerIndexById.get(itemId)

    if (layerIndex === undefined) {
      return
    }

    focusItem(itemId)

    if (targetLayerIndex < 0 || targetLayerIndex >= layout.items.length) {
      return
    }

    pendingLayerFocusRef.current = { itemId, action }

    recordLayoutChange((current) => {
      const currentEntries = getLayerEntries(current.items)
      const fromIndex = currentEntries.findIndex(
        (entry) => entry.item.id === itemId
      )

      if (fromIndex < 0) {
        return current
      }

      const nextIndex = clamp(targetLayerIndex, 0, currentEntries.length - 1)
      const nextEntries = [...currentEntries]
      const [entry] = nextEntries.splice(fromIndex, 1)

      nextEntries.splice(nextIndex, 0, entry)

      const nextZIndexById = new Map(
        nextEntries.map((entry, index) => [entry.item.id, index])
      )

      return {
        ...current,
        items: current.items.map((item, index) => ({
          ...item,
          zIndex: nextZIndexById.get(item.id) ?? index,
        })),
      }
    })
    setStatus(message)
  }

  function reorderItemLayer(
    itemId: string,
    targetItemId: string,
    placement: "above" | "below"
  ) {
    focusItem(itemId)

    recordLayoutChange((current) => {
      const currentEntries = getLayerEntries(current.items)
      const sourceIndex = currentEntries.findIndex(
        (entry) => entry.item.id === itemId
      )

      if (sourceIndex < 0) {
        return current
      }

      const nextEntries = [...currentEntries]
      const [entry] = nextEntries.splice(sourceIndex, 1)
      const targetIndex = nextEntries.findIndex(
        (entry) => entry.item.id === targetItemId
      )

      if (targetIndex < 0) {
        return current
      }

      const insertIndex = placement === "above" ? targetIndex + 1 : targetIndex

      nextEntries.splice(insertIndex, 0, entry)

      const nextZIndexById = new Map(
        nextEntries.map((entry, index) => [entry.item.id, index])
      )

      return {
        ...current,
        items: current.items.map((item, index) => ({
          ...item,
          zIndex: nextZIndexById.get(item.id) ?? index,
        })),
      }
    })
    setStatus("Layer reordered")
  }

  async function loginWithTelegram(): Promise<void> {
    if (!hasTelegramWebAppInitData()) {
      if (!getTelegramBotUsername()) {
        setAuthStatus(
          "Set VITE_TELEGRAM_BOT_USERNAME to bot username ending with bot"
        )
        return
      }

      const widgetBlocker = getTelegramLoginWidgetBlocker()

      if (widgetBlocker) {
        setAuthStatus(widgetBlocker)
        return
      }

      setTelegramWidgetVisible(true)
      setAuthStatus("confirm in tg widget")
      return
    }

    setAuthLoading(true)
    setAuthStatus("tg webapp login...")

    try {
      const session = await loginTelegramWebApp()

      setAuthSession(session)
      setAuthStatus("tg linked")
    } catch (error) {
      setAuthStatus(readErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function loginWithTelegramWidget(
    payload: Record<string, unknown>
  ): Promise<void> {
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
  }

  async function loadLayoutFromCode() {
    const composition = parseRemoteCompositionInput(loadCode)

    if (!composition) {
      setStatus("Paste bot edit link or compositionId token")
      return
    }

    await applyRemoteComposition(composition)
  }

  function selectComposition(composition: UserCompositionItem) {
    setSelectedComposition({
      compositionId: composition.compositionId,
      compositionToken: composition.compositionToken,
    })
    void applyRemoteComposition({
      compositionId: composition.compositionId,
      token: composition.compositionToken,
      jigsawImageUrl: null,
    })
  }

  function updateSelectedItem(patch: Partial<CanvasItem>) {
    if (!selectedItem) {
      return
    }

    recordLayoutChange((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== selectedItem.id) {
          return item
        }

        return clampItem(
          updateScale({ ...item, ...patch }, item),
          current.canvas
        )
      }),
    }))
  }

  function jigsawCreateFromComposition(): string {
    if (!remoteComposition) return "/rooms/new"
    const params = new URLSearchParams({
      compositionId: remoteComposition.compositionId,
      compositionToken: remoteComposition.token,
      sourceWidth: String(layout.canvas.width),
      sourceHeight: String(layout.canvas.height),
    })
    return `/rooms/new?${params}`
  }

  async function downloadImage(): Promise<void> {
    if (!remoteComposition) {
      setStatus("No composition loaded")
      return
    }

    if (!authSession) {
      setStatus("tg login required")
      return
    }

    setStatus("Rendering image...")

    try {
      const response = await fetch(
        `${API_BASE_URL}${apiRoutes.compositions.post.render.build(remoteComposition.compositionId)}?editToken=${encodeURIComponent(remoteComposition.token)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authSession.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ format: "png", layout }),
        }
      )
      const payload = await readJsonResponse<{ jigsawImageUrl: string }>(
        response
      )

      setRemoteComposition({
        ...remoteComposition,
        jigsawImageUrl: payload.jigsawImageUrl,
      })
      window.open(payload.jigsawImageUrl, "_blank")
      setStatus("Image ready")
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to render image"
      )
    }
  }

  if (remoteComposition && !authSession) {
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
            This edit link is private. Sign in with the Telegram account that
            owns this composition to view or change it.
          </p>
          <div className="editor-auth-gate__actions">
            <Button
              disabled={authLoading}
              size="lg"
              onClick={() => void loginWithTelegram()}
            >
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

  return (
    <main className="jigsaw-editor">
      {hoverLinkItemId && hoverLinkLine ? (
        <svg
          aria-hidden="true"
          className="jigsaw-editor__link-line"
          style={getImageMarkerStyle(hoverLinkLine.itemIndex)}
        >
          <path
            d={hoverLinkLine.path}
            fill="none"
            stroke="var(--image-marker)"
            strokeDasharray="4 4"
            strokeLinecap="square"
            strokeOpacity="0.85"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}

      {/* header */}
      <header className="editor-header glass corner-brackets">
        <div className="editor-header__brand">
          <span className="editor-header__kicker">workspace / editor</span>
          <div className="editor-header__heading">
            <h1 className="editor-header__title">composition editor</h1>
            <p className="editor-header__meta">
              {layout.items.length
                ? `${String(layout.items.length).padStart(2, "0")} images`
                : "no images"}
            </p>
          </div>
        </div>

        <div className="editor-header__content">
          <section
            className="editor-header__group editor-header__source"
            aria-label="Composition source"
          >
            {compositions.length ? (
              <Select
                value={selectedComposition?.compositionId ?? ""}
                disabled={!authSession}
                onValueChange={(value) => {
                  const composition = compositions.find(
                    (item) => item.compositionId === value
                  )

                  if (composition) {
                    selectComposition(composition)
                  }
                }}
              >
                <SelectTrigger className="editor-header__select">
                  <SelectValue placeholder="select build">
                    {selectedComposition
                      ? formatCompositionTitle(
                          compositions.find(
                            (item) =>
                              item.compositionId ===
                              selectedComposition.compositionId
                          ) ?? null
                        )
                      : "Select build"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {compositions.map((composition, index) => (
                    <SelectItem
                      key={composition.compositionId}
                      value={composition.compositionId}
                    >
                      {String(index + 1).padStart(2, "0")} ·{" "}
                      {composition.imageCount} images ·{" "}
                      {formatCompositionMeta(composition)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <div className="editor-header__load">
              <Input
                className="editor-header__input"
                placeholder="paste bot link or code"
                type="text"
                value={loadCode}
                onChange={(event) => setLoadCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void loadLayoutFromCode()
                  }
                }}
              />
              <Button
                className="editor-header__control"
                disabled={!authSession}
                size="sm"
                variant="secondary"
                onClick={() => void loadLayoutFromCode()}
              >
                load
              </Button>
            </div>
          </section>

          <section
            className="editor-header__group editor-header__account"
            aria-label="Account"
          >
            <Button
              className="editor-header__control"
              disabled={authLoading}
              size="sm"
              variant={authSession ? "ghost" : "default"}
              onClick={() => void loginWithTelegram()}
            >
              {authLoading
                ? "Loading..."
                : authSession
                  ? "tg linked"
                  : "tg login"}
            </Button>
            <span
              className={cn(
                "editor-header__auth-status",
                !authSession?.user.displayName &&
                  "editor-header__auth-status--mono"
              )}
            >
              {authSession?.user.displayName ?? authStatus}
            </span>
            {telegramWidgetVisible ? (
              <div
                ref={telegramWidgetRef}
                className="editor-header__telegram-widget"
              />
            ) : null}
          </section>

          <section
            className="editor-header__group editor-header__outputs"
            aria-label="Composition actions"
          >
            <Button
              className="editor-header__control"
              disabled={!remoteComposition || !authSession}
              size="sm"
              onClick={saveRemoteLayout}
            >
              save edits
            </Button>

            {remoteComposition ? (
              <Button asChild size="sm" variant="secondary">
                <a href={jigsawCreateFromComposition()}>create room</a>
              </Button>
            ) : null}

            {remoteComposition ? (
              <Button
                disabled={!authSession}
                size="sm"
                variant="ghost"
                onClick={downloadImage}
              >
                download
              </Button>
            ) : null}
          </section>
        </div>
      </header>

      <div className="editor-workspace">
        {/* left sidebar layers */}
        <aside className="layers-panel glass-sidebar corner-brackets">
          <PanelHeader title="layers" meta="Drag to reorder" />
          <div className="layers-panel__list thin-scrollbar">
            {layerListEntries.map(({ item, itemIndex, layerIndex }) => {
              const isSelected = selectedIdSet.has(item.id)
              const isLinked = hoverLinkItemId === item.id
              const imageLabel = getImageAriaLabel(itemIndex)
              const isBottomLayer = layerIndex === 0
              const isTopLayer = layerIndex === layout.items.length - 1
              const dropPlacement =
                layerDropPreview?.itemId === item.id
                  ? layerDropPreview.placement
                  : null

              return (
                <div
                  key={item.id}
                  draggable
                  ref={setLayerRowRef(item.id)}
                  className={cn(
                    "layer-row",
                    draggedLayerId === item.id && "layer-row--dragging",
                    (isSelected || isLinked) && "layer-row--active"
                  )}
                  style={getImageMarkerStyle(itemIndex)}
                  onDragEnd={endLayerDrag}
                  onDragLeave={(event) => leaveLayerDropTarget(event, item.id)}
                  onDragOver={(event) => overLayerDropTarget(event, item.id)}
                  onDragStart={(event) => startLayerDrag(event, item.id)}
                  onDrop={(event) => dropLayerOn(event, item.id)}
                  onPointerEnter={() => setHoverLinkItemId(item.id)}
                  onPointerLeave={() => setHoverLinkItemId("")}
                >
                  {dropPlacement ? (
                    <span
                      className={cn(
                        "layer-row__drop-indicator",
                        dropPlacement === "above"
                          ? "layer-row__drop-indicator--above"
                          : "layer-row__drop-indicator--below"
                      )}
                    />
                  ) : null}
                  <button
                    className="layer-row__summary"
                    type="button"
                    onClick={(event) =>
                      selectItem(item.id, getSelectionMode(event))
                    }
                  >
                    <span className="layer-row__marker">
                      {getImageMarkerCode(itemIndex)}
                    </span>
                    <span className="layer-row__label">
                      layer {layerIndex + 1} / {layout.items.length}
                    </span>
                    <span className="layer-row__dimensions">
                      {item.width}x{item.height}
                    </span>
                  </button>

                  <div className="layer-row__actions">
                    <LayerActionButton
                      aria-label={`Move ${imageLabel} to top layer`}
                      disabled={isTopLayer}
                      ref={setLayerActionRef(item.id, "top")}
                      onClick={() =>
                        moveItemLayerTo(
                          item.id,
                          layout.items.length - 1,
                          "Layer moved to top",
                          "top"
                        )
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 4h14M12 20V8M6 12l6-6 6 6" />
                      </svg>
                    </LayerActionButton>
                    <LayerActionButton
                      aria-label={`Raise ${imageLabel}`}
                      disabled={isTopLayer}
                      ref={setLayerActionRef(item.id, "up")}
                      onClick={() => moveItemLayer(item.id, 1, "up")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </LayerActionButton>
                    <LayerActionButton
                      aria-label={`Lower ${imageLabel}`}
                      disabled={isBottomLayer}
                      ref={setLayerActionRef(item.id, "down")}
                      onClick={() => moveItemLayer(item.id, -1, "down")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </svg>
                    </LayerActionButton>
                    <LayerActionButton
                      aria-label={`Move ${imageLabel} to bottom layer`}
                      disabled={isBottomLayer}
                      ref={setLayerActionRef(item.id, "bottom")}
                      onClick={() =>
                        moveItemLayerTo(
                          item.id,
                          0,
                          "Layer moved to bottom",
                          "bottom"
                        )
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 4v12M6 12l6 6 6-6M5 20h14" />
                      </svg>
                    </LayerActionButton>
                  </div>
                </div>
              )
            })}
            {!layout.items.length ? (
              <p className="layers-panel__empty">
                Open the link from the bot after sending and committing images.
              </p>
            ) : null}
          </div>
        </aside>

        {/* canvas */}
        <section className="canvas-stage">
          <div className="canvas-stage__scroll thin-scrollbar">
            <div
              className="canvas-frame group"
              style={{
                width: layout.canvas.width * viewportScale,
                height: layout.canvas.height * viewportScale,
                ...getCanvasMarkerStyle(),
              }}
            >
              <div
                className="canvas-frame__resize-layer"
                data-resize-target="canvas"
              >
                <ResizeHandles
                  active={false}
                  labelPrefix="Canvas"
                  variant="canvas"
                  onPointerDown={(event, edge) =>
                    startCanvasResize(event, edge)
                  }
                />
              </div>

              <div
                className="canvas-board canvas-grid"
                onPointerDown={(event) => {
                  if (isPrimaryPointer(event)) {
                    clearSelection()
                  }
                }}
              >
                {layout.items.map((item, index) => {
                  const isSelected = selectedIdSet.has(item.id)
                  const isLinked = hoverLinkItemId === item.id

                  return (
                    <article
                      key={item.id}
                      ref={setCanvasItemRef(item.id)}
                      className="canvas-item group"
                      style={{
                        left: item.x * viewportScale,
                        top: item.y * viewportScale,
                        width: item.width * viewportScale,
                        height: item.height * viewportScale,
                        zIndex: (layerIndexById.get(item.id) ?? index) + 1,
                        ...getImageMarkerStyle(index),
                      }}
                      onPointerEnter={() => setHoverLinkItemId(item.id)}
                      onPointerLeave={() => setHoverLinkItemId("")}
                      onPointerDown={(event) => {
                        setHoverLinkItemId(item.id)
                        startMove(event, item)
                      }}
                    >
                      {showCanvasMarkers || isLinked ? (
                        <span className="canvas-item__marker">
                          {getImageMarkerCode(index)}
                        </span>
                      ) : null}
                      <div className="canvas-item__media">
                        <div className="canvas-item__placeholder">
                          <span className="canvas-item__placeholder-code">
                            {getImageMarkerCode(index)}
                          </span>
                        </div>
                        <img
                          alt={getImageAriaLabel(index)}
                          className="canvas-item__image"
                          crossOrigin="anonymous"
                          draggable={false}
                          src={item.src}
                          onError={(event) => {
                            event.currentTarget.style.display = "none"
                          }}
                          onLoad={(event) => {
                            event.currentTarget.style.display = "block"
                          }}
                        />
                      </div>
                      <span
                        className={cn(
                          "canvas-item__outline",
                          (isSelected || isLinked) &&
                            "canvas-item__outline--visible"
                        )}
                      />
                    </article>
                  )
                })}

                {layout.items.map((item, index) => {
                  const isSelected = selectedIdSet.has(item.id)
                  const isLinked = hoverLinkItemId === item.id

                  return (
                    <div
                      key={`${item.id}-handles`}
                      className="canvas-item__handles"
                      style={{
                        left: item.x * viewportScale,
                        top: item.y * viewportScale,
                        width: item.width * viewportScale,
                        height: item.height * viewportScale,
                        zIndex: isSelected ? 1500 : isLinked ? 1100 : 1000,
                        ...getImageMarkerStyle(index),
                      }}
                    >
                      <ResizeHandles
                        active={isSelected || isLinked}
                        labelPrefix={getImageAriaLabel(index)}
                        selected={isSelected}
                        onPointerDown={(event, edge) =>
                          startItemResize(event, item, edge)
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* right sidebar properties */}
        <aside className="properties-panel glass-sidebar corner-brackets">
          {/* canvas section */}
          <section className="properties-panel__section">
            <PanelHeader title="canvas" meta="Ctrl drag keeps images" />
            <div className="properties-panel__content">
              <div className="properties-panel__fields">
                <NumberField
                  label="Width"
                  value={layout.canvas.width}
                  onChange={(value) => updateCanvasSize("width", value)}
                />
                <NumberField
                  label="Height"
                  value={layout.canvas.height}
                  onChange={(value) => updateCanvasSize("height", value)}
                />
              </div>

              <div className="properties-panel__slider-group">
                <SliderField
                  label="View zoom"
                  max={140}
                  min={18}
                  value={zoom}
                  valueLabel={`${zoom}%`}
                  onChange={(value) => setZoom(value)}
                />
                <SliderField
                  label="Canvas scale"
                  max={MAX_CANVAS_SIZE}
                  min={MIN_CANVAS_SIZE}
                  value={canvasMaxSide}
                  valueLabel={`${canvasMaxSide}px`}
                  onChange={updateCanvasScale}
                />
              </div>

              <div className="properties-panel__ratio">
                <p className="properties-panel__label">aspect ratio</p>
                <div className="properties-panel__ratio-grid">
                  <Button
                    className="properties-panel__ratio-button"
                    size="sm"
                    variant={activeRatio === "original" ? "default" : "outline"}
                    onClick={restoreOriginalCanvas}
                  >
                    original
                  </Button>
                  {ASPECT_RATIO_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      className="properties-panel__ratio-button properties-panel__ratio-button--mono"
                      size="sm"
                      variant={
                        activeRatio === preset.label ? "default" : "outline"
                      }
                      onClick={() => applyAspectRatioPreset(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="properties-panel__marker-setting">
                <span className="properties-panel__marker-label">
                  canvas markers
                </span>
                <Toggle
                  aria-label="toggle canvas markers"
                  className="properties-panel__marker-toggle"
                  pressed={showCanvasMarkers}
                  size="sm"
                  variant="outline"
                  onPressedChange={setShowCanvasMarkers}
                >
                  {showCanvasMarkers ? "On" : "Off"}
                </Toggle>
              </div>
            </div>
          </section>

          {/* selection section */}
          <section className="properties-panel__section">
            <PanelHeader
              title="selection"
              meta={
                selectedIds.length > 1
                  ? `${selectedIds.length} selected`
                  : selectedIndex >= 0
                    ? getImageAriaLabel(selectedIndex)
                    : "none"
              }
            />
            {selectedItem ? (
              <div className="properties-panel__selection-content">
                <div className="properties-panel__fields">
                  <NumberField
                    label="X"
                    value={selectedItem.x}
                    onChange={(value) => updateSelectedItem({ x: value })}
                  />
                  <NumberField
                    label="Y"
                    value={selectedItem.y}
                    onChange={(value) => updateSelectedItem({ y: value })}
                  />
                  <NumberField
                    label="Width"
                    value={selectedItem.width}
                    onChange={(value) => updateSelectedItem({ width: value })}
                  />
                  <NumberField
                    label="Height"
                    value={selectedItem.height}
                    onChange={(value) => updateSelectedItem({ height: value })}
                  />
                </div>
              </div>
            ) : (
              <p className="properties-panel__empty">
                no image selected. click on an image to edit its properties.
              </p>
            )}
          </section>

          {/* info / help section */}
          <section className="shortcuts">
            <h2 className="shortcuts__title">shortcuts</h2>
            <div className="shortcuts__list">
              <p className="shortcuts__item">
                <span>Move selected</span>
                <kbd className="shortcuts__key">Arrows</kbd>
              </p>
              <p className="shortcuts__item">
                <span>move faster</span>
                <kbd className="shortcuts__key">Shift + Arrows</kbd>
              </p>
              <p className="shortcuts__item">
                <span>add to selection</span>
                <kbd className="shortcuts__key">Shift Click</kbd>
              </p>
              <p className="shortcuts__item">
                <span>keep ratio on resize</span>
                <kbd className="shortcuts__key">Shift Drag</kbd>
              </p>
              <p className="shortcuts__item">
                <span>resize canvas only</span>
                <kbd className="shortcuts__key">Ctrl Drag</kbd>
              </p>
            </div>
          </section>
        </aside>
      </div>

      {/* status bar */}
      <footer className="status-bar glass">
        <div className="status-bar__message">
          <div
            className={cn(
              "status-bar__indicator",
              status.includes("...")
                ? "status-bar__indicator--loading"
                : status.includes("Failed") || status.includes("error")
                  ? "status-bar__indicator--error"
                  : "status-bar__indicator--success"
            )}
          />
          <span className="status-bar__text">{status}</span>
        </div>
        <div className="status-bar__meta">
          <span className="status-bar__text">
            Canvas: {layout.canvas.width} x {layout.canvas.height}px
          </span>
          {selectedItem && (
            <span className="status-bar__text">
              Selection: {selectedItem.width} x {selectedItem.height}px
            </span>
          )}
        </div>
      </footer>
    </main>
  )
}

const LayerActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "flex items-center justify-center p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent",
      className
    )}
    type="button"
    {...props}
  />
))
LayerActionButton.displayName = "LayerActionButton"

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <p className="text-sm font-medium">{title}</p>
      <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {meta}
      </p>
    </div>
  )
}

function getImageAriaLabel(index: number): string {
  return `Item ${getImageMarkerCode(index)}`
}

function getImageMarkerStyle(index: number): CSSProperties {
  return {
    "--image-marker": `var(--image-marker-${(index % IMAGE_MARKER_COUNT) + 1})`,
  } as CSSProperties
}

function getCanvasMarkerStyle(): CSSProperties {
  return {
    "--image-marker": "var(--primary)",
  } as CSSProperties
}

function getImageMarkerCode(index: number): string {
  return String(index + 1).padStart(2, "0")
}

function getLayerActionKey(itemId: string, action: LayerAction): string {
  return `${itemId}:${action}`
}

function getLayerDropPlacement(
  event: DragEvent<HTMLDivElement>
): LayerDropPreview["placement"] {
  const bounds = event.currentTarget.getBoundingClientRect()

  return event.clientY <= bounds.top + bounds.height / 2 ? "above" : "below"
}

function getConnectorPath(from: DOMRect, to: DOMRect): string {
  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const toCenterX = to.left + to.width / 2
  const toCenterY = to.top + to.height / 2
  let x1 = from.right
  let y1 = fromCenterY
  let x2 = to.left
  let y2 = toCenterY

  if (to.right < from.left) {
    x1 = from.left
    x2 = to.right
  } else if (from.bottom < to.top) {
    x1 = fromCenterX
    y1 = from.bottom
    x2 = toCenterX
    y2 = to.top
  } else if (to.bottom < from.top) {
    x1 = fromCenterX
    y1 = from.top
    x2 = toCenterX
    y2 = to.bottom
  }

  const midX = x1 + (x2 - x1) / 2

  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

function isPrimaryPointer<T extends Element>(event: PointerEvent<T>): boolean {
  return event.button === 0
}

type ResizeHandlesProps = {
  active: boolean
  labelPrefix: string
  selected?: boolean
  variant?: "default" | "canvas"
  onPointerDown: (event: React.PointerEvent, edge: ResizeEdge) => void
}

function ResizeHandles({
  active,
  labelPrefix,
  selected = false,
  variant = "default",
  onPointerDown,
}: ResizeHandlesProps) {
  return RESIZE_HANDLES.map((handle) => {
    const isCanvasHandle = variant === "canvas"

    return (
      <button
        key={handle.edge}
        aria-label={`${labelPrefix}: ${handle.label}`}
        className={cn(
          "pointer-events-auto absolute z-1000 bg-transparent opacity-0 transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100",
          active && "opacity-100",
          isCanvasHandle && "canvas-resize-handle",
          handle.className
        )}
        data-edge={handle.edge}
        data-handle-type={handle.type}
        type="button"
        onPointerDown={(event) => onPointerDown(event, handle.edge)}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute box-border",
            isCanvasHandle
              ? "canvas-resize-handle__indicator"
              : cn(
                  RESIZE_HANDLE_COLOR_CLASS,
                  selected
                    ? handle.type === "edge"
                      ? RESIZE_EDGE_SELECTED_BORDER_CLASS
                      : RESIZE_CORNER_SELECTED_BORDER_CLASS
                    : handle.type === "edge"
                      ? RESIZE_EDGE_HOVER_BORDER_CLASS
                      : RESIZE_CORNER_HOVER_BORDER_CLASS
                ),
            handle.indicatorClassName
          )}
        />
      </button>
    )
  })
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="relative">
        <Input
          className="h-9 w-full pr-8 font-mono text-sm"
          inputMode="numeric"
          min={0}
          type="number"
          value={Math.round(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
          px
        </span>
      </div>
    </label>
  )
}

function SliderField({
  label,
  value,
  valueLabel,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  valueLabel: string
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <output className="font-mono text-[10px] text-muted-foreground">
          {valueLabel}
        </output>
      </div>

      <Slider
        ariaLabel={label}
        max={max}
        min={min}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

// Helper functions remain exactly the same from here down...

function resizeCanvasLayout(
  drag: Extract<DragState, { mode: "canvas-resize" }>,
  dx: number,
  dy: number
): CanvasLayout {
  const widthDelta = edgeHas(drag.edge, "e")
    ? dx
    : edgeHas(drag.edge, "w")
      ? -dx
      : 0
  const heightDelta = edgeHas(drag.edge, "s")
    ? dy
    : edgeHas(drag.edge, "n")
      ? -dy
      : 0
  const canvas = clampCanvas({
    width: drag.startCanvas.width + widthDelta,
    height: drag.startCanvas.height + heightDelta,
  })
  const nextCanvas = drag.scaleItems
    ? canvas
    : clampCanvasToItems(canvas, drag.startItems)

  return {
    canvas: nextCanvas,
    items: drag.scaleItems
      ? scaleItemsToCanvas(drag.startCanvas, drag.startItems, nextCanvas)
      : drag.startItems,
  }
}

function clampCanvasToItems(
  canvas: CanvasLayout["canvas"],
  items: CanvasItem[]
): CanvasLayout["canvas"] {
  if (!items.length) {
    return canvas
  }

  const bounds = getItemsBounds(items)

  return clampCanvas({
    width: Math.max(canvas.width, bounds.right),
    height: Math.max(canvas.height, bounds.bottom),
  })
}

function normalizeCanvasLayout(layout: CanvasLayout): CanvasLayout {
  const canvas = fitCanvasWithinLimits(layout.canvas)
  const items = normalizeItemLayers(layout.items)

  if (
    canvas.width === layout.canvas.width &&
    canvas.height === layout.canvas.height
  ) {
    return {
      ...layout,
      items,
    }
  }

  return {
    canvas,
    items: scaleItemsToCanvas(layout.canvas, items, canvas),
  }
}

function normalizeItemLayers(items: CanvasItem[]): CanvasItem[] {
  const zIndexById = new Map(
    getLayerEntries(items).map((entry) => [entry.item.id, entry.layerIndex])
  )

  return items.map((item, index) => ({
    ...item,
    zIndex: zIndexById.get(item.id) ?? index,
  }))
}

function getLayerEntries(items: CanvasItem[]): LayerEntry[] {
  return items
    .map((item, itemIndex) => ({
      item,
      itemIndex,
      zIndex: item.zIndex ?? itemIndex,
    }))
    .sort(
      (first, second) =>
        first.zIndex - second.zIndex || first.itemIndex - second.itemIndex
    )
    .map((entry, layerIndex) => ({
      item: entry.item,
      itemIndex: entry.itemIndex,
      layerIndex,
    }))
}

function fitCanvasWithinLimits(
  canvas: CanvasLayout["canvas"]
): CanvasLayout["canvas"] {
  const width = Math.max(1, Math.round(canvas.width))
  const height = Math.max(1, Math.round(canvas.height))
  const scale = Math.min(1, MAX_CANVAS_SIZE / width, MAX_CANVAS_SIZE / height)

  return clampCanvas({
    width: width * scale,
    height: height * scale,
  })
}

function clampCanvas(canvas: CanvasLayout["canvas"]): CanvasLayout["canvas"] {
  return {
    width: clampCanvasSize(canvas.width),
    height: clampCanvasSize(canvas.height),
  }
}

function clampCanvasSize(value: number): number {
  return clamp(
    Math.round(value || MIN_CANVAS_SIZE),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE
  )
}

function getCanvasForMaxSide(
  canvas: CanvasLayout["canvas"],
  maxSide: number
): CanvasLayout["canvas"] {
  const ratio = canvas.width / canvas.height
  const size = clampCanvasSize(maxSide)

  if (canvas.width >= canvas.height) {
    return clampCanvas({ width: size, height: size / ratio })
  }

  return clampCanvas({ width: size * ratio, height: size })
}

function scaleItemsToCanvas(
  fromCanvas: CanvasLayout["canvas"],
  items: CanvasItem[],
  toCanvas: CanvasLayout["canvas"]
): CanvasItem[] {
  const scaleX = toCanvas.width / fromCanvas.width
  const scaleY = toCanvas.height / fromCanvas.height

  return items.map((item) => {
    const x = clamp(Math.round(item.x * scaleX), 0, toCanvas.width - 1)
    const y = clamp(Math.round(item.y * scaleY), 0, toCanvas.height - 1)
    const width = clamp(
      Math.max(1, Math.round(item.width * scaleX)),
      1,
      toCanvas.width - x
    )
    const height = clamp(
      Math.max(1, Math.round(item.height * scaleY)),
      1,
      toCanvas.height - y
    )

    return updateScale(
      {
        ...item,
        x,
        y,
        width,
        height,
      },
      item
    )
  })
}

function getCanvasForRatio(
  canvas: CanvasLayout["canvas"],
  ratio: number
): CanvasLayout["canvas"] {
  const area = canvas.width * canvas.height
  const width = Math.max(MIN_CANVAS_SIZE, Math.round(Math.sqrt(area * ratio)))
  const height = Math.max(MIN_CANVAS_SIZE, Math.round(width / ratio))

  return clampCanvas({ width, height })
}

function getCanvasRatioLabel(
  canvas: CanvasLayout["canvas"],
  originalCanvas: CanvasLayout["canvas"]
): string {
  if (sameCanvasRatio(canvas, originalCanvas)) {
    return "original"
  }

  const preset = ASPECT_RATIO_PRESETS.find((item) =>
    sameRatio(canvas.width / canvas.height, item.width / item.height)
  )

  return preset?.label ?? "Custom"
}

function sameCanvasRatio(
  canvas: CanvasLayout["canvas"],
  target: CanvasLayout["canvas"]
): boolean {
  return sameRatio(canvas.width / canvas.height, target.width / target.height)
}

function sameRatio(current: number, target: number): boolean {
  return Math.abs(current - target) < 0.002
}

function clampItem(
  item: CanvasItem,
  canvas: CanvasLayout["canvas"]
): CanvasItem {
  const width = clamp(
    Math.round(item.width || MIN_ITEM_SIZE),
    MIN_ITEM_SIZE,
    canvas.width
  )
  const height = clamp(
    Math.round(item.height || MIN_ITEM_SIZE),
    MIN_ITEM_SIZE,
    canvas.height
  )

  return {
    ...item,
    x: clamp(Math.round(item.x || 0), 0, canvas.width - width),
    y: clamp(Math.round(item.y || 0), 0, canvas.height - height),
    width,
    height,
  }
}

function moveItemsWithinCanvas(
  items: CanvasItem[],
  canvas: CanvasLayout["canvas"],
  dx: number,
  dy: number
): CanvasItem[] {
  if (!items.length) {
    return items
  }

  const bounds = getItemsBounds(items)
  const moveX = clamp(Math.round(dx), -bounds.left, canvas.width - bounds.right)
  const moveY = clamp(
    Math.round(dy),
    -bounds.top,
    canvas.height - bounds.bottom
  )

  return items.map((item) => ({
    ...item,
    x: item.x + moveX,
    y: item.y + moveY,
  }))
}

function resizeItemsFromEdge(
  items: CanvasItem[],
  canvas: CanvasLayout["canvas"],
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean
): CanvasItem[] {
  if (!items.length) {
    return items
  }

  const bounds = getItemsBounds(items)
  const nextBounds = resizeBoundsFromEdge(
    bounds,
    canvas,
    dx,
    dy,
    edge,
    keepRatio,
    getMinGroupSize(items, bounds)
  )
  const scaleX = nextBounds.width / bounds.width
  const scaleY = nextBounds.height / bounds.height

  return items.map((item) =>
    clampItem(
      updateScale(
        {
          ...item,
          x: Math.round(nextBounds.left + (item.x - bounds.left) * scaleX),
          y: Math.round(nextBounds.top + (item.y - bounds.top) * scaleY),
          width: Math.round(item.width * scaleX),
          height: Math.round(item.height * scaleY),
        },
        item
      ),
      canvas
    )
  )
}

function resizeBoundsFromEdge(
  bounds: ItemBounds,
  canvas: CanvasLayout["canvas"],
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean,
  minSize: { width: number; height: number }
): ItemBounds {
  let left = bounds.left
  let top = bounds.top
  let right = bounds.right
  let bottom = bounds.bottom

  if (edgeHas(edge, "w")) {
    left = clamp(bounds.left + dx, 0, bounds.right - minSize.width)
  }

  if (edgeHas(edge, "e")) {
    right = clamp(bounds.right + dx, bounds.left + minSize.width, canvas.width)
  }

  if (edgeHas(edge, "n")) {
    top = clamp(bounds.top + dy, 0, bounds.bottom - minSize.height)
  }

  if (edgeHas(edge, "s")) {
    bottom = clamp(
      bounds.bottom + dy,
      bounds.top + minSize.height,
      canvas.height
    )
  }

  if (keepRatio && edge.length === 2) {
    const ratio = bounds.width / bounds.height
    const useWidth = Math.abs(dx) >= Math.abs(dy)
    let width = right - left
    let height = bottom - top

    if (useWidth) {
      height = width / ratio
    } else {
      width = height * ratio
    }

    if (edgeHas(edge, "w")) {
      left = right - width
    } else {
      right = left + width
    }

    if (edgeHas(edge, "n")) {
      top = bottom - height
    } else {
      bottom = top + height
    }

    if (left < 0) {
      right -= left
      left = 0
    }

    if (top < 0) {
      bottom -= top
      top = 0
    }

    if (right > canvas.width) {
      left -= right - canvas.width
      right = canvas.width
    }

    if (bottom > canvas.height) {
      top -= bottom - canvas.height
      bottom = canvas.height
    }
  }

  left = clamp(left, 0, canvas.width - minSize.width)
  top = clamp(top, 0, canvas.height - minSize.height)
  right = clamp(right, left + minSize.width, canvas.width)
  bottom = clamp(bottom, top + minSize.height, canvas.height)

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function getMinGroupSize(
  items: CanvasItem[],
  bounds: ItemBounds
): { width: number; height: number } {
  const minScaleX = Math.max(...items.map((item) => MIN_ITEM_SIZE / item.width))
  const minScaleY = Math.max(
    ...items.map((item) => MIN_ITEM_SIZE / item.height)
  )

  return {
    width: Math.min(bounds.width, bounds.width * minScaleX),
    height: Math.min(bounds.height, bounds.height * minScaleY),
  }
}

function getItemsBounds(items: CanvasItem[]): ItemBounds {
  const bounds = items.reduce(
    (bounds, item) => ({
      left: Math.min(bounds.left, item.x),
      top: Math.min(bounds.top, item.y),
      right: Math.max(bounds.right, item.x + item.width),
      bottom: Math.max(bounds.bottom, item.y + item.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    }
  )

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  }
}

function resizeItemFromEdge(
  item: CanvasItem,
  canvas: CanvasLayout["canvas"],
  dx: number,
  dy: number,
  edge: ResizeEdge,
  keepRatio: boolean
): CanvasItem {
  const startRight = item.x + item.width
  const startBottom = item.y + item.height
  let left = item.x
  let top = item.y
  let right = startRight
  let bottom = startBottom

  if (edgeHas(edge, "w")) {
    left = clamp(item.x + dx, 0, startRight - MIN_ITEM_SIZE)
  }

  if (edgeHas(edge, "e")) {
    right = clamp(startRight + dx, item.x + MIN_ITEM_SIZE, canvas.width)
  }

  if (edgeHas(edge, "n")) {
    top = clamp(item.y + dy, 0, startBottom - MIN_ITEM_SIZE)
  }

  if (edgeHas(edge, "s")) {
    bottom = clamp(startBottom + dy, item.y + MIN_ITEM_SIZE, canvas.height)
  }

  if (keepRatio && edge.length === 2) {
    const ratio = item.width / item.height
    const useWidth = Math.abs(dx) >= Math.abs(dy)
    let width = right - left
    let height = bottom - top

    if (useWidth) {
      height = width / ratio
    } else {
      width = height * ratio
    }

    if (edgeHas(edge, "w")) {
      left = right - width
    } else {
      right = left + width
    }

    if (edgeHas(edge, "n")) {
      top = bottom - height
    } else {
      bottom = top + height
    }

    left = clamp(left, 0, canvas.width - MIN_ITEM_SIZE)
    top = clamp(top, 0, canvas.height - MIN_ITEM_SIZE)
    right = clamp(right, left + MIN_ITEM_SIZE, canvas.width)
    bottom = clamp(bottom, top + MIN_ITEM_SIZE, canvas.height)
  }

  return updateScale(
    {
      ...item,
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    },
    item
  )
}

function edgeHas(edge: ResizeEdge, direction: "n" | "e" | "s" | "w"): boolean {
  return edge.includes(direction)
}

function updateScale(next: CanvasItem, previous: CanvasItem): CanvasItem {
  const originalWidth =
    previous.scale && previous.scale > 0
      ? previous.width / previous.scale
      : previous.width

  return {
    ...next,
    scale: round(next.width / originalWidth),
  }
}

function formatCompositionDate(value: string | null): string {
  if (!value) {
    return "no date"
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatCompositionTitle(
  composition: UserCompositionItem | null
): string {
  if (!composition) {
    return "Current composition"
  }

  return `${composition.imageCount} images`
}

function formatCompositionMeta(composition: UserCompositionItem): string {
  const canvas = composition.canvas
    ? `${Math.round(composition.canvas.width)}x${Math.round(composition.canvas.height)}`
    : "canvas pending"

  return `${canvas} · ${formatCompositionDate(composition.createdAt)}`
}

function getInitialRemoteComposition(): RemoteComposition | null {
  const params = new URLSearchParams(window.location.search)
  const compositionId = params.get("compositionId")
  const token = params.get("token")

  if (!compositionId || !token) {
    return null
  }

  return { compositionId, token, jigsawImageUrl: null }
}

function parseRemoteCompositionInput(value: string): RemoteComposition | null {
  const input = value.trim()

  if (!input) {
    return null
  }

  try {
    const url = new URL(input)
    const compositionId = url.searchParams.get("compositionId")
    const token = url.searchParams.get("token")

    if (compositionId && token) {
      return { compositionId, token, jigsawImageUrl: null }
    }
  } catch {
    // Not a URL. Fall through to compact code parsing.
  }

  const [compositionId, token] = input.split(/[\s:|,]+/).filter(Boolean)

  if (!compositionId || !token) {
    return null
  }

  return { compositionId, token, jigsawImageUrl: null }
}

async function fetchCompositionLayout(
  composition: RemoteComposition,
  authToken: string
): Promise<ApiCompositionLayout> {
  return requestCompositionLayout(composition, authToken, "GET")
}

async function requestCompositionLayout(
  composition: RemoteComposition,
  authToken: string,
  method: "GET" | "PATCH",
  body?: unknown
): Promise<ApiCompositionLayout> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
  }

  if (body) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(
    `${API_BASE_URL}${apiRoutes.compositions.get.layout.build(composition.compositionId)}?editToken=${encodeURIComponent(composition.token)}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }
  )

  return readJsonResponse<ApiCompositionLayout>(response)
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed"
}

function getArrowOffset(
  key: string,
  step: number
): { x: number; y: number } | null {
  if (key === "ArrowLeft") {
    return { x: -step, y: 0 }
  }

  if (key === "ArrowRight") {
    return { x: step, y: 0 }
  }

  if (key === "ArrowUp") {
    return { x: 0, y: -step }
  }

  if (key === "ArrowDown") {
    return { x: 0, y: step }
  }

  return null
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input,textarea,select"))
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round(value: number): number {
  return Math.round(value * 1_000_000) * 1_000_000
}

export default App
