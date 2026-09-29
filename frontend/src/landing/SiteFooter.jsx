import { Link } from 'react-router-dom'
import { isDemoMode } from '../lib/supabase'

export const REPO_URL = 'https://github.com/Lukey-7/StudyForge'

// The footer shared by every public page. Every link here goes to a real page in the app
// (or to the source code); nothing is decoration.
export default function SiteFooter({ signedIn }) {
  const canSignIn = !signedIn && !isDemoMode

  return (
    <footer className="landing-footer">
      <div className="band-inner footer-grid">
        <div className="footer-about">
          <Link to="/welcome" className="wordmark">
            StudyForge
          </Link>
          <p>
            Your notes are split into passages, found with a mix of keyword and meaning-based search, and answered by
            Google's Gemini model using only those passages.
          </p>
        </div>
        <nav className="footer-col" aria-label="Product">
          <h3>Product</h3>
          <Link to="/formats">The sixteen formats</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/how-it-works#citations">Cited answers</Link>
          {canSignIn ? <Link to="/login">Sign in</Link> : <Link to="/notebooks">Your notebooks</Link>}
        </nav>
        <nav className="footer-col" aria-label="Project">
          <h3>Project</h3>
          <Link to="/about">How it is built</Link>
          <Link to="/api">API reference</Link>
          <Link to="/privacy">Your notes and privacy</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </nav>
        <nav className="footer-col" aria-label="Built with">
          <h3>Built with</h3>
          <Link to="/about#react">React and FastAPI</Link>
          <Link to="/about#gemini">Gemini and ChromaDB</Link>
          <Link to="/about#supabase">Supabase</Link>
        </nav>
      </div>
      <div className="band-inner footer-bottom">
        <span>Made by Varun Darji</span>
        <span>An open-source study project</span>
      </div>
    </footer>
  )
}
