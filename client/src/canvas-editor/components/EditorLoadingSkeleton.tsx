import { Skeleton } from "@/shared/ui/skeleton"

export function EditorLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading editor"
      className="jigsaw-editor"
      role="status"
    >
      <header className="editor-loading__header glass corner-brackets">
        <div className="editor-loading__brand">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-56 max-w-full" />
        </div>
        <div className="editor-loading__controls">
          <Skeleton className="h-9 min-w-48 flex-1" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </header>
      <div className="editor-loading__workspace">
        <aside className="editor-loading__panel">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </aside>
        <section className="editor-loading__canvas">
          <Skeleton className="h-[72%] w-[76%] max-w-4xl" />
        </section>
        <aside className="editor-loading__panel editor-loading__properties">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </aside>
      </div>
      <div className="editor-loading__status">
        <Skeleton className="h-3 w-40" />
      </div>
      <span className="sr-only">Loading composition editor</span>
    </main>
  )
}
