import { Slider } from "@/shared/ui/slider"

type SliderFieldProps = {
  label: string
  value: number
  valueLabel: string
  min: number
  max: number
  onChange: (value: number) => void
}

export function SliderField({
  label,
  value,
  valueLabel,
  min,
  max,
  onChange,
}: SliderFieldProps) {
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
        onChange={onChange}
      />
    </div>
  )
}
