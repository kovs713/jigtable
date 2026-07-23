import { Input } from "@/shared/ui/input"

type NumberFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
}

export function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="relative">
        <Input
          className="h-9 w-full pr-8 font-mono text-sm"
          inputMode="numeric"
          min={0}
          type="number"
          value={Math.round(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
          px
        </span>
      </div>
    </label>
  )
}
