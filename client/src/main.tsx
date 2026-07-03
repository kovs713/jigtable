import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

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

export function RootApp() {
  const { pathname } = window.location

  if (pathname === "/jigsaw/new") {
    return <JigsawRoomCreateApp />
  }

  if (pathname === "/profile" || pathname === "/jigsaw/profile") {
    return <JigsawProfileApp />
  }

  if (pathname.startsWith("/jigsaw/")) {
    const roomId = decodeURIComponent(pathname.slice("/jigsaw/".length))

    return <JigsawRoomApp roomId={roomId} />
  }

  if (pathname === "/jigsaw") {
    return <JigsawRoomCreateApp />
  }

  return <App />
}

function RouteLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
      Loading...
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
  </StrictMode>
)
