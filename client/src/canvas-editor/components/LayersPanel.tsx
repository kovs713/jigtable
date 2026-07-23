import type { DragEvent, MouseEvent } from "react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import {
  getImageAriaLabel,
  getImageMarkerCode,
  getImageMarkerStyle,
} from "../model/markers"
import type {
  LayerAction,
  LayerDropPreview,
  LayerEntry,
  SelectionMode,
} from "../model/types"
import { LayerActionButton } from "./LayerActionButton"
import { PanelHeader } from "./PanelHeader"

type LayersPanelProps = {
  entries: LayerEntry[]
  itemCount: number
  selectedIdSet: Set<string>
  hoverLinkItemId: string
  setHoveredItem: (itemId: string) => void
  setLayerRowRef: (itemId: string) => (node: HTMLDivElement | null) => void
  setLayerActionRef: (
    itemId: string,
    action: LayerAction
  ) => (node: HTMLButtonElement | null) => void
  onSelect: (itemId: string, mode: SelectionMode) => void
  onFocus: (itemId: string) => void
  onMoveLayer: (itemId: string, direction: -1 | 1, action: LayerAction) => void
  onMoveLayerTo: (
    itemId: string,
    target: number,
    message: string,
    action: LayerAction
  ) => void
  onReorder: (
    itemId: string,
    targetItemId: string,
    placement: "above" | "below"
  ) => void
  onStatus: (message: string) => void
}

export function LayersPanel(props: LayersPanelProps) {
  const [draggedLayerId, setDraggedLayerId] = useState("")
  const [dropPreview, setDropPreview] = useState<LayerDropPreview | null>(null)

  function selectionMode(
    event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">
  ): SelectionMode {
    if (event.ctrlKey || event.metaKey) return "toggle"
    if (event.shiftKey) return "add"
    return "replace"
  }

  function dropPlacement(event: DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY <= bounds.top + bounds.height / 2 ? "above" : "below"
  }

  return (
    <aside className="layers-panel glass-sidebar corner-brackets">
      <PanelHeader title="layers" meta="Drag to reorder" />
      <div className="layers-panel__list thin-scrollbar">
        {props.entries.map(({ item, itemIndex, layerIndex }) => {
          const isSelected = props.selectedIdSet.has(item.id)
          const isLinked = props.hoverLinkItemId === item.id
          const imageLabel = getImageAriaLabel(itemIndex)
          const isBottomLayer = layerIndex === 0
          const isTopLayer = layerIndex === props.itemCount - 1
          const placement =
            dropPreview?.itemId === item.id ? dropPreview.placement : null
          return (
            <div
              key={item.id}
              draggable
              ref={props.setLayerRowRef(item.id)}
              className={cn(
                "layer-row",
                draggedLayerId === item.id && "layer-row--dragging",
                (isSelected || isLinked) && "layer-row--active"
              )}
              style={getImageMarkerStyle(itemIndex)}
              onDragEnd={() => {
                setDraggedLayerId("")
                setDropPreview(null)
              }}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                  )
                )
                  setDropPreview((current) =>
                    current?.itemId === item.id ? null : current
                  )
              }}
              onDragOver={(event) => {
                if (!draggedLayerId) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                setDropPreview({
                  itemId: item.id,
                  placement: dropPlacement(event),
                })
              }}
              onDragStart={(event) => {
                event.stopPropagation()
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", item.id)
                setDraggedLayerId(item.id)
                props.onFocus(item.id)
                props.onStatus("Drag layer")
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDropPreview(null)
                const source =
                  draggedLayerId || event.dataTransfer.getData("text/plain")
                if (source && source !== item.id)
                  props.onReorder(source, item.id, dropPlacement(event))
                setDraggedLayerId("")
              }}
              onPointerEnter={() => props.setHoveredItem(item.id)}
              onPointerLeave={() => props.setHoveredItem("")}
            >
              {placement ? (
                <span
                  className={cn(
                    "layer-row__drop-indicator",
                    placement === "above"
                      ? "layer-row__drop-indicator--above"
                      : "layer-row__drop-indicator--below"
                  )}
                />
              ) : null}
              <button
                className="layer-row__summary"
                type="button"
                onClick={(event) =>
                  props.onSelect(item.id, selectionMode(event))
                }
              >
                <span className="layer-row__marker">
                  {getImageMarkerCode(itemIndex)}
                </span>
                <span className="layer-row__label">
                  layer {layerIndex + 1} / {props.itemCount}
                </span>
                <span className="layer-row__dimensions">
                  {item.width}x{item.height}
                </span>
              </button>
              <div className="layer-row__actions">
                <LayerActionButton
                  aria-label={`Move ${imageLabel} to top layer`}
                  disabled={isTopLayer}
                  ref={props.setLayerActionRef(item.id, "top")}
                  onClick={() =>
                    props.onMoveLayerTo(
                      item.id,
                      props.itemCount - 1,
                      "Layer moved to top",
                      "top"
                    )
                  }
                >
                  <LayerIcon action="top" />
                </LayerActionButton>
                <LayerActionButton
                  aria-label={`Raise ${imageLabel}`}
                  disabled={isTopLayer}
                  ref={props.setLayerActionRef(item.id, "up")}
                  onClick={() => props.onMoveLayer(item.id, 1, "up")}
                >
                  <LayerIcon action="up" />
                </LayerActionButton>
                <LayerActionButton
                  aria-label={`Lower ${imageLabel}`}
                  disabled={isBottomLayer}
                  ref={props.setLayerActionRef(item.id, "down")}
                  onClick={() => props.onMoveLayer(item.id, -1, "down")}
                >
                  <LayerIcon action="down" />
                </LayerActionButton>
                <LayerActionButton
                  aria-label={`Move ${imageLabel} to bottom layer`}
                  disabled={isBottomLayer}
                  ref={props.setLayerActionRef(item.id, "bottom")}
                  onClick={() =>
                    props.onMoveLayerTo(
                      item.id,
                      0,
                      "Layer moved to bottom",
                      "bottom"
                    )
                  }
                >
                  <LayerIcon action="bottom" />
                </LayerActionButton>
              </div>
            </div>
          )
        })}
        {!props.itemCount ? (
          <p className="layers-panel__empty">
            Open the link from the bot after sending and committing images.
          </p>
        ) : null}
      </div>
    </aside>
  )
}

function LayerIcon({ action }: { action: LayerAction }) {
  const paths = {
    top: "M5 4h14M12 20V8M6 12l6-6 6 6",
    up: "M12 19V5M5 12l7-7 7 7",
    down: "M12 5v14M19 12l-7 7-7-7",
    bottom: "M12 4v12M6 12l6 6 6-6M5 20h14",
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[action]} />
    </svg>
  )
}
