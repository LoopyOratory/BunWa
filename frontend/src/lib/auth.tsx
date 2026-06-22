import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"

interface AuthState {
  isAuthenticated: boolean
  username: string
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  username: "",
  login: async () => false,
  logout: () => {},
})

const STORAGE_KEY = "waha_dashboard_auth"
const USERNAME_KEY = "waha_dashboard_user"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Restore auth state from localStorage on mount
    return !!localStorage.getItem(STORAGE_KEY)
  })
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(USERNAME_KEY) || ""
  })

  // Verify stored credentials are still valid on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && !isAuthenticated) {
      // Try to validate by hitting the sessions endpoint
      fetch(`${window.location.origin}/api/sessions`, {
        headers: { Authorization: `Basic ${stored}` },
      }).then((res) => {
        if (res.ok) {
          setIsAuthenticated(true)
        } else {
          // Credentials expired or invalid — clear
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(USERNAME_KEY)
          setIsAuthenticated(false)
          setUsername("")
        }
      }).catch(() => {
        // Network error — keep trying with stored credentials
      })
    }
  }, [])

  const login = useCallback(async (user: string, password: string) => {
    try {
      const encoded = btoa(`${user}:${password}`)
      const res = await fetch(`${window.location.origin}/api/dashboard/login`, {
        headers: {
          Authorization: `Basic ${encoded}`,
        },
      })
      if (res.ok) {
        setIsAuthenticated(true)
        setUsername(user)
        localStorage.setItem(STORAGE_KEY, encoded)
        localStorage.setItem(USERNAME_KEY, user)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  const logout = useCallback(() => {
    setIsAuthenticated(false)
    setUsername("")
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(USERNAME_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function getDashboardAuthHeader(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}
