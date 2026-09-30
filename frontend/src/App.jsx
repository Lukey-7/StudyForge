import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { useAuth } from './hooks/useAuth'
import LandingPage from './landing/LandingPage'
import LoginPage from './pages/LoginPage'
import NotebookPage from './pages/NotebookPage'
import HomePage from './pages/HomePage'
import NotebooksPage from './pages/NotebooksPage'
import AboutPage from './pages/public/AboutPage'
import ApiPage from './pages/public/ApiPage'
import FormatsPage from './pages/public/FormatsPage'
import HowItWorksPage from './pages/public/HowItWorksPage'
import NotFoundPage from './pages/public/NotFoundPage'
import PrivacyPage from './pages/public/PrivacyPage'

// One cache for all server data. retry: 1 because most failures here are real
// errors (404, 409, 503) that won't fix themselves by retrying 3 times.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

// Routes:
//   /                 landing page when signed out, your home when signed in
//   /home             the signed-in home: continue where you left off, recent work
//   /welcome          the public landing page, always (linked from Home as "See what StudyForge does")
//   /formats, /how-it-works, /about, /api, /privacy   public pages, with or without a session
//   /login            sign in / create account (?mode=signup opens the second one)
//   /notebooks[/:id]  the app itself, only with a session
//   anything else     a "no page here" page with links onward
function AppRoutes() {
  const { session, loading, signOut } = useAuth()

  if (loading) return <div className="center-screen muted">Loading…</div>

  const onSignOut = async () => {
    await signOut()
    queryClient.clear() // don't leak one user's cached data to the next
  }
  // Wraps a page that needs a session: without one, go to the login screen.
  const requireSession = (page) => (session ? page : <Navigate to="/login" replace />)
  const signedIn = Boolean(session)

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/home" replace /> : <LandingPage signedIn={false} />} />
      <Route path="/welcome" element={<LandingPage signedIn={signedIn} />} />
      <Route path="/formats" element={<FormatsPage signedIn={signedIn} />} />
      <Route path="/how-it-works" element={<HowItWorksPage signedIn={signedIn} />} />
      <Route path="/about" element={<AboutPage signedIn={signedIn} />} />
      <Route path="/api" element={<ApiPage signedIn={signedIn} />} />
      <Route path="/privacy" element={<PrivacyPage signedIn={signedIn} />} />
      <Route path="/login" element={session ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route element={requireSession(<Layout email={session?.user?.email} onSignOut={onSignOut} />)}>
        <Route path="/home" element={<HomePage email={session?.user?.email} />} />
        <Route path="/notebooks" element={<NotebooksPage />} />
        <Route path="/notebooks/:notebookId" element={<NotebookPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage signedIn={signedIn} />} />
    </Routes>
  )
}
