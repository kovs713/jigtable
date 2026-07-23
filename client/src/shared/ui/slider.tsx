import * as React from "react"

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  ariaLabel: string
  onChange: (value: number) => void
  onInteractionStart?: () => void
  onInteractionEnd?: (disposition: "commit" | "rollback") => void
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
  ariaLabel,
  onChange,
  onInteractionStart,
  onInteractionEnd,
}: SliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)
  const rectRef = React.useRef<DOMRect | null>(null)

  const range = max - min || 1
  const percent = ((value - min) / range) * 100

  const clamp = React.useCallback(
    (nextValue: number) => {
      const stepped = Math.round((nextValue - min) / step) * step + min
      return Math.min(max, Math.max(min, stepped))
    },
    [min, max, step]
  )

  const commit = React.useCallback(
    (nextValue: number) => {
      onChange(clamp(nextValue))
    },
    [clamp, onChange]
  )

  const valueFromClientX = React.useCallback(
    (clientX: number) => {
      const rect = rectRef.current

      if (!rect) {
        return value
      }

      const ratio = (clientX - rect.left) / rect.width
      return min + ratio * range
    },
    [value, min, range]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return

    const track = trackRef.current

    if (!track) {
      return
    }

    draggingRef.current = true
    rectRef.current = track.getBoundingClientRect()

    onInteractionStart?.()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()

    commit(valueFromClientX(event.clientX))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return

    commit(valueFromClientX(event.clientX))
  }

  const stopDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    disposition: "commit" | "rollback"
  ) => {
    if (!draggingRef.current) return

    draggingRef.current = false
    rectRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onInteractionEnd?.(disposition)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault()
      onInteractionStart?.()
      commit(value - step)
      onInteractionEnd?.("commit")
      return
    }

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault()
      onInteractionStart?.()
      commit(value + step)
      onInteractionEnd?.("commit")
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      onInteractionStart?.()
      commit(min)
      onInteractionEnd?.("commit")
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      onInteractionStart?.()
      commit(max)
      onInteractionEnd?.("commit")
    }
  }

  return (
    <div
      data-slot="slider"
      data-disabled={disabled ? "" : undefined}
      className={cx(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className
      )}
    >
      <div
        ref={trackRef}
        data-slot="slider-track"
        className="relative h-2 w-full grow overflow-hidden rounded-none bg-input/90"
      >
        <div
          data-slot="slider-range"
          className="absolute h-full bg-primary select-none"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div
        data-slot="slider-thumb"
        role="slider"
        tabIndex={disabled ? undefined : 0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        className="absolute block h-4 w-6 shrink-0 cursor-pointer touch-none rounded-none bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow,background-color] select-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        style={{
          left: `${percent}%`,
          transform: "translateX(-50%)",
          top: "50%",
          marginTop: "-0.5rem",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => stopDrag(event, "commit")}
        onPointerCancel={(event) => stopDrag(event, "rollback")}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
