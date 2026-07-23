import type { PointerEvent } from "react"

import { cn } from "@/lib/utils"

import {
  getCanvasMarkerStyle,
  getImageAriaLabel,
  getImageMarkerCode,
  getImageMarkerStyle,
} from "../model/markers"
import type { CanvasItem, CanvasLayout, ResizeEdge } from "../model/types"
import { ResizeHandles } from "./ResizeHandles"

type CanvasStageProps = {
  layout: CanvasLayout
  viewportScale: number
  selectedIdSet: Set<string>
  layerIndexById: Map<string, number>
  hoverLinkItemId: string
  showCanvasMarkers: boolean
  setHoveredItem: (itemId: string) => void
  setCanvasItemRef: (itemId: string) => (node: HTMLElement | null) => void
  onClearSelection: () => void
  onStartMove: (event: PointerEvent<HTMLElement>, item: CanvasItem) => void
  onStartItemResize: (
    event: PointerEvent<Element>,
    item: CanvasItem,
    edge: ResizeEdge
  ) => void
  onStartCanvasResize: (event: PointerEvent<Element>, edge: ResizeEdge) => void
}

export function CanvasStage(props: CanvasStageProps) {
  return (
    <section className="canvas-stage">
      <div className="canvas-stage__scroll thin-scrollbar">
        <div
          className="canvas-frame group"
          style={{
            width: props.layout.canvas.width * props.viewportScale,
            height: props.layout.canvas.height * props.viewportScale,
            ...getCanvasMarkerStyle(),
          }}
        >
          <div
            className="canvas-frame__resize-layer"
            data-resize-target="canvas"
          >
            <ResizeHandles
              active={false}
              labelPrefix="Canvas"
              variant="canvas"
              onPointerDown={props.onStartCanvasResize}
            />
          </div>
          <div
            className="canvas-board canvas-grid"
            onPointerDown={(event) => {
              if (event.button === 0) props.onClearSelection()
            }}
          >
            {props.layout.items.map((item, index) => {
              const isSelected = props.selectedIdSet.has(item.id)
              const isLinked = props.hoverLinkItemId === item.id
              return (
                <article
                  key={item.id}
                  ref={props.setCanvasItemRef(item.id)}
                  className="canvas-item group"
                  style={{
                    left: item.x * props.viewportScale,
                    top: item.y * props.viewportScale,
                    width: item.width * props.viewportScale,
                    height: item.height * props.viewportScale,
                    zIndex: (props.layerIndexById.get(item.id) ?? index) + 1,
                    ...getImageMarkerStyle(index),
                  }}
                  onPointerEnter={() => props.setHoveredItem(item.id)}
                  onPointerLeave={() => props.setHoveredItem("")}
                  onPointerDown={(event) => {
                    props.setHoveredItem(item.id)
                    props.onStartMove(event, item)
                  }}
                >
                  {props.showCanvasMarkers || isLinked ? (
                    <span className="canvas-item__marker">
                      {getImageMarkerCode(index)}
                    </span>
                  ) : null}
                  <div className="canvas-item__media">
                    <div className="canvas-item__placeholder">
                      <span className="canvas-item__placeholder-code">
                        {getImageMarkerCode(index)}
                      </span>
                    </div>
                    <img
                      alt={getImageAriaLabel(index)}
                      className="canvas-item__image"
                      crossOrigin="anonymous"
                      draggable={false}
                      src={item.src}
                      onError={(event) => {
                        event.currentTarget.style.display = "none"
                      }}
                      onLoad={(event) => {
                        event.currentTarget.style.display = "block"
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "canvas-item__outline",
                      (isSelected || isLinked) &&
                        "canvas-item__outline--visible"
                    )}
                  />
                </article>
              )
            })}
            {props.layout.items.map((item, index) => {
              const isSelected = props.selectedIdSet.has(item.id)
              const isLinked = props.hoverLinkItemId === item.id
              return (
                <div
                  key={`${item.id}-handles`}
                  className="canvas-item__handles"
                  style={{
                    left: item.x * props.viewportScale,
                    top: item.y * props.viewportScale,
                    width: item.width * props.viewportScale,
                    height: item.height * props.viewportScale,
                    zIndex: isSelected ? 1500 : isLinked ? 1100 : 1000,
                    ...getImageMarkerStyle(index),
                  }}
                >
                  <ResizeHandles
                    active={isSelected || isLinked}
                    labelPrefix={getImageAriaLabel(index)}
                    selected={isSelected}
                    onPointerDown={(event, edge) =>
                      props.onStartItemResize(event, item, edge)
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
