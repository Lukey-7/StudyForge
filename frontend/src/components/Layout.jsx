import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { isDemoMode } from '../lib/supabase'

// App shell: a slim top bar + the page. A top bar (instead of a sidebar) leaves the
// full width to the notebook workspace, which needs three columns.
// On phones the account items fold into a menu button.
export default function Layout({ email, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Close the menu after navigating (adjusting state during render, no effect needed).
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  // /health tells us whether the backend has AI keys - useful to explain 503s.
  const health = useQuery({ queryKey: ['health'], queryFn: () => api('/health'), staleTime: 60_000 })

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/notebooks" className="wordmark">
          StudyForge
        </Link>

        <nav className="topnav" aria-label="Main">
          <NavLink to="/notebooks" className="topnav-link">
            Your notebooks
          </NavLink>
          <NavLink to="/welcome" className="topnav-link">
            Home
          </NavLink>
        </nav>

        <button
          className="btn btn-quiet menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="account-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>

        <div id="account-menu" className={`account ${menuOpen ? 'open' : ''}`}>
          {isDemoMode && (
            <span className="tag tag-demo" title="No Supabase keys set: no login, one shared local user">
              Demo mode
            </span>
          )}
          <BackendStatus health={health} />
          {!isDemoMode && (
            <>
              <span className="account-email ellipsis" title={email}>
                {email}
              </span>
              <button className="btn btn-quiet" onClick={onSignOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

// A dot + short text. The details (db, auth, model) go in the tooltip for the curious.
function BackendStatus({ health }) {
  if (health.isPending) return <span className="status-dot">Checking server</span>
  if (health.isError) {
    return (
      <span className="status-dot is-bad" title="Start the backend, then reload this page">
        Server offline
      </span>
    )
  }
  const h = health.data
  const details = `Database: ${h.db_backend}, auth: ${h.auth_mode}, vectors: ${h.chroma_mode}, model: ${h.llm_model ?? 'none'}`
  return (
    <span className={`status-dot ${h.ai_configured ? 'is-good' : 'is-warn'}`} title={details}>
      {h.ai_configured ? 'Server online' : 'AI key missing'}
    </span>
  )
}
