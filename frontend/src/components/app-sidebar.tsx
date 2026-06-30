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
  { path: "/messages", label: "Message Tester", icon: Send },
  { path: "/logs", label: "Audit Logs", icon: Activity },
  { path: "/infrastructure", label: "Infrastructure", icon: Settings },
  { path: "/queue", label: "Queue", icon: ListOrdered },
]

const secondaryItems = [
  { path: "/workers", label: "Workers", icon: Server },
  { path: "/apps", label: "Apps", icon: Plug },
  { path: "/events", label: "Event Monitor", icon: Eye },
  { path: "/docs", label: "API Docs", icon: BookOpen },
]

export function AppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, username } = useAuth()
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const currentPath = location.pathname

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="BunWa" className="size-10 shrink-0 rounded-xl object-cover shadow-md" />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-lg font-bold text-foreground tracking-tight">BunWa</span>
            <span className="text-xs text-muted-foreground font-medium -mt-0.5">WhatsApp API</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={currentPath === item.path}
                    onClick={() => navigate(item.path)}
                    tooltip={item.label}
                    className="text-base py-3 group-data-[collapsible=icon]:py-2.5"
                  >
                    <item.icon className="size-6 shrink-0" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 mx-3" />

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={currentPath === item.path}
                    onClick={() => navigate(item.path)}
                    tooltip={item.label}
                    className="text-base py-3 group-data-[collapsible=icon]:py-2.5"
                  >
                    <item.icon className="size-6 shrink-0" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-4 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(isDark ? "light" : "dark")}
              tooltip={isDark ? "Light Mode" : "Dark Mode"}
              className="text-base py-3"
            >
              {isDark ? <Sun className="size-6" /> : <Moon className="size-6" />}
              <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Logout" className="text-base py-3">
              <LogOut className="size-6" />
              <div className="flex flex-col group-data-[collapsible=icon]:hidden text-left">
                <span>{username}</span>
                <span className="text-xs text-muted-foreground">Sign out</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
