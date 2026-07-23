import type { Dispatch, SetStateAction } from "react"
import { useCallback, useLayoutEffect, useRef } from "react"

import { HISTORY_LIMIT } from "../model/constants"
import type { CanvasLayout } from "../model/types"

export function useEditorHistory(
  layout: CanvasLayout,
  setLayout: Dispatch<SetStateAction<CanvasLayout>>
) {
  const layoutRef = useRef(layout)
  const pastRef = useRef<CanvasLayout[]>([])
  const futureRef = useRef<CanvasLayout[]>([])
  useLayoutEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const recordChange = useCallback(
    (next: CanvasLayout | ((current: CanvasLayout) => CanvasLayout)) => {
      pastRef.current.push(structuredClone(layoutRef.current))
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
      futureRef.current.length = 0
      setLayout(next)
    },
    [setLayout]
  )

  const undo = useCallback(() => {
    const previous = pastRef.current.pop()
    if (!previous) return false
    futureRef.current.push(structuredClone(layoutRef.current))
    setLayout(previous)
    return true
  }, [setLayout])

  const redo = useCallback(() => {
    const next = futureRef.current.pop()
    if (!next) return false
    pastRef.current.push(structuredClone(layoutRef.current))
    setLayout(next)
    return true
  }, [setLayout])

  const commitDrag = useCallback((startLayout: CanvasLayout) => {
    const current = layoutRef.current
    if (
      startLayout.canvas === current.canvas &&
      startLayout.items === current.items
    ) {
      return
    }
    pastRef.current.push(startLayout)
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
    futureRef.current.length = 0
  }, [])

  return { layoutRef, recordChange, undo, redo, commitDrag }
}
