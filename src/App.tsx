import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui/Spinner'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Weight } from './pages/Weight'
import { Training } from './pages/TrainingHub'
import { Sleep } from './pages/Sleep'
import { Nutrition } from './pages/Nutrition'
import { Supplements } from './pages/Supplements'
import { Calendar } from './pages/Calendar'
import { Settings } from './pages/Settings'
import { CoachDashboard } from './pages/coach/CoachDashboard'
import { ClientDetail } from './pages/coach/ClientDetail'
import { Rezepte } from './pages/Rezepte'
import { Legal } from './pages/Legal'
import { More } from './pages/More'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function CoachRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (profile?.role !== 'coach') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { profile, loading } = useAuth()

  // Meldet der Startanimation (index.html), dass die App bereit ist
  useEffect(() => {
    if (loading) return
    ;(window as unknown as { __hlxReady?: boolean }).__hlxReady = true
    window.dispatchEvent(new Event('app-ready'))
  }, [loading])

  return (
    <Routes>
      {/* Public — no auth required */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/legal" element={<Legal />} />

      {/* Protected - Client & Coach */}
      <Route path="/dashboard" element={<ProtectedRoute>
        {profile?.role === 'coach' ? <Navigate to="/coach" replace /> : <Dashboard />}
      </ProtectedRoute>} />
      <Route path="/weight" element={<ProtectedRoute><Weight /></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      {/* Vorlagen und Übungspool sind Reiter im Training; alte Links bleiben gültig */}
      <Route path="/training/vorlagen" element={<Navigate to="/training?tab=vorlagen" replace />} />
      <Route path="/uebungen" element={<Navigate to="/training?tab=uebungen" replace />} />
      <Route path="/sleep" element={<ProtectedRoute><Sleep /></ProtectedRoute>} />
      <Route path="/nutrition" element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
      <Route path="/rezepte" element={<ProtectedRoute><Rezepte /></ProtectedRoute>} />
      <Route path="/supplements" element={<ProtectedRoute><Supplements /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/more" element={<ProtectedRoute><More /></ProtectedRoute>} />

      {/* Coach Only */}
      <Route path="/coach" element={<ProtectedRoute><CoachRoute><CoachDashboard /></CoachRoute></ProtectedRoute>} />
      <Route path="/coach/client/:clientId" element={<ProtectedRoute><CoachRoute><ClientDetail /></CoachRoute></ProtectedRoute>} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
