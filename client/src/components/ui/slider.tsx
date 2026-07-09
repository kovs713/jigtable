import * as React from "react"

import { cn } from "@/lib/utils"

export interface SliderProps {
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  onValueChange?: (value: number[]) => void
}

function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
  onValueChange,
}: SliderProps) {
  const values = React.useMemo(
    () => value ?? defaultValue ?? [min],
    [value, defaultValue, min],
  )
  const trackRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)

  const clamp = React.useCallback(
    (n: number) => {
      const stepped = Math.round((n - min) / step) * step + min
      return Math.min(max, Math.max(min, stepped))
    },
    [min, max, step],
  )

  const setThumb = React.useCallback(
    (index: number, next: number) => {
      const nextValues = values.slice()
      nextValues[index] = clamp(next)
      onValueChange?.(nextValues)
    },
    [values, clamp, onValueChange],
  )

  const valueFromClientX = React.useCallback(
    (clientX: number, index: number) => {
      const el = trackRef.current
      if (!el) return values[index]
      const rect = el.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      return clamp(min + ratio * (max - min))
    },
    [values, clamp, min, max],
  )

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    if (disabled) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setThumb(index, valueFromClientX(e.clientX, index))
  }

  const handlePointerMove = (index: number) => (e: React.PointerEvent) => {
    if (!draggingRef.current || disabled) return
    setThumb(index, valueFromClientX(e.clientX, index))
  }

  const stopDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  return (
    <div
      data-slot="slider"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className,
      )}
    >
      <div
        ref={trackRef}
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-none bg-input/90 h-2 w-full"
      >
        <div
          data-slot="slider-range"
          className="absolute h-full bg-primary select-none"
          style={{
            width: `${(((values[0] ?? min) - min) / (max - min)) * 100}%`,
          }}
        />
      </div>
      {values.map((v, index) => (
        <div
          key={index}
          data-slot="slider-thumb"
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={v}
          aria-disabled={disabled || undefined}
          className="block h-4 w-6 shrink-0 cursor-pointer touch-none rounded-none bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow,background-color] select-none not-dark:bg-clip-padding hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          style={{
            position: "absolute",
            left: `${((v - min) / (max - min)) * 100}%`,
            transform: "translateX(-50%)",
            top: "50%",
            marginTop: "-0.5rem",
          }}
          onPointerDown={handlePointerDown(index)}
          onPointerMove={handlePointerMove(index)}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />
      ))}
    </div>
  )
}

export { Slider }
