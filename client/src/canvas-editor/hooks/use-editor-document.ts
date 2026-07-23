import { useEffect, useRef, useState } from "react"

import { DEFAULT_ZOOM, EMPTY_LAYOUT } from "../model/constants"
import {
  clampCanvas,
  clampCanvasSize,
  clampItem,
  getCanvasForMaxSide,
  getCanvasForRatio,
  getCanvasRatioLabel,
  scaleItemsToCanvas,
  updateScale,
} from "../model/layout"
import {
  getLayerActionKey,
  getLayerEntries,
  moveLayer,
  reorderLayer,
} from "../model/layers"
import type {
  AspectRatioPreset,
  CanvasItem,
  CanvasLayout,
  CanvasSize,
  LayerAction,
  SelectionMode,
} from "../model/types"
import { useEditorHistory } from "./use-editor-history"

type SetStatus = (
  message: string,
  kind?: "idle" | "loading" | "success" | "error"
) => void

export function useEditorDocument(setStatus: SetStatus) {
  const [layout, setLayout] = useState<CanvasLayout>(EMPTY_LAYOUT)
  const [originalCanvas, setOriginalCanvas] = useState<CanvasSize>(
    EMPTY_LAYOUT.canvas
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showCanvasMarkers, setShowCanvasMarkers] = useState(true)
  const layerActionRefs = useRef(new Map<string, HTMLButtonElement>())
  const layerRowRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingLayerFocusRef = useRef<{
    itemId: string
    action: LayerAction
  } | null>(null)
  const history = useEditorHistory(layout, setLayout)

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

  useEffect(() => {
    const pending = pendingLayerFocusRef.current
    if (!pending) return
    pendingLayerFocusRef.current = null
    const row = layerRowRefs.current.get(pending.itemId)
    const action = layerActionRefs.current.get(
      getLayerActionKey(pending.itemId, pending.action)
    )
    row?.scrollIntoView({ block: "nearest" })
    if (action && !action.disabled) action.focus({ preventScroll: true })
    else
      row
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true })
  })

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
  function selectItem(itemId: string, mode: SelectionMode) {
    if (mode === "replace") return selectOnlyItem(itemId)
    setSelectedIds((current) => {
      if (mode === "add")
        return [itemId, ...current.filter((id) => id !== itemId)]
      return current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [itemId, ...current]
    })
  }
  function applyLayout(next: CanvasLayout, preserveAsOriginal = false) {
    setLayout(next)
    if (preserveAsOriginal) setOriginalCanvas(next.canvas)
    selectOnlyItem(next.items[0]?.id ?? "")
  }
  function applyCanvasSize(canvas: CanvasSize, message: string) {
    const nextCanvas = clampCanvas(canvas)
    history.recordChange((current) => ({
      canvas: nextCanvas,
      items: scaleItemsToCanvas(current.canvas, current.items, nextCanvas),
    }))
    clearSelection()
    setStatus(message)
  }
  function updateCanvasSize(field: "width" | "height", value: number) {
    history.recordChange((current) => {
      const nextCanvas = clampCanvas({
        ...current.canvas,
        [field]: clampCanvasSize(value),
      })
      return {
        canvas: nextCanvas,
        items: scaleItemsToCanvas(current.canvas, current.items, nextCanvas),
      }
    })
  }
  function updateSelectedItem(patch: Partial<CanvasItem>) {
    if (!selectedItem) return
    history.recordChange((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === selectedItem.id
          ? clampItem(updateScale({ ...item, ...patch }, item), current.canvas)
          : item
      ),
    }))
  }
  function moveItemLayer(
    itemId: string,
    direction: -1 | 1,
    action: LayerAction
  ) {
    const index = layerIndexById.get(itemId)
    if (index === undefined) return
    moveItemLayerTo(
      itemId,
      index + direction,
      direction > 0 ? "Layer raised" : "Layer lowered",
      action
    )
  }
  function moveItemLayerTo(
    itemId: string,
    target: number,
    message: string,
    action: LayerAction
  ) {
    if (!layerIndexById.has(itemId)) return
    focusItem(itemId)
    if (target < 0 || target >= layout.items.length) return
    pendingLayerFocusRef.current = { itemId, action }
    history.recordChange((current) => ({
      ...current,
      items: moveLayer(current.items, itemId, target),
    }))
    setStatus(message)
  }
  function reorderItemLayer(
    itemId: string,
    targetItemId: string,
    placement: "above" | "below"
  ) {
    focusItem(itemId)
    history.recordChange((current) => ({
      ...current,
      items: reorderLayer(current.items, itemId, targetItemId, placement),
    }))
    setStatus("Layer reordered")
  }
  function setLayerActionRef(itemId: string, action: LayerAction) {
    return (node: HTMLButtonElement | null) => {
      const key = getLayerActionKey(itemId, action)
      if (node) layerActionRefs.current.set(key, node)
      else layerActionRefs.current.delete(key)
    }
  }
  function setLayerRowRef(itemId: string) {
    return (node: HTMLDivElement | null) => {
      if (node) layerRowRefs.current.set(itemId, node)
      else layerRowRefs.current.delete(itemId)
    }
  }

  return {
    layout,
    setLayout,
    originalCanvas,
    selectedIds,
    setZoom,
    zoom,
    showCanvasMarkers,
    setShowCanvasMarkers,
    selectedItem,
    selectedItems,
    selectedIndex,
    selectedIdSet,
    layerEntries,
    layerListEntries,
    layerIndexById,
    viewportScale,
    activeRatio,
    canvasMaxSide,
    layoutRef: history.layoutRef,
    recordLayoutChange: history.recordChange,
    commitDrag: history.commitDrag,
    clearSelection,
    selectOnlyItem,
    focusItem,
    selectItem,
    applyLayout,
    updateSelectedItem,
    updateCanvasSize,
    updateCanvasScale: (value: number) =>
      applyCanvasSize(
        getCanvasForMaxSide(layout.canvas, value),
        "Canvas size updated"
      ),
    applyAspectRatioPreset: (preset: AspectRatioPreset) =>
      applyCanvasSize(
        getCanvasForRatio(layout.canvas, preset.width / preset.height),
        `Canvas ratio ${preset.label}`
      ),
    restoreOriginalCanvas: () =>
      applyCanvasSize(originalCanvas, "original canvas ratio"),
    moveItemLayer,
    moveItemLayerTo,
    reorderItemLayer,
    setLayerActionRef,
    setLayerRowRef,
    undo: () => {
      if (history.undo()) setStatus("Undo")
    },
    redo: () => {
      if (history.redo()) setStatus("Redo")
    },
  }
}
