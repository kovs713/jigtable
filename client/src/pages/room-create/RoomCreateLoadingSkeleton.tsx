import { Skeleton } from "@/shared/ui/skeleton"

export function RoomCreateLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading room creation"
      className="jigsaw-room jigsaw-room--create"
      role="status"
    >
      <section className="jigsaw-room__create-panel corner-brackets">
        <div className="jigsaw-room__create-copy">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-64 max-w-full" />
          <Skeleton className="h-12 w-full max-w-72" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="jigsaw-room__create-form">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-[150px] w-full" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
      <span className="sr-only">Loading saved builds</span>
    </main>
  )
}
