import { Skeleton } from "@/shared/ui/skeleton"

export function ProfileLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading profile"
      className="jigsaw-room jigsaw-room--profile"
      role="status"
    >
      <section className="jigsaw-room__profile-shell corner-brackets">
        <div className="jigsaw-room__profile-hero">
          <div className="jigsaw-room__profile-hero-info">
            <Skeleton className="h-3 w-28" />
            <div className="jigsaw-room__profile-headline">
              <Skeleton className="jigsaw-room__profile-avatar" />
              <Skeleton className="h-16 w-80 max-w-[60vw]" />
            </div>
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="jigsaw-room__profile-scoreboard">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
        <section className="jigsaw-room__history-panel">
          <div className="jigsaw-room__history-heading">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="jigsaw-room__profile-loading-cards">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-36 w-full" />
            ))}
          </div>
        </section>
      </section>
      <span className="sr-only">Loading player profile</span>
    </main>
  )
}
