import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { isDemoMode } from '../lib/supabase'

// App shell: 240px sidebar + main area. On phones the sidebar becomes a slide-in drawer.
export default function Layout({ email, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Close the drawer after navigating (adjusting state during render, no effect needed).
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  // /health tells us whether the backend has AI keys - useful to explain 503s.
  const health = useQuery({ queryKey: ['health'], queryFn: () => api('/health'), staleTime: 60_000 })

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button className="icon-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <span className="brand-name">StudyForge</span>
      </header>

      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-logo">◆</span>
          <span className="brand-name">StudyForge</span>
        </div>

        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            Notebooks
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {isDemoMode && <span className="badge badge-accent">Demo mode</span>}
          <BackendStatus health={health} />
          {!isDemoMode && (
            <>
              <div className="muted small ellipsis" title={email}>
                {email}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={onSignOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

function BackendStatus({ health }) {
  if (health.isPending) return <span className="mono-label muted">API: checking…</span>
  if (health.isError) return <span className="mono-label text-red">API: offline</span>
  const h = health.data
  return (
    <span className="mono-label muted" title={`db=${h.db_backend} auth=${h.auth_mode} chroma=${h.chroma_mode}`}>
      API: online{h.ai_configured ? ` · ${h.llm_model}` : ' · AI not configured'}
    </span>
  )
}
