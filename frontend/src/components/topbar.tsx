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
    <header className="topbar">
      <SidebarTrigger />
      <h1 className="topbar-title flex-1">{title}</h1>
      <div className="flex items-center gap-1">
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
