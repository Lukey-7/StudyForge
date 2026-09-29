import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './hooks/useAuth'
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
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

// Shows the login page until there is a session (always "logged in" in demo mode).
function AuthGate() {
  const { session, loading, signOut } = useAuth()

  if (loading) return <div className="center-screen muted">Loading…</div>
  if (!session) return <LoginPage />

  const onSignOut = async () => {
    await signOut()
    queryClient.clear() // don't leak one user's cached data to the next
  }

  return (
    <Routes>
      <Route element={<Layout email={session.user?.email} onSignOut={onSignOut} />}>
        <Route path="/" element={<NotebooksPage />} />
        <Route path="/notebooks/:notebookId" element={<NotebookPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
