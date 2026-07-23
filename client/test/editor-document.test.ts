import { describe, expect, test } from "bun:test"

import {
  createEditorDocument,
  transitionEditorDocument,
} from "../src/canvas-editor/model/editor-document"
import type { CanvasLayout } from "../src/canvas-editor/model/types"

const firstLayout: CanvasLayout = {
  canvas: { width: 800, height: 600 },
  items: [
    {
      id: "first",
      src: "/first.jpg",
      x: 20,
      y: 30,
      width: 200,
      height: 150,
    },
    {
      id: "second",
      src: "/second.jpg",
      x: 260,
      y: 80,
      width: 180,
      height: 220,
    },
  ],
}

describe("Editor Document", () => {
  test("loads a composition as a fresh baseline", () => {
    const initial = createEditorDocument()

    const loaded = transitionEditorDocument(initial, {
      type: "load",
      layout: firstLayout,
    })

    expect(loaded.outcome).toEqual({
      type: "loaded",
      selectedImageId: "first",
    })
    expect(loaded.document.snapshot.layout).toEqual({
      ...firstLayout,
      items: [
        { ...firstLayout.items[0], zIndex: 0 },
        { ...firstLayout.items[1], zIndex: 1 },
      ],
    })
    expect(loaded.document.snapshot.selectedIds).toEqual(["first"])
    expect(loaded.document.snapshot.canUndo).toBe(false)
    expect(loaded.document.snapshot.canRedo).toBe(false)
    expect(loaded.document.snapshot.transaction).toBeNull()
    expect(Object.isFrozen(loaded.document)).toBe(true)
    expect(Object.isFrozen(loaded.document.snapshot)).toBe(true)
    expect(Object.isFrozen(loaded.document.snapshot.layout.items[0])).toBe(true)
  })

  test("rejects an invalid load without changing the document", () => {
    const initial = createEditorDocument()
    const invalid: CanvasLayout = {
      canvas: { width: 800, height: 600 },
      items: [
        firstLayout.items[0],
        { ...firstLayout.items[1], id: firstLayout.items[0].id },
      ],
    }

    const result = transitionEditorDocument(initial, {
      type: "load",
      layout: invalid,
    })

    expect(result.outcome).toEqual({
      type: "rejected",
      reason: "invalid-layout",
    })
    expect(result.document).toBe(initial)
  })

  test("records a discrete edit and traverses its history", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document

    const moved = transitionEditorDocument(loaded, {
      type: "nudge-selection",
      dx: 10,
      dy: -5,
    })

    expect(moved.outcome).toEqual({ type: "edit-applied", edit: "nudge" })
    expect(moved.document.snapshot.layout.items[0]).toMatchObject({
      x: 30,
      y: 25,
    })
    expect(moved.document.snapshot.canUndo).toBe(true)

    const undone = transitionEditorDocument(moved.document, { type: "undo" })
    expect(undone.outcome).toEqual({
      type: "history-moved",
      direction: "undo",
    })
    expect(undone.document.snapshot.layout.items[0]).toMatchObject({
      x: 20,
      y: 30,
    })
    expect(undone.document.snapshot.canRedo).toBe(true)

    const redone = transitionEditorDocument(undone.document, { type: "redo" })
    expect(redone.document.snapshot.layout.items[0]).toMatchObject({
      x: 30,
      y: 25,
    })
  })

  test("does not record a clamped no-op or clear redo", () => {
    const edgeLayout: CanvasLayout = {
      canvas: { width: 300, height: 200 },
      items: [
        {
          id: "edge",
          src: "/edge.jpg",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    }
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: edgeLayout,
    }).document
    const moved = transitionEditorDocument(loaded, {
      type: "nudge-selection",
      dx: 10,
      dy: 0,
    }).document
    const undone = transitionEditorDocument(moved, { type: "undo" }).document

    const unchanged = transitionEditorDocument(undone, {
      type: "nudge-selection",
      dx: -10,
      dy: 0,
    })

    expect(unchanged.outcome).toEqual({ type: "unchanged", reason: "no-op" })
    expect(unchanged.document).toBe(undone)
    expect(unchanged.document.snapshot.canRedo).toBe(true)
  })

  test("owns selection without adding selection changes to history", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document

    const selected = transitionEditorDocument(loaded, {
      type: "select",
      imageId: "second",
      mode: "add",
    })

    expect(selected.outcome).toEqual({
      type: "selection-changed",
      selectedIds: ["second", "first"],
    })
    expect(selected.document.snapshot.selectedIds).toEqual(["second", "first"])
    expect(selected.document.snapshot.canUndo).toBe(false)

    const moved = transitionEditorDocument(selected.document, {
      type: "nudge-selection",
      dx: 5,
      dy: 0,
    }).document
    const undone = transitionEditorDocument(moved, { type: "undo" }).document

    expect(undone.snapshot.selectedIds).toEqual(["second", "first"])
  })

  test("commits many gesture previews as one history entry", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document
    const began = transitionEditorDocument(loaded, {
      type: "begin-transaction",
      interaction: { type: "move-selection" },
    })
    if (began.outcome.type !== "transaction-started") {
      throw new Error("Expected transaction to start")
    }

    const firstPreview = transitionEditorDocument(began.document, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "move-selection", dx: 10, dy: 0 },
    }).document
    const secondPreview = transitionEditorDocument(firstPreview, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "move-selection", dx: 20, dy: 0 },
    }).document

    expect(secondPreview.snapshot.layout.items[0].x).toBe(40)
    expect(secondPreview.snapshot.canUndo).toBe(false)

    const committed = transitionEditorDocument(secondPreview, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "commit",
    })

    expect(committed.outcome).toEqual({
      type: "transaction-finished",
      disposition: "commit",
      changed: true,
    })
    expect(committed.document.snapshot.canUndo).toBe(true)
    const undone = transitionEditorDocument(committed.document, {
      type: "undo",
    }).document
    expect(undone.snapshot.layout.items[0].x).toBe(20)
    expect(undone.snapshot.canUndo).toBe(false)
  })

  test("rolls back cancellation and rejects stale transaction events", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document
    const began = transitionEditorDocument(loaded, {
      type: "begin-transaction",
      interaction: { type: "move-selection" },
    })
    if (began.outcome.type !== "transaction-started") {
      throw new Error("Expected transaction to start")
    }
    const previewed = transitionEditorDocument(began.document, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "move-selection", dx: 80, dy: 0 },
    }).document

    const blocked = transitionEditorDocument(previewed, {
      type: "nudge-selection",
      dx: 1,
      dy: 0,
    })
    expect(blocked.outcome).toEqual({
      type: "rejected",
      reason: "transaction-active",
    })

    const rolledBack = transitionEditorDocument(previewed, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "rollback",
    })
    expect(rolledBack.document.snapshot.layout.items[0].x).toBe(20)
    expect(rolledBack.document.snapshot.canUndo).toBe(false)

    const stale = transitionEditorDocument(rolledBack.document, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "commit",
    })
    expect(stale.outcome).toEqual({
      type: "rejected",
      reason: "stale-transaction",
    })
    expect(stale.document).toBe(rolledBack.document)
  })

  test("coalesces a property edit session", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document
    const began = transitionEditorDocument(loaded, {
      type: "begin-transaction",
      interaction: { type: "primary-field", field: "x" },
    })
    if (began.outcome.type !== "transaction-started") {
      throw new Error("Expected transaction to start")
    }
    const firstPreview = transitionEditorDocument(began.document, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "primary-field", field: "x", value: 45 },
    }).document
    const secondPreview = transitionEditorDocument(firstPreview, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "primary-field", field: "x", value: 70 },
    }).document
    const committed = transitionEditorDocument(secondPreview, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "commit",
    }).document

    expect(committed.snapshot.layout.items[0].x).toBe(70)
    const undone = transitionEditorDocument(committed, {
      type: "undo",
    }).document
    expect(undone.snapshot.layout.items[0].x).toBe(20)
    expect(undone.snapshot.canUndo).toBe(false)
  })

  test("calculates continuous canvas previews from their baseline", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document
    const began = transitionEditorDocument(loaded, {
      type: "begin-transaction",
      interaction: { type: "canvas-dimension", field: "width" },
    })
    if (began.outcome.type !== "transaction-started") {
      throw new Error("Expected transaction to start")
    }
    const firstPreview = transitionEditorDocument(began.document, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "canvas-dimension", field: "width", value: 900 },
    }).document
    const secondPreview = transitionEditorDocument(firstPreview, {
      type: "preview-transaction",
      token: began.outcome.token,
      edit: { type: "canvas-dimension", field: "width", value: 1_000 },
    }).document

    expect(secondPreview.snapshot.layout.canvas).toEqual({
      width: 1_000,
      height: 600,
    })
    expect(secondPreview.snapshot.layout.items[0]).toMatchObject({
      x: 25,
      width: 250,
    })

    const committed = transitionEditorDocument(secondPreview, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "commit",
    }).document
    const undone = transitionEditorDocument(committed, { type: "undo" })
    expect(undone.document.snapshot.layout.canvas).toEqual({
      width: 800,
      height: 600,
    })
  })

  test("moves layers through the same history interface", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document

    const moved = transitionEditorDocument(loaded, {
      type: "move-layer",
      imageId: "first",
      target: 1,
    })

    expect(moved.outcome).toEqual({
      type: "edit-applied",
      edit: "layer",
    })
    expect(moved.document.snapshot.layout.items).toMatchObject([
      { id: "first", zIndex: 1 },
      { id: "second", zIndex: 0 },
    ])
    expect(moved.document.snapshot.selectedIds).toEqual(["first"])

    const undone = transitionEditorDocument(moved.document, { type: "undo" })
    expect(undone.document.snapshot.layout.items).toMatchObject([
      { id: "first", zIndex: 0 },
      { id: "second", zIndex: 1 },
    ])
  })

  test("changes and restores the loaded canvas as durable edits", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document

    const square = transitionEditorDocument(loaded, {
      type: "set-canvas-ratio",
      ratio: 1,
    })
    expect(square.outcome).toEqual({
      type: "edit-applied",
      edit: "canvas",
    })
    expect(square.document.snapshot.layout.canvas).toEqual({
      width: 693,
      height: 693,
    })
    expect(square.document.snapshot.selectedIds).toEqual([])

    const restored = transitionEditorDocument(square.document, {
      type: "restore-loaded-canvas",
    })
    expect(restored.document.snapshot.layout.canvas).toEqual({
      width: 800,
      height: 600,
    })
    expect(restored.document.snapshot.canUndo).toBe(true)
  })

  test("a new load supersedes transactions and clears prior history", () => {
    const loaded = transitionEditorDocument(createEditorDocument(), {
      type: "load",
      layout: firstLayout,
    }).document
    const edited = transitionEditorDocument(loaded, {
      type: "nudge-selection",
      dx: 10,
      dy: 0,
    }).document
    const began = transitionEditorDocument(edited, {
      type: "begin-transaction",
      interaction: { type: "move-selection" },
    })
    if (began.outcome.type !== "transaction-started") {
      throw new Error("Expected transaction to start")
    }
    const nextLayout: CanvasLayout = {
      canvas: { width: 400, height: 400 },
      items: [
        {
          id: "next",
          src: "/next.jpg",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    }

    const reloaded = transitionEditorDocument(began.document, {
      type: "load",
      layout: nextLayout,
    })

    expect(reloaded.document.snapshot.selectedIds).toEqual(["next"])
    expect(reloaded.document.snapshot.canUndo).toBe(false)
    expect(reloaded.document.snapshot.canRedo).toBe(false)
    expect(reloaded.document.snapshot.transaction).toBeNull()
    const stale = transitionEditorDocument(reloaded.document, {
      type: "finish-transaction",
      token: began.outcome.token,
      disposition: "commit",
    })
    expect(stale.outcome).toEqual({
      type: "rejected",
      reason: "stale-transaction",
    })
  })
})
