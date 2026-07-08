import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { SpeedInsights } from "@vercel/speed-insights/react"

import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ErrorBoundary } from "./error-boundary"

import "./index.css"

const App = lazy(() => import("./App.tsx"))
const JigsawProfileApp = lazy(
  () => import("./jigsaw-room/JigsawProfileApp.tsx")
)
const JigsawRoomApp = lazy(() => import("./jigsaw-room/JigsawRoomApp.tsx"))
const JigsawRoomCreateApp = lazy(
  () => import("./jigsaw-room/JigsawRoomCreateApp.tsx")
)
const JigsawViewApp = lazy(() => import("./jigsaw-room/JigsawViewApp.tsx"))

export function RootApp() {
  const { pathname } = window.location

  if (pathname === "/create") {
    return <JigsawRoomCreateApp />
  }

  if (pathname === "/profile" || pathname === "/jigsaw/profile") {
    return <JigsawProfileApp />
  }

  if (pathname.startsWith("/profile/history")) {
    const roomId = decodeURIComponent(pathname.slice("/profile/history".length))

    return <JigsawViewApp roomId={roomId} />
  }

  if (pathname.startsWith("/rooms/")) {
    const roomId = decodeURIComponent(pathname.slice("/rooms/".length))

    return <JigsawRoomApp roomId={roomId} />
  }

  return <App />
}

function RouteLoading() {
  return (
    <main className="canvas-grid flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <section className="glass corner-brackets grid min-w-64 gap-3 border p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 animate-pulse bg-primary shadow-[0_0_18px_color-mix(in_oklch,var(--primary),transparent_45%)]"
          />
          <span className="text-sm font-semibold tracking-tight">Jigtable</span>
        </div>
        <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Loading workspace
        </p>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <Suspense fallback={<RouteLoading />}>
          <RootApp />
        </Suspense>
      </ErrorBoundary>
    </ThemeProvider>
    <SpeedInsights />
  </StrictMode>
)
