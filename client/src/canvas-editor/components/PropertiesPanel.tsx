import { Button } from "@/shared/ui/button"
import { Toggle } from "@/shared/ui/toggle"

import {
  ASPECT_RATIO_PRESETS,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
} from "../model/constants"
import { getImageAriaLabel } from "../model/markers"
import type { AspectRatioPreset, CanvasItem, CanvasSize } from "../model/types"
import { NumberField } from "./NumberField"
import { PanelHeader } from "./PanelHeader"
import { SliderField } from "./SliderField"

type PropertiesPanelProps = {
  canvas: CanvasSize
  zoom: number
  canvasMaxSide: number
  activeRatio: string
  showCanvasMarkers: boolean
  selectedIds: string[]
  selectedItem?: CanvasItem
  selectedIndex: number
  onCanvasSizeChange: (field: "width" | "height", value: number) => void
  onZoomChange: (value: number) => void
  onCanvasScaleChange: (value: number) => void
  onAspectRatio: (preset: AspectRatioPreset) => void
  onRestoreOriginal: () => void
  onMarkersChange: (value: boolean) => void
  onSelectedItemChange: (patch: Partial<CanvasItem>) => void
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  return (
    <aside className="properties-panel glass-sidebar corner-brackets">
      <section className="properties-panel__section">
        <PanelHeader title="canvas" meta="Ctrl drag keeps images" />
        <div className="properties-panel__content">
          <div className="properties-panel__fields">
            <NumberField
              label="Width"
              value={props.canvas.width}
              onChange={(value) => props.onCanvasSizeChange("width", value)}
            />
            <NumberField
              label="Height"
              value={props.canvas.height}
              onChange={(value) => props.onCanvasSizeChange("height", value)}
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
              onChange={props.onCanvasScaleChange}
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
                label="X"
                value={props.selectedItem.x}
                onChange={(value) => props.onSelectedItemChange({ x: value })}
              />
              <NumberField
                label="Y"
                value={props.selectedItem.y}
                onChange={(value) => props.onSelectedItemChange({ y: value })}
              />
              <NumberField
                label="Width"
                value={props.selectedItem.width}
                onChange={(value) =>
                  props.onSelectedItemChange({ width: value })
                }
              />
              <NumberField
                label="Height"
                value={props.selectedItem.height}
                onChange={(value) =>
                  props.onSelectedItemChange({ height: value })
                }
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
