import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { useAuth } from './hooks/useAuth'
import LandingPage from './landing/LandingPage'
import LoginPage from './pages/LoginPage'
import NotebookPage from './pages/NotebookPage'
import NotebooksPage from './pages/NotebooksPage'

// One cache for all server data. retry: 1 because most failures here are real
// errors (404, 409, 503) that won't fix themselves by retrying 3 times.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// Routes:
//   /                 landing page when signed out, your notebooks when signed in
//   /welcome          landing page, always (the "Home" link; useful in demo mode where you're always signed in)
//   /login            sign in / create account (?mode=signup opens the second one)
//   /notebooks[/:id]  the app itself, only with a session
function AppRoutes() {
  const { session, loading, signOut } = useAuth()

  if (loading) return <div className="center-screen muted">Loading…</div>

  const onSignOut = async () => {
    await signOut()
    queryClient.clear() // don't leak one user's cached data to the next
  }
  // Wraps a page that needs a session: without one, go to the login screen.
  const requireSession = (page) => (session ? page : <Navigate to="/login" replace />)

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/notebooks" replace /> : <LandingPage signedIn={false} />} />
      <Route path="/welcome" element={<LandingPage signedIn={Boolean(session)} />} />
      <Route path="/login" element={session ? <Navigate to="/notebooks" replace /> : <LoginPage />} />
      <Route element={requireSession(<Layout email={session?.user?.email} onSignOut={onSignOut} />)}>
        <Route path="/notebooks" element={<NotebooksPage />} />
        <Route path="/notebooks/:notebookId" element={<NotebookPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
