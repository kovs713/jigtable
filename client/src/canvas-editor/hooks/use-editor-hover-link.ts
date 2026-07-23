import { useCallback, useEffect, useRef, useState } from "react"

import { getConnectorPath } from "../model/markers"
import type { CanvasItem, HoverLinkLine } from "../model/types"

export function useEditorHoverLink(items: CanvasItem[], viewportScale: number) {
  const [hoverLinkItemId, setHoveredItem] = useState("")
  const [hoverLinkLine, setHoverLinkLine] = useState<HoverLinkLine | null>(null)
  const canvasItemRefs = useRef(new Map<string, HTMLElement>())
  const layerRowRefs = useRef(new Map<string, HTMLDivElement>())

  const getHoverLinkLine = useCallback(
    (itemId: string) => {
      const row = layerRowRefs.current.get(itemId)
      const item = canvasItemRefs.current.get(itemId)
      const itemIndex = items.findIndex((candidate) => candidate.id === itemId)
      if (!row || !item || itemIndex < 0) return null
      return {
        itemIndex,
        path: getConnectorPath(
          row.getBoundingClientRect(),
          item.getBoundingClientRect()
        ),
      }
    },
    [items]
  )

  useEffect(() => {
    if (!hoverLinkItemId) return
    let animationFrame = 0
    const update = () => {
      animationFrame = 0
      setHoverLinkLine(getHoverLinkLine(hoverLinkItemId))
    }
    const schedule = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(update)
    }
    schedule()
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", schedule, true)
    return () => {
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [getHoverLinkLine, hoverLinkItemId, viewportScale])

  function setCanvasItemRef(itemId: string) {
    return (node: HTMLElement | null) => {
      if (node) canvasItemRefs.current.set(itemId, node)
      else canvasItemRefs.current.delete(itemId)
    }
  }
  function setLayerRowRef(itemId: string) {
    return (node: HTMLDivElement | null) => {
      if (node) layerRowRefs.current.set(itemId, node)
      else layerRowRefs.current.delete(itemId)
    }
  }

  return {
    hoverLinkItemId,
    hoverLinkLine,
    setHoveredItem,
    setCanvasItemRef,
    setLayerRowRef,
  }
}
