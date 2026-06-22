import { useState } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "./components/app-sidebar"
import { ThemeProvider, useTheme } from "./components/theme-provider"
import { AuthProvider, useAuth } from "./lib/auth"
import { DashboardPage } from "./pages/dashboard-page"
import { WorkersPage } from "./pages/workers-page"
import { SessionsPage } from "./pages/sessions-page"
import { EventMonitorPage } from "./pages/event-monitor-page"
import { ChatPage } from "./pages/chat-page"
import { LoginPage } from "./pages/login-page"
import { AppsPage } from "./pages/apps-page"
import { Toaster } from "@/components/ui/sonner"

function GlobalBackground() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  return (
    <div className="absolute inset-0 z-0 pointer-events-none" style={isDark ? {
      backgroundImage: `
        repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 40px),
        repeating-linear-gradient(45deg, rgba(0,255,128,0.09) 0, rgba(0,255,128,0.09) 1px, transparent 1px, transparent 20px),
        repeating-linear-gradient(-45deg, rgba(255,0,128,0.10) 0, rgba(255,0,128,0.10) 1px, transparent 1px, transparent 30px),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 80px),
        radial-gradient(circle at 60% 40%, rgba(0,255,128,0.05) 0, transparent 60%)
      `,
      backgroundSize: "80px 80px, 40px 40px, 60px 60px, 80px 80px, 100% 100%",
      backgroundPosition: "0 0, 0 0, 0 0, 40px 40px, center",
    } : {
      backgroundImage: `
        linear-gradient(to right, rgba(209,213,219,0.5) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(209,213,219,0.5) 1px, transparent 1px),
        radial-gradient(circle 500px at 20% 80%, rgba(16,185,129,0.12), transparent),
        radial-gradient(circle 500px at 80% 20%, rgba(5,150,105,0.12), transparent)
      `,
      backgroundSize: "48px 48px, 48px 48px, 100% 100%, 100% 100%",
    }} />
  )
}

function AppContent() {
  const { isAuthenticated } = useAuth()
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [chatSessionName, setChatSessionName] = useState<string | null>(null)

  const handleNavigate = (page: string, options?: { sessionName?: string }) => {
    if (options?.sessionName) {
      setChatSessionName(options.sessionName)
    }
    setCurrentPage(page)
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar currentPage={currentPage} onNavigate={handleNavigate} />
        <SidebarInset className="relative overflow-hidden">
          <GlobalBackground />
          <div className="relative z-10 flex flex-col h-full">
            {currentPage === "dashboard" && <DashboardPage onNavigate={handleNavigate} />}
            {currentPage === "apps" && <AppsPage />}
            {currentPage === "workers" && <WorkersPage />}
            {currentPage === "sessions" && <SessionsPage onNavigate={handleNavigate} />}
            {currentPage === "chat" && <ChatPage initialSession={chatSessionName} />}
            {currentPage === "event-monitor" && <EventMonitorPage />}
          </div>
        </SidebarInset>
        <Toaster richColors closeButton />
      </SidebarProvider>
    </TooltipProvider>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
