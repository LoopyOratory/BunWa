import { useNavigate, useLocation } from "react-router-dom"
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Home, MessageSquare, Eye, Server, LogOut, BookOpen,
  Sun, Moon, Plug, FileText, Activity, Send, Settings, ListOrdered, MessageCircle,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/components/theme-provider"

const menuItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/sessions", label: "Sessions", icon: MessageSquare },
  { path: "/chat", label: "Chat", icon: MessageCircle },
  { path: "/templates", label: "Templates", icon: FileText },
  { path: "/messages", label: "Message tester", icon: Send },
  { path: "/logs", label: "Audit logs", icon: Activity },
  { path: "/infrastructure", label: "Infrastructure", icon: Settings },
  { path: "/queue", label: "Queue", icon: ListOrdered },
]

const secondaryItems = [
  { path: "/workers", label: "Workers", icon: Server },
  { path: "/apps", label: "Apps", icon: Plug },
  { path: "/events", label: "Event monitor", icon: Eye },
  { path: "/docs", label: "API docs", icon: BookOpen },
]

/** Prefix match, so /sessions/:id/chat keeps Sessions highlighted. */
function isActivePath(currentPath: string, path: string) {
  if (path === "/") return currentPath === "/"
  return currentPath === path || currentPath.startsWith(`${path}/`)
}

function NavGroup({
  label,
  items,
  currentPath,
  onNavigate,
}: {
  label: string
  items: typeof menuItems
  currentPath: string
  onNavigate: (path: string) => void
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActivePath(currentPath, item.path)
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={active}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.path)}
                  tooltip={item.label}
                >
                  <item.icon strokeWidth={1.75} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, username } = useAuth()
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const currentPath = location.pathname

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3.5">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="BunWa"
            className="size-9 shrink-0 rounded-lg object-cover"
          />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-base font-semibold leading-tight tracking-tight">BunWa</span>
            <span className="truncate text-xs text-muted-foreground">WhatsApp HTTP API</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <NavGroup label="Operate" items={menuItems} currentPath={currentPath} onNavigate={navigate} />
        <SidebarSeparator className="mx-2 my-1" />
        <NavGroup label="Tools" items={secondaryItems} currentPath={currentPath} onNavigate={navigate} />
      </SidebarContent>

      <SidebarFooter className="border-t px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(isDark ? "light" : "dark")}
              tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun strokeWidth={1.75} /> : <Moon strokeWidth={1.75} />}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Sign out">
              <LogOut strokeWidth={1.75} />
              <div className="flex min-w-0 flex-col text-left group-data-[collapsible=icon]:hidden">
                <span className="truncate">{username}</span>
                <span className="text-xs text-muted-foreground">Sign out</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
