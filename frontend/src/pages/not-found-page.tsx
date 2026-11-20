import { Link, useLocation } from "react-router-dom"
import { BarChart3, BookOpen, Compass, Home } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { EmptyState } from "@/components/primitives"
import { Button } from "@/components/ui/button"

/**
 * Explicit not-found landing: a typo'd or stale link explains itself and
 * offers the three most useful destinations, instead of silently landing
 * on the dashboard where the URL no longer matches the page.
 */
export function NotFoundPage() {
  const location = useLocation()

  return (
    <PageLayout
      title="Page not found"
      description="The link may be out of date, or the address has a typo."
    >
      <EmptyState
        icon={<Compass className="size-6" strokeWidth={1.75} />}
        title={`No page at ${location.pathname}`}
        description="Check the address, or continue from one of these:"
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/">
                <Home className="size-4" strokeWidth={1.75} />
                Dashboard
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/agent-analytics">
                <BarChart3 className="size-4" strokeWidth={1.75} />
                Agent analytics
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/docs">
                <BookOpen className="size-4" strokeWidth={1.75} />
                API docs
              </Link>
            </Button>
          </div>
        }
      />
    </PageLayout>
  )
}
