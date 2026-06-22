import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Home, MessageSquare, Eye, Server, LogOut, MessageCircle, BookOpen, Sun, Moon, Plug } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/components/theme-provider"

const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "apps", label: "Apps", icon: Plug },
  { id: "workers", label: "Workers", icon: Server },
  { id: "sessions", label: "Sessions", icon: MessageSquare },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "event-monitor", label: "Event Monitor", icon: Eye },
  { id: "docs", label: "API Docs", icon: BookOpen, href: "/api-docs/" },
]

interface AppSidebarProps {
  currentPage: string
  onNavigate: (page: string, options?: { sessionName?: string }) => void
}

export function AppSidebar({ currentPage, onNavigate }: AppSidebarProps) {
  const { logout, username } = useAuth()
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            W
          </div>
          <span className="font-heading text-sm font-semibold group-data-[collapsible=icon]:hidden">
            WAHA
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Home</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={currentPage === item.id}
                    onClick={() => item.href ? window.open(item.href, "_blank") : onNavigate(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  tooltip={isDark ? "Light Mode" : "Dark Mode"}
                >
                  {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
                </SidebarMenuButton>
              </TooltipTrigger>
              <TooltipContent side="right">{isDark ? "Light Mode" : "Dark Mode"}</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Logout">
              <LogOut className="size-4" />
              <span className="group-data-[collapsible=icon]:hidden">{username}</span>
              <span className="ml-auto group-data-[collapsible=icon]:hidden">Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
