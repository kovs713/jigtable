import { SpeedInsights } from "@vercel/speed-insights/react"
import { StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app/App"
import { ThemeProvider } from "@/app/providers/ThemeProvider"
import { ErrorBoundary } from "./error-boundary"

import "./index.css"

const routeLoading = (
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <Suspense fallback={routeLoading}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </ThemeProvider>
    <SpeedInsights />
  </StrictMode>
)
