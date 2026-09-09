import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Login from '../components/Login'
import SuperAdminDashboard from '../components/SuperAdminDashboard'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { user, booting } = useAuth()

  if (booting) {
    return (
      <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', fontFamily: 'DM Sans, sans-serif' }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function AppRoutes() {
  const { login, logout, user } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Login
                onLogin={(userData) => {
                  const token = localStorage.getItem('mb_token')
                  if (token) login(token, userData)
                }}
              />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <SuperAdminDashboard user={user} onLogout={logout} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
