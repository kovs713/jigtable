import type { PointerEvent } from "react"
import { useEffect, useEffectEvent, useRef } from "react"

import { MOVE_DRAG_THRESHOLD } from "../model/constants"
import type {
  EditorInteraction,
  EditorTransactionEdit,
  EditorTransactionToken,
} from "../model/editor-document"
import type { CanvasItem, ResizeEdge, SelectionMode } from "../model/types"

type ActiveDrag = {
  token: EditorTransactionToken
  interaction: EditorInteraction
  startClientX: number
  startClientY: number
  keepRatio?: boolean
}

type EditorDragOptions = {
  viewportScale: number
  selectedIdSet: Set<string>
  selectedItems: CanvasItem[]
  selectItem: (itemId: string, mode: SelectionMode) => unknown
  selectOnlyItem: (itemId: string) => unknown
  focusItem: (itemId: string) => unknown
  clearSelection: () => unknown
  beginTransaction: (
    interaction: EditorInteraction
  ) => EditorTransactionToken | null
  previewTransaction: (
    token: EditorTransactionToken,
    edit: EditorTransactionEdit
  ) => unknown
  finishTransaction: (
    token: EditorTransactionToken,
    disposition: "commit" | "rollback"
  ) => unknown
  setStatus: (message: string) => void
}

export function useEditorDrag(options: EditorDragOptions) {
  const dragRef = useRef<ActiveDrag | null>(null)

  const handlePointerMove = useEffectEvent((event: globalThis.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    const clientDx = event.clientX - drag.startClientX
    const clientDy = event.clientY - drag.startClientY
    if (
      drag.interaction.type === "move-selection" &&
      Math.hypot(clientDx, clientDy) < MOVE_DRAG_THRESHOLD
    ) {
      return
    }

    const dx = clientDx / options.viewportScale
    const dy = clientDy / options.viewportScale
    let edit: EditorTransactionEdit
    if (drag.interaction.type === "move-selection") {
      edit = { type: "move-selection", dx, dy }
    } else if (drag.interaction.type === "resize-selection") {
      edit = {
        type: "resize-selection",
        edge: drag.interaction.edge,
        dx,
        dy,
        keepRatio: event.shiftKey || Boolean(drag.keepRatio),
      }
    } else if (drag.interaction.type === "resize-canvas") {
      edit = {
        type: "resize-canvas",
        edge: drag.interaction.edge,
        scaleItems: drag.interaction.scaleItems,
        dx,
        dy,
      }
    } else {
      return
    }
    options.previewTransaction(drag.token, edit)
  })

  const finishPointer = useEffectEvent((disposition: "commit" | "rollback") => {
    const drag = dragRef.current
    if (!drag) return
    options.finishTransaction(drag.token, disposition)
    dragRef.current = null
  })

  useEffect(() => {
    const handlePointerUp = () => finishPointer("commit")
    const handlePointerCancel = () => finishPointer("rollback")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [])

  function getSelectionMode(
    event: Pick<PointerEvent, "ctrlKey" | "metaKey" | "shiftKey">
  ): SelectionMode {
    if (event.ctrlKey || event.metaKey) return "toggle"
    if (event.shiftKey) return "add"
    return "replace"
  }

  function startMove(event: PointerEvent<HTMLElement>, item: CanvasItem) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const wasSelected = options.selectedIdSet.has(item.id)
    const mode = getSelectionMode(event)
    if (mode !== "replace") {
      options.selectItem(item.id, mode)
      options.setStatus("Selection updated")
      return
    }
    if (!wasSelected) {
      options.selectOnlyItem(item.id)
      options.setStatus("Image selected. Drag selected image to move")
      return
    }

    options.focusItem(item.id)
    const token = options.beginTransaction({ type: "move-selection" })
    if (token === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    options.setStatus(
      options.selectedItems.length > 1
        ? `Drag ${options.selectedItems.length} images`
        : "Drag image"
    )
    dragRef.current = {
      token,
      interaction: { type: "move-selection" },
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
  }

  function startItemResize(
    event: PointerEvent<Element>,
    item: CanvasItem,
    edge: ResizeEdge
  ) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const isSelected = options.selectedIdSet.has(item.id)
    if (isSelected) options.focusItem(item.id)
    else options.selectOnlyItem(item.id)

    const interaction: EditorInteraction = { type: "resize-selection", edge }
    const token = options.beginTransaction(interaction)
    if (token === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const itemCount = isSelected ? options.selectedItems.length : 1
    options.setStatus(
      itemCount > 1
        ? `Resize ${itemCount} images. Shift keeps group ratio`
        : "Resize image. Shift keeps corner ratio"
    )
    dragRef.current = {
      token,
      interaction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      keepRatio: event.shiftKey,
    }
  }

  function startCanvasResize(event: PointerEvent<Element>, edge: ResizeEdge) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    options.clearSelection()
    const scaleItems = !event.ctrlKey && !event.metaKey
    const interaction: EditorInteraction = {
      type: "resize-canvas",
      edge,
      scaleItems,
    }
    const token = options.beginTransaction(interaction)
    if (token === null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    options.setStatus(
      scaleItems ? "Resize canvas and images" : "Resize canvas only"
    )
    dragRef.current = {
      token,
      interaction,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
  }

  return { startMove, startItemResize, startCanvasResize }
}
