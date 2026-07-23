import { useEffect, useEffectEvent } from "react"

import type { EditorTransitionOutcome } from "./use-editor-document"

type EditorShortcutsOptions = {
  selectedIds: string[]
  save: () => Promise<void> | void
  undo: () => EditorTransitionOutcome
  redo: () => EditorTransitionOutcome
  clearSelection: () => unknown
  nudgeSelection: (key: string, step: number) => EditorTransitionOutcome | null
  setStatus: (message: string) => void
}

export function useEditorShortcuts(options: EditorShortcutsOptions) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
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
    const outcome = options.nudgeSelection(event.key, event.shiftKey ? 10 : 1)
    if (!outcome) return
    event.preventDefault()
    if (outcome.type === "edit-applied") options.setStatus("Selection moved")
  })

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input,textarea,select"))
  )
}
