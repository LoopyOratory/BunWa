import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "./components/app-sidebar"
import { ThemeProvider } from "./components/theme-provider"
import { AuthProvider, useAuth } from "./lib/auth"
import { DashboardPage } from "./pages/dashboard-page"
import { WorkersPage } from "./pages/workers-page"
import { SessionsPage } from "./pages/sessions-page"
import { EventMonitorPage } from "./pages/event-monitor-page"
import { ChatPage } from "./pages/chat-page"
import { LoginPage } from "./pages/login-page"
import { AppsPage } from "./pages/apps-page"
import { TemplatesPage } from "./pages/templates-page"
import { LogsPage } from "./pages/logs-page"
import { MessageTesterPage } from "./pages/message-tester-page"
import { InfrastructurePage } from "./pages/infrastructure-page"
import { QueuePage } from "./pages/queue-page"
import { DocsPage } from "./pages/docs-page"
import { Toaster } from "@/components/ui/sonner"
import { ErrorBoundary } from "./components/ErrorBoundary"

function GlobalBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--primary) 5%, transparent) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 50%)
        `,
      }}
    />
  )
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="relative overflow-hidden">
        <GlobalBackground />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Routes><Route path="*" element={<LoginPage />} /></Routes>
  }

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id/chat" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/messages" element={<MessageTesterPage />} />
        <Route path="/messages/:chatId" element={<MessageTesterPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/infrastructure" element={<InfrastructurePage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/events" element={<EventMonitorPage />} />
        {/* Written guide first; the raw Scalar reference stays one click away. */}
        <Route path="/docs" element={<DocsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster richColors closeButton />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
