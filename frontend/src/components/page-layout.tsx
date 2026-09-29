import { useEffect, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface PageLayoutProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

/**
 * Console page shell: a frosted topbar plus one scrolling content area.
 * The view enters with a soft spring so navigation feels alive; the tab
 * title stays in step with the view (operators keep several tabs open).
 *
 * The theme control lives in the sidebar footer only. It used to be duplicated
 * here, which meant two controls for one setting.
 */
export function PageLayout({ title, description, actions, children }: PageLayoutProps) {
  useEffect(() => {
    document.title = `${title} · BunWa`
  }, [title])

  const reduce = useReducedMotion()

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <motion.header
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="page-header z-20 flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
      >
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">{actions}</div>
        )}
      </motion.header>

      {/* SidebarInset already renders the shell's <main> landmark. */}
      <section id="main-content" className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 28, delay: 0.05 }}
          className="mx-auto w-full max-w-screen-2xl"
        >
          {children}
        </motion.div>
      </section>
    </div>
  )
}
