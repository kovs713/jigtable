export function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <p className="text-sm font-medium">{title}</p>
      <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {meta}
      </p>
    </div>
  )
}
