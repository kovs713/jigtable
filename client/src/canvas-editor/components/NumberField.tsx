import { useRef } from "react"

import { Input } from "@/shared/ui/input"
import type { EditorTransactionToken } from "../model/editor-document"

export type ContinuousNumberEdit = {
  begin: () => EditorTransactionToken | null
  preview: (token: EditorTransactionToken, value: number) => void
  finish: (
    token: EditorTransactionToken,
    disposition: "commit" | "rollback"
  ) => void
}

type NumberFieldProps = {
  label: string
  value: number
  edit: ContinuousNumberEdit
}

export function NumberField({ label, value, edit }: NumberFieldProps) {
  const tokenRef = useRef<EditorTransactionToken | null>(null)

  function begin() {
    if (tokenRef.current === null) tokenRef.current = edit.begin()
  }

  function finish(disposition: "commit" | "rollback") {
    const token = tokenRef.current
    if (token === null) return
    tokenRef.current = null
    edit.finish(token, disposition)
  }

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
          onBlur={() => finish("commit")}
          onChange={(event) => {
            begin()
            const token = tokenRef.current
            if (token !== null) edit.preview(token, Number(event.target.value))
          }}
          onFocus={begin}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              finish("rollback")
              event.currentTarget.blur()
            } else if (event.key === "Enter") {
              event.currentTarget.blur()
            }
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
          px
        </span>
      </div>
    </label>
  )
}
