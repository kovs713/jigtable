import { Component, type ErrorInfo, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("Client fatal error", error, errorInfo)
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
        <section className="max-w-md border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Reload the page. If it keeps failing, check client env and API
            availability.
          </p>
          <button
            type="button"
            className="mt-5 border border-border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </section>
      </main>
    )
  }
}
