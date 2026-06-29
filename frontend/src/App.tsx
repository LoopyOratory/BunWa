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
import { ApiKeysPage } from "./pages/api-keys-page"
import { InfrastructurePage } from "./pages/infrastructure-page"
import { QueuePage } from "./pages/queue-page"
import { PageLayout } from "@/components/page-layout"
import { Toaster } from "@/components/ui/sonner"
import { ErrorBoundary } from "./components/ErrorBoundary"

function GlobalBackground() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" style={{
      background: `
        radial-gradient(ellipse at 20% 0%, oklch(0.841 0.238 128.85 / 0.04) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 100%, oklch(0.841 0.238 128.85 / 0.03) 0%, transparent 50%)
      `,
    }} />
  )
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="relative overflow-hidden">
        <GlobalBackground />
        <div className="relative z-10 flex flex-col h-full animate-fade-in">{children}</div>
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
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/infrastructure" element={<InfrastructurePage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/events" element={<EventMonitorPage />} />
        <Route path="/docs" element={
          <PageLayout title="API Documentation" description="Scalar API reference for BunWa">
            <iframe src="/api-docs/" className="w-full min-h-[calc(100vh-14rem)] rounded-xl border" title="API Docs" />
          </PageLayout>
        } />
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
