import type { ReactNode } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useTheme } from "@/components/theme-provider"

interface PageLayoutProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, description, actions, children }: PageLayoutProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-4 border-b bg-background/80 backdrop-blur-sm">
        <SidebarTrigger className="md:hidden" />
        <div className="flex flex-col gap-0.5 flex-1">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="size-9"
            title={isDark ? "Light Mode" : "Dark Mode"}
          >
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-screen-2xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
