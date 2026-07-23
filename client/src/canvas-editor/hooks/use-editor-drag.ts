import type { Dispatch, PointerEvent, RefObject, SetStateAction } from "react"
import { useEffect, useRef } from "react"

import { MOVE_DRAG_THRESHOLD } from "../model/constants"
import {
  moveItemsWithinCanvas,
  resizeCanvasLayout,
  resizeItemFromEdge,
  resizeItemsFromEdge,
} from "../model/layout"
import type {
  CanvasItem,
  CanvasLayout,
  DragState,
  ResizeEdge,
  SelectionMode,
} from "../model/types"

type EditorDragOptions = {
  layout: CanvasLayout
  layoutRef: RefObject<CanvasLayout>
  setLayout: Dispatch<SetStateAction<CanvasLayout>>
  viewportScale: number
  selectedIdSet: Set<string>
  selectedItems: CanvasItem[]
  selectItem: (itemId: string, mode: SelectionMode) => void
  selectOnlyItem: (itemId: string) => void
  focusItem: (itemId: string) => void
  clearSelection: () => void
  commitDrag: (layout: CanvasLayout) => void
  setStatus: (message: string) => void
}

export function useEditorDrag(options: EditorDragOptions) {
  const { commitDrag, setLayout } = options
  const dragRef = useRef<DragState | null>(null)
  const dragStartLayoutRef = useRef<CanvasLayout | null>(null)
  const zoomRef = useRef(options.viewportScale)

  useEffect(() => {
    zoomRef.current = options.viewportScale
  }, [options.viewportScale])

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      const drag = dragRef.current
      if (!drag) return
      event.preventDefault()
      const clientDx = event.clientX - drag.startClientX
      const clientDy = event.clientY - drag.startClientY
      if (
        drag.mode === "move" &&
        Math.hypot(clientDx, clientDy) < MOVE_DRAG_THRESHOLD
      )
        return
      const dx = clientDx / zoomRef.current
      const dy = clientDy / zoomRef.current

      if (drag.mode === "canvas-resize") {
        setLayout(resizeCanvasLayout(drag, dx, dy))
        return
      }
      setLayout((current) => {
        const resized =
          drag.mode === "move"
            ? moveItemsWithinCanvas(drag.startItems, current.canvas, dx, dy)
            : drag.startItems.length > 1
              ? resizeItemsFromEdge(
                  drag.startItems,
                  current.canvas,
                  dx,
                  dy,
                  drag.edge,
                  event.shiftKey || drag.keepRatio
                )
              : [
                  resizeItemFromEdge(
                    drag.startItem,
                    current.canvas,
                    dx,
                    dy,
                    drag.edge,
                    event.shiftKey || drag.keepRatio
                  ),
                ]
        const nextById = new Map(resized.map((item) => [item.id, item]))
        return {
          ...current,
          items: current.items.map((item) => nextById.get(item.id) ?? item),
        }
      })
    }

    function handlePointerEnd() {
      if (dragRef.current && dragStartLayoutRef.current)
        commitDrag(dragStartLayoutRef.current)
      dragRef.current = null
      dragStartLayoutRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [commitDrag, setLayout])

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
    event.currentTarget.setPointerCapture(event.pointerId)
    const startItems = options.selectedItems.length
      ? options.selectedItems
      : [item]
    options.focusItem(item.id)
    options.setStatus(
      startItems.length > 1 ? `Drag ${startItems.length} images` : "Drag image"
    )
    dragRef.current = {
      mode: "move",
      ids: startItems.map((candidate) => candidate.id),
      startClientX: event.clientX,
      startClientY: event.clientY,
      startItems,
    }
    dragStartLayoutRef.current = structuredClone(options.layoutRef.current)
  }

  function startItemResize(
    event: PointerEvent<Element>,
    item: CanvasItem,
    edge: ResizeEdge
  ) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startItems = options.selectedIdSet.has(item.id)
      ? options.selectedItems
      : [item]
    if (options.selectedIdSet.has(item.id)) options.focusItem(item.id)
    else options.selectOnlyItem(item.id)
    options.setStatus(
      startItems.length > 1
        ? `Resize ${startItems.length} images. Shift keeps group ratio`
        : "Resize image. Shift keeps corner ratio"
    )
    dragRef.current = {
      mode: "item-resize",
      id: item.id,
      edge,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startItem: item,
      startItems,
      keepRatio: event.shiftKey,
    }
    dragStartLayoutRef.current = structuredClone(options.layoutRef.current)
  }

  function startCanvasResize(event: PointerEvent<Element>, edge: ResizeEdge) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const scaleItems = !event.ctrlKey && !event.metaKey
    options.clearSelection()
    options.setStatus(
      scaleItems ? "Resize canvas and images" : "Resize canvas only"
    )
    dragRef.current = {
      mode: "canvas-resize",
      edge,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCanvas: options.layout.canvas,
      startItems: options.layout.items,
      scaleItems,
    }
    dragStartLayoutRef.current = structuredClone(options.layoutRef.current)
  }

  return { startMove, startItemResize, startCanvasResize }
}
