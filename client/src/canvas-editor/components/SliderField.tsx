import { useRef } from "react"

import { Slider } from "@/shared/ui/slider"

import type { EditorTransactionToken } from "../model/editor-document"
import type { ContinuousNumberEdit } from "./NumberField"

type SliderFieldProps = {
  label: string
  value: number
  valueLabel: string
  min: number
  max: number
  onChange?: (value: number) => void
  edit?: ContinuousNumberEdit
}

export function SliderField({
  label,
  value,
  valueLabel,
  min,
  max,
  onChange,
  edit,
}: SliderFieldProps) {
  const tokenRef = useRef<EditorTransactionToken | null>(null)

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        <output className="font-mono text-[10px] text-muted-foreground">
          {valueLabel}
        </output>
      </div>
      <Slider
        ariaLabel={label}
        max={max}
        min={min}
        value={value}
        onChange={(nextValue) => {
          const token = tokenRef.current
          if (edit && token !== null) edit.preview(token, nextValue)
          else onChange?.(nextValue)
        }}
        onInteractionEnd={(disposition) => {
          const token = tokenRef.current
          tokenRef.current = null
          if (edit && token !== null) edit.finish(token, disposition)
        }}
        onInteractionStart={() => {
          if (edit) tokenRef.current = edit.begin()
        }}
      />
    </div>
  )
}
