import { EMPTY_LAYOUT, HISTORY_LIMIT } from "./constants"
import { moveLayer, reorderLayer } from "./layers"
import {
  clampCanvas,
  clampCanvasSize,
  clampItem,
  getCanvasForMaxSide,
  getCanvasForRatio,
  moveItemsWithinCanvas,
  normalizeCanvasLayout,
  resizeCanvasLayout,
  resizeItemFromEdge,
  resizeItemsFromEdge,
  scaleItemsToCanvas,
  updateScale,
} from "./layout"
import type {
  CanvasLayout,
  CanvasSize,
  ResizeEdge,
  SelectionMode,
} from "./types"

const editorDocumentState = Symbol("editorDocumentState")

type EditorDocumentState = {
  layout: CanvasLayout
  originalCanvas: CanvasSize
  selectedIds: string[]
  past: CanvasLayout[]
  future: CanvasLayout[]
  transaction: EditorTransaction | null
  nextTransactionToken: number
}

type EditorTransaction = {
  token: EditorTransactionToken
  interaction: EditorInteraction
  baseline: CanvasLayout
  targetIds: string[]
}

type EditorItemField = "x" | "y" | "width" | "height"

export type EditorInteraction =
  | Readonly<{ type: "move-selection" }>
  | Readonly<{ type: "resize-selection"; edge: ResizeEdge }>
  | Readonly<{
      type: "resize-canvas"
      edge: ResizeEdge
      scaleItems: boolean
    }>
  | Readonly<{
      type: "primary-field"
      field: EditorItemField
    }>
  | Readonly<{
      type: "canvas-dimension"
      field: "width" | "height"
    }>
  | Readonly<{ type: "canvas-max-side" }>

export type EditorTransactionEdit =
  | Readonly<{
      type: "move-selection"
      dx: number
      dy: number
    }>
  | Readonly<{
      type: "resize-selection"
      edge: ResizeEdge
      dx: number
      dy: number
      keepRatio: boolean
    }>
  | Readonly<{
      type: "resize-canvas"
      edge: ResizeEdge
      scaleItems: boolean
      dx: number
      dy: number
    }>
  | Readonly<{
      type: "primary-field"
      field: EditorItemField
      value: number
    }>
  | Readonly<{
      type: "canvas-dimension"
      field: "width" | "height"
      value: number
    }>
  | Readonly<{
      type: "canvas-max-side"
      value: number
    }>

export type EditorTransactionToken = number & {
  readonly editorTransactionToken: unique symbol
}

export type EditorDocumentSnapshot = Readonly<{
  layout: CanvasLayout
  originalCanvas: CanvasSize
  selectedIds: readonly string[]
  canUndo: boolean
  canRedo: boolean
  transaction: Readonly<{
    token: EditorTransactionToken
    kind: string
  }> | null
}>

export type EditorDocument = Readonly<{
  snapshot: EditorDocumentSnapshot
  [editorDocumentState]: EditorDocumentState
}>

export type EditorDocumentIntent =
  | Readonly<{
      type: "load"
      layout: CanvasLayout
    }>
  | Readonly<{
      type: "nudge-selection"
      dx: number
      dy: number
    }>
  | Readonly<{
      type: "select"
      imageId: string
      mode: SelectionMode
    }>
  | Readonly<{
      type: "focus"
      imageId: string
    }>
  | Readonly<{ type: "clear-selection" }>
  | Readonly<{
      type: "move-layer"
      imageId: string
      target: number
    }>
  | Readonly<{
      type: "reorder-layer"
      imageId: string
      targetImageId: string
      placement: "above" | "below"
    }>
  | Readonly<{
      type: "set-canvas-ratio"
      ratio: number
    }>
  | Readonly<{ type: "restore-loaded-canvas" }>
  | Readonly<{
      type: "begin-transaction"
      interaction: EditorInteraction
    }>
  | Readonly<{
      type: "preview-transaction"
      token: EditorTransactionToken
      edit: EditorTransactionEdit
    }>
  | Readonly<{
      type: "finish-transaction"
      token: EditorTransactionToken
      disposition: "commit" | "rollback"
    }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>

export type EditorDocumentOutcome =
  | Readonly<{
      type: "loaded"
      selectedImageId: string | null
    }>
  | Readonly<{
      type: "rejected"
      reason:
        | "invalid-layout"
        | "invalid-edit"
        | "no-selection"
        | "unknown-image"
        | "transaction-active"
        | "stale-transaction"
        | "transaction-mismatch"
    }>
  | Readonly<{
      type: "edit-applied"
      edit: "nudge" | "layer" | "canvas"
    }>
  | Readonly<{
      type: "history-moved"
      direction: "undo" | "redo"
    }>
  | Readonly<{
      type: "unchanged"
      reason: "no-op" | "history-empty"
    }>
  | Readonly<{
      type: "selection-changed"
      selectedIds: readonly string[]
    }>
  | Readonly<{
      type: "transaction-started"
      token: EditorTransactionToken
    }>
  | Readonly<{
      type: "transaction-previewed"
      changed: boolean
    }>
  | Readonly<{
      type: "transaction-finished"
      disposition: "commit" | "rollback"
      changed: boolean
    }>

export type EditorDocumentTransition = Readonly<{
  document: EditorDocument
  outcome: EditorDocumentOutcome
}>

export function createEditorDocument(): EditorDocument {
  const layout = cloneLayout(EMPTY_LAYOUT)
  return createDocument({
    layout,
    originalCanvas: { ...layout.canvas },
    selectedIds: [],
    past: [],
    future: [],
    transaction: null,
    nextTransactionToken: 1,
  })
}

export function transitionEditorDocument(
  document: EditorDocument,
  intent: EditorDocumentIntent
): EditorDocumentTransition {
  if (intent.type === "load") return loadDocument(document, intent.layout)
  if (intent.type === "begin-transaction") {
    return beginTransaction(document, intent.interaction)
  }
  if (intent.type === "preview-transaction") {
    return previewTransaction(document, intent.token, intent.edit)
  }
  if (intent.type === "finish-transaction") {
    return finishTransaction(document, intent.token, intent.disposition)
  }
  if (document[editorDocumentState].transaction) {
    return rejected(document, "transaction-active")
  }
  if (
    intent.type === "select" ||
    intent.type === "focus" ||
    intent.type === "clear-selection"
  ) {
    return changeSelection(document, intent)
  }
  if (intent.type === "nudge-selection") {
    return nudgeSelection(document, intent.dx, intent.dy)
  }
  if (intent.type === "move-layer" || intent.type === "reorder-layer") {
    return changeLayer(document, intent)
  }
  if (
    intent.type === "set-canvas-ratio" ||
    intent.type === "restore-loaded-canvas"
  ) {
    return changeCanvas(document, intent)
  }
  if (intent.type === "undo" || intent.type === "redo") {
    return moveHistory(document, intent.type)
  }
  return assertNever(intent)
}

function loadDocument(
  document: EditorDocument,
  input: CanvasLayout
): EditorDocumentTransition {
  if (!isValidLayout(input)) {
    return {
      document,
      outcome: { type: "rejected", reason: "invalid-layout" },
    }
  }
  const state = document[editorDocumentState]
  const layout = normalizeCanvasLayout(cloneLayout(input))
  const selectedImageId = layout.items[0]?.id ?? null
  return {
    document: createDocument({
      layout,
      originalCanvas: { ...layout.canvas },
      selectedIds: selectedImageId ? [selectedImageId] : [],
      past: [],
      future: [],
      transaction: null,
      nextTransactionToken: state.nextTransactionToken,
    }),
    outcome: { type: "loaded", selectedImageId },
  }
}

function beginTransaction(
  document: EditorDocument,
  interaction: EditorInteraction
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  if (state.transaction) return rejected(document, "transaction-active")
  const selectedIds = state.selectedIds.filter((id) =>
    state.layout.items.some((item) => item.id === id)
  )
  const targetIds =
    interaction.type === "primary-field" ? selectedIds.slice(0, 1) : selectedIds
  if (
    (interaction.type === "move-selection" ||
      interaction.type === "resize-selection" ||
      interaction.type === "primary-field") &&
    !targetIds.length
  ) {
    return rejected(document, "no-selection")
  }

  const token = state.nextTransactionToken as EditorTransactionToken
  return {
    document: createDocument({
      ...state,
      transaction: {
        token,
        interaction,
        baseline: state.layout,
        targetIds,
      },
      nextTransactionToken: state.nextTransactionToken + 1,
    }),
    outcome: { type: "transaction-started", token },
  }
}

function previewTransaction(
  document: EditorDocument,
  token: EditorTransactionToken,
  edit: EditorTransactionEdit
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  const transaction = state.transaction
  if (!transaction || transaction.token !== token) {
    return rejected(document, "stale-transaction")
  }
  if (!sameInteraction(transaction.interaction, edit)) {
    return rejected(document, "transaction-mismatch")
  }
  if (!validTransactionEdit(edit)) {
    return rejected(document, "invalid-edit")
  }

  const layout = previewLayout(transaction, edit)
  const changed = !sameLayout(transaction.baseline, layout)
  return {
    document: createDocument({ ...state, layout }),
    outcome: { type: "transaction-previewed", changed },
  }
}

function previewLayout(
  transaction: EditorTransaction,
  edit: EditorTransactionEdit
): CanvasLayout {
  const baseline = transaction.baseline
  const targetIdSet = new Set(transaction.targetIds)
  const targetItems = baseline.items.filter((item) => targetIdSet.has(item.id))

  if (edit.type === "move-selection") {
    const moved = moveItemsWithinCanvas(
      targetItems,
      baseline.canvas,
      edit.dx,
      edit.dy
    )
    return replaceItems(baseline, moved)
  }
  if (edit.type === "resize-selection") {
    const resized =
      targetItems.length > 1
        ? resizeItemsFromEdge(
            targetItems,
            baseline.canvas,
            edit.dx,
            edit.dy,
            edit.edge,
            edit.keepRatio
          )
        : targetItems[0]
          ? [
              resizeItemFromEdge(
                targetItems[0],
                baseline.canvas,
                edit.dx,
                edit.dy,
                edit.edge,
                edit.keepRatio
              ),
            ]
          : []
    return replaceItems(baseline, resized)
  }
  if (edit.type === "resize-canvas") {
    return resizeCanvasLayout(
      {
        mode: "canvas-resize",
        edge: edit.edge,
        startClientX: 0,
        startClientY: 0,
        startCanvas: baseline.canvas,
        startItems: baseline.items,
        scaleItems: edit.scaleItems,
      },
      edit.dx,
      edit.dy
    )
  }
  if (edit.type === "primary-field") {
    const targetId = transaction.targetIds[0]
    return {
      ...baseline,
      items: baseline.items.map((item) =>
        item.id === targetId
          ? clampItem(
              updateScale({ ...item, [edit.field]: edit.value }, item),
              baseline.canvas
            )
          : item
      ),
    }
  }

  const canvas =
    edit.type === "canvas-dimension"
      ? clampCanvas({
          ...baseline.canvas,
          [edit.field]: clampCanvasSize(edit.value),
        })
      : getCanvasForMaxSide(baseline.canvas, edit.value)
  return {
    canvas,
    items: scaleItemsToCanvas(baseline.canvas, baseline.items, canvas),
  }
}

function replaceItems(
  layout: CanvasLayout,
  replacements: CanvasLayout["items"]
): CanvasLayout {
  const replacementById = new Map(replacements.map((item) => [item.id, item]))
  return {
    ...layout,
    items: layout.items.map((item) => replacementById.get(item.id) ?? item),
  }
}

function sameInteraction(
  interaction: EditorInteraction,
  edit: EditorTransactionEdit
): boolean {
  if (interaction.type !== edit.type) return false
  if (interaction.type === "resize-selection") {
    return edit.type === "resize-selection" && interaction.edge === edit.edge
  }
  if (interaction.type === "resize-canvas") {
    return (
      edit.type === "resize-canvas" &&
      interaction.edge === edit.edge &&
      interaction.scaleItems === edit.scaleItems
    )
  }
  if (interaction.type === "primary-field") {
    return edit.type === "primary-field" && interaction.field === edit.field
  }
  if (interaction.type === "canvas-dimension") {
    return edit.type === "canvas-dimension" && interaction.field === edit.field
  }
  return true
}

function validTransactionEdit(edit: EditorTransactionEdit): boolean {
  if (
    edit.type === "move-selection" ||
    edit.type === "resize-selection" ||
    edit.type === "resize-canvas"
  ) {
    return Number.isFinite(edit.dx) && Number.isFinite(edit.dy)
  }
  return Number.isFinite(edit.value)
}

function finishTransaction(
  document: EditorDocument,
  token: EditorTransactionToken,
  disposition: "commit" | "rollback"
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  const transaction = state.transaction
  if (!transaction || transaction.token !== token) {
    return rejected(document, "stale-transaction")
  }

  const changed = !sameLayout(transaction.baseline, state.layout)
  const layout =
    disposition === "rollback" ? transaction.baseline : state.layout
  return {
    document: createDocument({
      ...state,
      layout,
      past:
        disposition === "commit" && changed
          ? [...state.past, transaction.baseline].slice(-HISTORY_LIMIT)
          : state.past,
      future: disposition === "commit" && changed ? [] : state.future,
      transaction: null,
    }),
    outcome: { type: "transaction-finished", disposition, changed },
  }
}

function changeSelection(
  document: EditorDocument,
  intent: Extract<
    EditorDocumentIntent,
    { type: "select" | "focus" | "clear-selection" }
  >
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  let selectedIds: string[]

  if (intent.type === "clear-selection") {
    selectedIds = []
  } else {
    if (!state.layout.items.some((item) => item.id === intent.imageId)) {
      return rejected(document, "unknown-image")
    }
    if (intent.type === "focus") {
      selectedIds = state.selectedIds.includes(intent.imageId)
        ? [
            intent.imageId,
            ...state.selectedIds.filter((id) => id !== intent.imageId),
          ]
        : [intent.imageId]
    } else if (intent.mode === "replace") {
      selectedIds = [intent.imageId]
    } else if (intent.mode === "add") {
      selectedIds = [
        intent.imageId,
        ...state.selectedIds.filter((id) => id !== intent.imageId),
      ]
    } else {
      selectedIds = state.selectedIds.includes(intent.imageId)
        ? state.selectedIds.filter((id) => id !== intent.imageId)
        : [intent.imageId, ...state.selectedIds]
    }
  }

  if (sameIds(state.selectedIds, selectedIds)) {
    return { document, outcome: { type: "unchanged", reason: "no-op" } }
  }
  return {
    document: createDocument({ ...state, selectedIds }),
    outcome: { type: "selection-changed", selectedIds },
  }
}

function nudgeSelection(
  document: EditorDocument,
  dx: number,
  dy: number
): EditorDocumentTransition {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return rejected(document, "invalid-edit")
  }
  const state = document[editorDocumentState]
  const selectedIdSet = new Set(state.selectedIds)
  const selectedItems = state.layout.items.filter((item) =>
    selectedIdSet.has(item.id)
  )
  if (!selectedItems.length) return rejected(document, "no-selection")

  const moved = moveItemsWithinCanvas(
    selectedItems,
    state.layout.canvas,
    dx,
    dy
  )
  const movedById = new Map(moved.map((item) => [item.id, item]))
  const layout = {
    ...state.layout,
    items: state.layout.items.map((item) => movedById.get(item.id) ?? item),
  }
  return commitEdit(document, layout, "nudge")
}

function changeLayer(
  document: EditorDocument,
  intent: Extract<
    EditorDocumentIntent,
    { type: "move-layer" | "reorder-layer" }
  >
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  if (!state.layout.items.some((item) => item.id === intent.imageId)) {
    return rejected(document, "unknown-image")
  }
  if (
    intent.type === "reorder-layer" &&
    !state.layout.items.some((item) => item.id === intent.targetImageId)
  ) {
    return rejected(document, "unknown-image")
  }

  const items =
    intent.type === "move-layer"
      ? moveLayer(state.layout.items, intent.imageId, intent.target)
      : reorderLayer(
          state.layout.items,
          intent.imageId,
          intent.targetImageId,
          intent.placement
        )
  const focusedDocument = createDocument({
    ...state,
    selectedIds: [
      intent.imageId,
      ...state.selectedIds.filter((id) => id !== intent.imageId),
    ],
  })
  return commitEdit(focusedDocument, { ...state.layout, items }, "layer")
}

function changeCanvas(
  document: EditorDocument,
  intent: Extract<
    EditorDocumentIntent,
    { type: "set-canvas-ratio" | "restore-loaded-canvas" }
  >
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  if (
    intent.type === "set-canvas-ratio" &&
    (!Number.isFinite(intent.ratio) || intent.ratio <= 0)
  ) {
    return rejected(document, "invalid-edit")
  }
  const canvas =
    intent.type === "set-canvas-ratio"
      ? getCanvasForRatio(state.layout.canvas, intent.ratio)
      : clampCanvas(state.originalCanvas)
  const layout = {
    canvas,
    items: scaleItemsToCanvas(state.layout.canvas, state.layout.items, canvas),
  }
  return commitEdit(
    createDocument({ ...state, selectedIds: [] }),
    layout,
    "canvas"
  )
}

function moveHistory(
  document: EditorDocument,
  direction: "undo" | "redo"
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  const source = direction === "undo" ? state.past : state.future
  const layout = source.at(-1)
  if (!layout) {
    return { document, outcome: { type: "unchanged", reason: "history-empty" } }
  }

  const past =
    direction === "undo" ? source.slice(0, -1) : [...state.past, state.layout]
  const future =
    direction === "undo" ? [...state.future, state.layout] : source.slice(0, -1)
  return {
    document: createDocument({
      ...state,
      layout,
      selectedIds: reconcileSelection(state.selectedIds, layout),
      past,
      future,
    }),
    outcome: { type: "history-moved", direction },
  }
}

function commitEdit(
  document: EditorDocument,
  layout: CanvasLayout,
  edit: Extract<EditorDocumentOutcome, { type: "edit-applied" }>["edit"]
): EditorDocumentTransition {
  const state = document[editorDocumentState]
  if (sameLayout(state.layout, layout)) {
    return { document, outcome: { type: "unchanged", reason: "no-op" } }
  }
  return {
    document: createDocument({
      ...state,
      layout,
      past: [...state.past, state.layout].slice(-HISTORY_LIMIT),
      future: [],
    }),
    outcome: { type: "edit-applied", edit },
  }
}

function rejected(
  document: EditorDocument,
  reason: Extract<EditorDocumentOutcome, { type: "rejected" }>["reason"]
): EditorDocumentTransition {
  return { document, outcome: { type: "rejected", reason } }
}

function createDocument(state: EditorDocumentState): EditorDocument {
  const frozenState = Object.freeze({
    ...state,
    layout: freezeLayout(state.layout),
    originalCanvas: Object.freeze({ ...state.originalCanvas }) as CanvasSize,
    selectedIds: Object.freeze([...state.selectedIds]) as string[],
    past: Object.freeze([...state.past]) as CanvasLayout[],
    future: Object.freeze([...state.future]) as CanvasLayout[],
    transaction: state.transaction
      ? (Object.freeze({
          ...state.transaction,
          interaction: Object.freeze({
            ...state.transaction.interaction,
          }),
          baseline: freezeLayout(state.transaction.baseline),
          targetIds: Object.freeze([
            ...state.transaction.targetIds,
          ]) as string[],
        }) as EditorTransaction)
      : null,
  }) as EditorDocumentState
  const snapshot = Object.freeze({
    layout: frozenState.layout,
    originalCanvas: frozenState.originalCanvas,
    selectedIds: frozenState.selectedIds,
    canUndo: frozenState.past.length > 0,
    canRedo: frozenState.future.length > 0,
    transaction: frozenState.transaction
      ? Object.freeze({
          token: frozenState.transaction.token,
          kind: frozenState.transaction.interaction.type,
        })
      : null,
  })
  return Object.freeze({
    snapshot,
    [editorDocumentState]: frozenState,
  })
}

function cloneLayout(layout: CanvasLayout): CanvasLayout {
  return {
    canvas: { ...layout.canvas },
    items: layout.items.map((item) => ({ ...item })),
  }
}

function freezeLayout(layout: CanvasLayout): CanvasLayout {
  if (Object.isFrozen(layout)) return layout
  const canvas = Object.freeze({ ...layout.canvas }) as CanvasSize
  const items = Object.freeze(
    layout.items.map((item) => Object.freeze({ ...item }))
  ) as CanvasLayout["items"]
  return Object.freeze({ canvas, items }) as CanvasLayout
}

function isValidLayout(layout: CanvasLayout): boolean {
  if (
    !layout ||
    !layout.canvas ||
    !Number.isFinite(layout.canvas.width) ||
    !Number.isFinite(layout.canvas.height) ||
    layout.canvas.width <= 0 ||
    layout.canvas.height <= 0 ||
    !Array.isArray(layout.items)
  ) {
    return false
  }

  const ids = new Set<string>()
  return layout.items.every((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.src !== "string" ||
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y) ||
      !Number.isFinite(item.width) ||
      !Number.isFinite(item.height) ||
      item.x < 0 ||
      item.y < 0 ||
      item.width <= 0 ||
      item.height <= 0 ||
      item.x + item.width > layout.canvas.width ||
      item.y + item.height > layout.canvas.height ||
      (item.scale !== undefined &&
        (!Number.isFinite(item.scale) || item.scale <= 0)) ||
      (item.zIndex !== undefined && !Number.isFinite(item.zIndex))
    ) {
      return false
    }
    ids.add(item.id)
    return true
  })
}

function reconcileSelection(
  selectedIds: string[],
  layout: CanvasLayout
): string[] {
  const itemIds = new Set(layout.items.map((item) => item.id))
  return selectedIds.filter((id) => itemIds.has(id))
}

function sameLayout(first: CanvasLayout, second: CanvasLayout): boolean {
  return (
    first.canvas.width === second.canvas.width &&
    first.canvas.height === second.canvas.height &&
    first.items.length === second.items.length &&
    first.items.every((item, index) => {
      const other = second.items[index]
      return (
        other !== undefined &&
        item.id === other.id &&
        item.src === other.src &&
        item.x === other.x &&
        item.y === other.y &&
        item.width === other.width &&
        item.height === other.height &&
        item.scale === other.scale &&
        item.zIndex === other.zIndex
      )
    })
  )
}

function sameIds(first: string[], second: string[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Editor Document intent: ${JSON.stringify(value)}`)
}
