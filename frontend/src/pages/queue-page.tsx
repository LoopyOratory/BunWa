import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ListOrdered } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { EmptyState } from "@/components/primitives"

export function QueuePage() {
  return (
    <PageLayout
      title="Queue monitor"
      description="Background jobs for bulk sends and webhook delivery"
    >
      <EmptyState
        icon={<ListOrdered strokeWidth={1.75} />}
        title="Queue monitoring is not wired yet"
        description="This build has no job queue endpoint, so there are no jobs to show. Bulk sends run in-process and the batch API plus the sessions view are the current way to track them."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/sessions">View sessions</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/messages">Open message tester</Link>
            </Button>
          </div>
        }
      />
    </PageLayout>
  )
}
