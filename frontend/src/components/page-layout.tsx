import { useEffect, type ReactNode } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface PageLayoutProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

/**
 * Console page shell: a fixed topbar plus one scrolling content area.
 *
 * The theme control lives in the sidebar footer only. It used to be duplicated
 * here, which meant two controls for one setting.
 */
export function PageLayout({ title, description, actions, children }: PageLayoutProps) {
  // Keep the tab title in step with the view; operators keep several tabs open.
  useEffect(() => {
    document.title = `${title} · BunWa`
  }, [title])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur-sm sm:px-6">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">{actions}</div>
        )}
      </header>

      {/* SidebarInset already renders the shell's <main> landmark. */}
      <section id="main-content" className="page-enter flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
      </section>
    </div>
  )
}
