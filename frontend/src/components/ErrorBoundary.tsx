import React from "react"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/primitives"

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/** React 19 server errors carry a digest that also appears in server logs. */
function errorDigest(error: Error | null): string | undefined {
  return (error as (Error & { digest?: string }) | null)?.digest
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const digest = errorDigest(this.state.error)

      return (
        <div className="m-4">
          <ErrorState
            title="Something went wrong"
            description={
              <>
                <span>{this.state.error?.message || "An unexpected error occurred."}</span>
                {digest && (
                  <span className="metric mt-1 block font-mono text-xs text-muted-foreground">
                    Error ID: {digest}
                  </span>
                )}
              </>
            }
            action={
              <Button onClick={() => window.location.reload()}>
                <RotateCw className="size-4" strokeWidth={1.75} />
                Reload page
              </Button>
            }
          />
        </div>
      )
    }

    return this.props.children
  }
}
