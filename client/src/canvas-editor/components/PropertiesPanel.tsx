import { Button } from "@/shared/ui/button"
import { Toggle } from "@/shared/ui/toggle"

import {
  ASPECT_RATIO_PRESETS,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
} from "../model/constants"
import { getImageAriaLabel } from "../model/markers"
import type { AspectRatioPreset, CanvasItem, CanvasSize } from "../model/types"
import { NumberField, type ContinuousNumberEdit } from "./NumberField"
import { PanelHeader } from "./PanelHeader"
import { SliderField } from "./SliderField"

import "./PropertiesPanel.css"

type PropertiesPanelProps = {
  canvas: CanvasSize
  zoom: number
  canvasMaxSide: number
  activeRatio: string
  showCanvasMarkers: boolean
  selectedIds: string[]
  selectedItem?: CanvasItem
  selectedIndex: number
  canvasDimensionEdit: (field: "width" | "height") => ContinuousNumberEdit
  canvasScaleEdit: ContinuousNumberEdit
  selectedItemEdit: (
    field: "x" | "y" | "width" | "height"
  ) => ContinuousNumberEdit
  onZoomChange: (value: number) => void
  onAspectRatio: (preset: AspectRatioPreset) => void
  onRestoreOriginal: () => void
  onMarkersChange: (value: boolean) => void
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  return (
    <aside className="properties-panel glass-sidebar corner-brackets">
      <section className="properties-panel__section">
        <PanelHeader title="canvas" meta="Ctrl drag keeps images" />
        <div className="properties-panel__content">
          <div className="properties-panel__fields">
            <NumberField
              edit={props.canvasDimensionEdit("width")}
              label="Width"
              value={props.canvas.width}
            />
            <NumberField
              edit={props.canvasDimensionEdit("height")}
              label="Height"
              value={props.canvas.height}
            />
          </div>
          <div className="properties-panel__slider-group">
            <SliderField
              label="View zoom"
              max={140}
              min={18}
              value={props.zoom}
              valueLabel={`${props.zoom}%`}
              onChange={props.onZoomChange}
            />
            <SliderField
              label="Canvas scale"
              max={MAX_CANVAS_SIZE}
              min={MIN_CANVAS_SIZE}
              value={props.canvasMaxSide}
              valueLabel={`${props.canvasMaxSide}px`}
              edit={props.canvasScaleEdit}
            />
          </div>
          <div className="properties-panel__ratio">
            <p className="properties-panel__label">aspect ratio</p>
            <div className="properties-panel__ratio-grid">
              <Button
                className="properties-panel__ratio-button"
                size="sm"
                variant={
                  props.activeRatio === "original" ? "default" : "outline"
                }
                onClick={props.onRestoreOriginal}
              >
                original
              </Button>
              {ASPECT_RATIO_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  className="properties-panel__ratio-button properties-panel__ratio-button--mono"
                  size="sm"
                  variant={
                    props.activeRatio === preset.label ? "default" : "outline"
                  }
                  onClick={() => props.onAspectRatio(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="properties-panel__marker-setting">
            <span className="properties-panel__marker-label">
              canvas markers
            </span>
            <Toggle
              aria-label="toggle canvas markers"
              className="properties-panel__marker-toggle"
              pressed={props.showCanvasMarkers}
              size="sm"
              variant="outline"
              onPressedChange={props.onMarkersChange}
            >
              {props.showCanvasMarkers ? "On" : "Off"}
            </Toggle>
          </div>
        </div>
      </section>
      <section className="properties-panel__section">
        <PanelHeader
          title="selection"
          meta={
            props.selectedIds.length > 1
              ? `${props.selectedIds.length} selected`
              : props.selectedIndex >= 0
                ? getImageAriaLabel(props.selectedIndex)
                : "none"
          }
        />
        {props.selectedItem ? (
          <div className="properties-panel__selection-content">
            <div className="properties-panel__fields">
              <NumberField
                edit={props.selectedItemEdit("x")}
                label="X"
                value={props.selectedItem.x}
              />
              <NumberField
                edit={props.selectedItemEdit("y")}
                label="Y"
                value={props.selectedItem.y}
              />
              <NumberField
                edit={props.selectedItemEdit("width")}
                label="Width"
                value={props.selectedItem.width}
              />
              <NumberField
                edit={props.selectedItemEdit("height")}
                label="Height"
                value={props.selectedItem.height}
              />
            </div>
          </div>
        ) : (
          <p className="properties-panel__empty">
            no image selected. click on an image to edit its properties.
          </p>
        )}
      </section>
      <Shortcuts />
    </aside>
  )
}

function Shortcuts() {
  return (
    <section className="shortcuts">
      <h2 className="shortcuts__title">shortcuts</h2>
      <div className="shortcuts__list">
        <p className="shortcuts__item">
          <span>Move selected</span>
          <kbd className="shortcuts__key">Arrows</kbd>
        </p>
        <p className="shortcuts__item">
          <span>move faster</span>
          <kbd className="shortcuts__key">Shift + Arrows</kbd>
        </p>
        <p className="shortcuts__item">
          <span>add to selection</span>
          <kbd className="shortcuts__key">Shift Click</kbd>
        </p>
        <p className="shortcuts__item">
          <span>keep ratio on resize</span>
          <kbd className="shortcuts__key">Shift Drag</kbd>
        </p>
        <p className="shortcuts__item">
          <span>resize canvas only</span>
          <kbd className="shortcuts__key">Ctrl Drag</kbd>
        </p>
      </div>
    </section>
  )
}
