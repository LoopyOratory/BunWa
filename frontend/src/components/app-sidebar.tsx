import { useNavigate, useLocation } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar"
import {
  Home, MessageSquare, Eye, Server, LogOut, BookOpen,
  Sun, Moon, Plug, FileText, Activity, Send, Settings, MessageCircle, BarChart3, Bot, Users, TrendingUp,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const overviewItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/agent-analytics", label: "Agent analytics", icon: TrendingUp },
  { path: "/agents", label: "Agents", icon: Bot },
  { path: "/profiles", label: "User profiles", icon: Users },
]

const messagingItems = [
  { path: "/sessions", label: "Sessions", icon: MessageSquare },
  { path: "/chat", label: "Chat", icon: MessageCircle },
  { path: "/templates", label: "Templates", icon: FileText },
  { path: "/messages", label: "Message tester", icon: Send },
]

const operationsItems = [
  { path: "/logs", label: "Audit logs", icon: Activity },
  { path: "/infrastructure", label: "Infrastructure", icon: Settings },
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

type NavItem = {
  path: string
  label: string
  icon: React.ComponentType<any>
}

function NavGroup({
  label,
  items,
  currentPath,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  currentPath: string
  onNavigate: (path: string) => void
}) {
  const reduce = useReducedMotion()
  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
        {label}
      </SidebarGroupLabel>
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
                  className={cn(
                    "h-9 rounded-2xl px-3 text-sm text-sidebar-foreground/80 transition-[background-color,box-shadow,color] hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                    active && "bg-primary/12 text-primary-foreground shadow-[inset_0_0_0_1px_var(--primary)/22] dark:bg-primary/20",
                  )}
                >
                  {/* The fill physically slides between items as you navigate. */}
                  {active && (
                    <motion.span
                      aria-hidden
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-2xl bg-primary/10 ring-1 ring-primary/20"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
                    />
                  )}
                  <item.icon className="relative z-10" strokeWidth={active ? 2.1 : 1.75} />
                  <span className="relative z-10">{item.label}</span>
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
    <Sidebar variant="floating" collapsible="icon" className="p-2">
      <SidebarHeader className="border-b border-sidebar-border/60 px-4 py-3.5">
        <div className="sidebar-logo flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="BunWa"
            className="size-9 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-primary/20"
          />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-lg font-semibold leading-tight tracking-tight">
              Bun<span className="text-primary">Wa</span>
            </span>
            <span className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Operations console
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 py-2">
        <NavGroup label="Overview" items={overviewItems} currentPath={currentPath} onNavigate={navigate} />
        <NavGroup label="Messaging" items={messagingItems} currentPath={currentPath} onNavigate={navigate} />
        <NavGroup label="Operations" items={operationsItems} currentPath={currentPath} onNavigate={navigate} />
        <NavGroup label="Tools" items={secondaryItems} currentPath={currentPath} onNavigate={navigate} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(isDark ? "light" : "dark")}
              tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="h-9 rounded-2xl px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/70"
            >
              {isDark ? (
                <Sun key="sun" className="theme-icon" strokeWidth={1.75} />
              ) : (
                <Moon key="moon" className="theme-icon" strokeWidth={1.75} />
              )}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              tooltip="Sign out"
              className="h-9 rounded-2xl px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/70"
            >
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
