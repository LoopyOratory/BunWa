import { useTheme } from "next-themes"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Sun, Moon, RefreshCw } from "lucide-react"

interface TopbarProps {
  title: string
  onRefresh?: () => void
}

export function Topbar({ title, onRefresh }: TopbarProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="flex h-12 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <h1 className="flex-1 font-heading text-sm font-medium">{title}</h1>
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Button variant="ghost" size="icon-sm" onClick={onRefresh}>
            <RefreshCw />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  )
}
