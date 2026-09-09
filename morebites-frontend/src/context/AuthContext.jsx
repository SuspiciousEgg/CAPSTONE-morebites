import { createContext, useContext, useEffect, useState } from 'react'
import { authApi, clearSession, getStoredUser, hasToken, setSession } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (hasToken() ? getStoredUser() : null))
  const [booting, setBooting] = useState(() => hasToken())

  useEffect(() => {
    function onLogout() {
      clearSession()
      setUser(null)
    }
    window.addEventListener('mb:logout', onLogout)
    return () => window.removeEventListener('mb:logout', onLogout)
  }, [])

  useEffect(() => {
    if (!hasToken()) {
      setBooting(false)
      return
    }
    authApi
      .me()
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        clearSession()
        setUser(null)
      })
      .finally(() => setBooting(false))
  }, [])

  const login = (token, userData) => {
    setSession(token, userData)
    setUser(userData)
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    clearSession()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
