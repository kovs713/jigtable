import type { Dispatch, SetStateAction } from "react"
import { useEffect } from "react"

import { getArrowOffset, moveItemsWithinCanvas } from "../model/layout"
import type { CanvasLayout } from "../model/types"

type EditorShortcutsOptions = {
  selectedIds: string[]
  save: () => Promise<void>
  undo: () => void
  redo: () => void
  clearSelection: () => void
  recordLayoutChange: Dispatch<SetStateAction<CanvasLayout>>
  setStatus: (message: string) => void
}

export function useEditorShortcuts(options: EditorShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault()
        void options.save()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault()
        if (event.shiftKey) options.redo()
        else options.undo()
        return
      }
      if (event.key === "Escape") {
        if (isEditableTarget(event.target)) (event.target as HTMLElement).blur()
        options.clearSelection()
        options.setStatus("Selection cleared")
        return
      }
      if (!options.selectedIds.length || isEditableTarget(event.target)) return
      const offset = getArrowOffset(event.key, event.shiftKey ? 10 : 1)
      if (!offset) return
      event.preventDefault()
      options.recordLayoutChange((current) => {
        const selectedIdSet = new Set(options.selectedIds)
        const moved = moveItemsWithinCanvas(
          current.items.filter((item) => selectedIdSet.has(item.id)),
          current.canvas,
          offset.x,
          offset.y
        )
        const movedById = new Map(moved.map((item) => [item.id, item]))
        return {
          ...current,
          items: current.items.map((item) => movedById.get(item.id) ?? item),
        }
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [options])
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input,textarea,select"))
  )
}
