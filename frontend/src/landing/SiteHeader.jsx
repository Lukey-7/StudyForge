import { Link, NavLink } from 'react-router-dom'
import { isDemoMode } from '../lib/supabase'

// The header shared by the landing page and the public pages (formats, how it works, about...).
// Sticky, with links to the public pages and the account actions on the right.
export default function SiteHeader({ signedIn }) {
  const canSignIn = !signedIn && !isDemoMode
  const startHref = canSignIn ? '/login?mode=signup' : '/home'

  return (
    <header className="landing-header">
      <div className="band-inner landing-header-inner">
        <Link to="/welcome" className="wordmark">
          StudyForge
        </Link>
        <nav className="landing-nav" aria-label="Pages">
          <NavLink to="/formats">Formats</NavLink>
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <div className="landing-account">
          {canSignIn ? (
            <>
              <Link to="/login" className="btn btn-quiet">
                Sign in
              </Link>
              <Link to={startHref} className="btn btn-primary">
                Start studying
              </Link>
            </>
          ) : (
            <Link to="/home" className="btn btn-primary">
              Open StudyForge
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
