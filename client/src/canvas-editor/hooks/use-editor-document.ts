import { useCallback, useEffect, useRef, useState } from "react"

import { DEFAULT_ZOOM } from "../model/constants"
import {
  createEditorDocument,
  transitionEditorDocument,
  type EditorDocumentIntent,
  type EditorDocumentOutcome,
  type EditorInteraction,
  type EditorTransactionEdit,
  type EditorTransactionToken,
} from "../model/editor-document"
import { getLayerActionKey, getLayerEntries } from "../model/layers"
import { getArrowOffset, getCanvasRatioLabel } from "../model/layout"
import type {
  AspectRatioPreset,
  CanvasLayout,
  LayerAction,
  SelectionMode,
} from "../model/types"

type SetStatus = (
  message: string,
  kind?: "idle" | "loading" | "success" | "error"
) => void

export function useEditorDocument(setStatus: SetStatus) {
  const documentRef = useRef(createEditorDocument())
  const [snapshot, setSnapshot] = useState(documentRef.current.snapshot)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showCanvasMarkers, setShowCanvasMarkers] = useState(true)
  const layerActionRefs = useRef(new Map<string, HTMLButtonElement>())
  const layerRowRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingLayerFocusRef = useRef<{
    itemId: string
    action: LayerAction
  } | null>(null)

  const transition = useCallback((intent: EditorDocumentIntent) => {
    const result = transitionEditorDocument(documentRef.current, intent)
    documentRef.current = result.document
    setSnapshot(result.document.snapshot)
    return result.outcome
  }, [])

  const layout = snapshot.layout
  const selectedIds = [...snapshot.selectedIds]
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
  const activeRatio = getCanvasRatioLabel(
    layout.canvas,
    snapshot.originalCanvas
  )
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
    return transition({ type: "clear-selection" })
  }

  function selectOnlyItem(imageId: string) {
    return transition({ type: "select", imageId, mode: "replace" })
  }

  function focusItem(imageId: string) {
    return transition({ type: "focus", imageId })
  }

  function selectItem(imageId: string, mode: SelectionMode) {
    return transition({ type: "select", imageId, mode })
  }

  function applyLayout(next: CanvasLayout) {
    const outcome = transition({ type: "load", layout: next })
    if (outcome.type === "rejected") {
      throw new Error("Invalid composition layout")
    }
  }

  function beginTransaction(
    interaction: EditorInteraction
  ): EditorTransactionToken | null {
    const outcome = transition({ type: "begin-transaction", interaction })
    return outcome.type === "transaction-started" ? outcome.token : null
  }

  function previewTransaction(
    token: EditorTransactionToken,
    edit: EditorTransactionEdit
  ) {
    return transition({ type: "preview-transaction", token, edit })
  }

  function finishTransaction(
    token: EditorTransactionToken,
    disposition: "commit" | "rollback"
  ) {
    return transition({ type: "finish-transaction", token, disposition })
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
    const outcome = transition({ type: "move-layer", imageId: itemId, target })
    if (outcome.type !== "edit-applied") return
    pendingLayerFocusRef.current = { itemId, action }
    setStatus(message)
  }

  function reorderItemLayer(
    itemId: string,
    targetItemId: string,
    placement: "above" | "below"
  ) {
    const outcome = transition({
      type: "reorder-layer",
      imageId: itemId,
      targetImageId: targetItemId,
      placement,
    })
    if (outcome.type === "edit-applied") setStatus("Layer reordered")
  }

  function applyAspectRatioPreset(preset: AspectRatioPreset) {
    const outcome = transition({
      type: "set-canvas-ratio",
      ratio: preset.width / preset.height,
    })
    if (outcome.type === "edit-applied") {
      setStatus(`Canvas ratio ${preset.label}`)
    }
  }

  function restoreOriginalCanvas() {
    const outcome = transition({ type: "restore-loaded-canvas" })
    if (outcome.type === "edit-applied") setStatus("original canvas ratio")
  }

  function nudgeSelection(key: string, step: number) {
    const offset = getArrowOffset(key, step)
    if (!offset) return null
    return transition({
      type: "nudge-selection",
      dx: offset.x,
      dy: offset.y,
    })
  }

  function undo() {
    const outcome = transition({ type: "undo" })
    if (outcome.type === "history-moved") setStatus("Undo")
    return outcome
  }

  function redo() {
    const outcome = transition({ type: "redo" })
    if (outcome.type === "history-moved") setStatus("Redo")
    return outcome
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
    selectedIds,
    zoom,
    setZoom,
    showCanvasMarkers,
    setShowCanvasMarkers,
    selectedItem,
    selectedItems,
    selectedIndex,
    selectedIdSet,
    layerListEntries,
    layerIndexById,
    viewportScale,
    activeRatio,
    canvasMaxSide,
    transaction: snapshot.transaction,
    applyLayout,
    beginTransaction,
    previewTransaction,
    finishTransaction,
    clearSelection,
    selectOnlyItem,
    focusItem,
    selectItem,
    moveItemLayer,
    moveItemLayerTo,
    reorderItemLayer,
    applyAspectRatioPreset,
    restoreOriginalCanvas,
    nudgeSelection,
    setLayerActionRef,
    setLayerRowRef,
    undo,
    redo,
  }
}

export type EditorTransitionOutcome = EditorDocumentOutcome
