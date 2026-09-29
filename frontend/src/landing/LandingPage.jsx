import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isDemoMode } from '../lib/supabase'
import CitedAnswer from './CitedAnswer'
import FormatDemo from './FormatDemo'
import { NOTES } from './samples'

// Must match the highlighter animation in landing.css (400 ms delay + 700 ms swipe).
const SWIPE_DONE_MS = 1100

// Public landing page. The one orchestrated motion: the highlighter swipes across one
// sentence of the notes, then the format demo below comes alive with a first sample.
export default function LandingPage({ signedIn }) {
  const [swipeDone, setSwipeDone] = useState(false)

  useEffect(() => {
    // With reduced motion the highlight is drawn instantly (see CSS), so don't wait.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => setSwipeDone(true), reduced ? 0 : SWIPE_DONE_MS)
    return () => clearTimeout(timer)
  }, [])

  // In demo mode (or when signed in) there is nothing to sign into: go straight to the notebooks.
  const canSignIn = !signedIn && !isDemoMode
  const startHref = canSignIn ? '/login?mode=signup' : '/notebooks'

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/welcome" className="wordmark">
          StudyForge
        </Link>
        <nav className="landing-nav" aria-label="Account">
          {canSignIn ? (
            <Link to="/login" className="btn btn-quiet">
              Sign in
            </Link>
          ) : (
            <Link to="/notebooks" className="btn btn-quiet">
              Your notebooks
            </Link>
          )}
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">Revise from your own notes, not the whole internet.</h1>
            <p className="hero-lede">
              Upload your lecture notes and StudyForge turns them into quizzes, flashcards, summaries and thirteen other
              ways to study. Ask it anything and every answer shows the page it came from.
            </p>
            <div className="row hero-actions">
              <Link to={startHref} className="btn btn-primary btn-lg">
                Start studying
              </Link>
              {canSignIn && (
                <Link to="/login" className="btn btn-secondary btn-lg">
                  Sign in
                </Link>
              )}
            </div>
          </div>

          <figure className="notes-page reading">
            <figcaption className="notes-label">
              <span>{NOTES.source}</span>
              <span>{NOTES.page}</span>
            </figcaption>
            <p>
              {NOTES.before}
              <span className="swipe">{NOTES.highlighted}</span>
              {NOTES.after}
            </p>
          </figure>
        </section>

        <section className="landing-section" aria-labelledby="demo-title">
          <h2 id="demo-title">One page of notes, sixteen ways to study it</h2>
          <p className="section-lede">
            Pick a format. Each sample below was made from the lecture paragraph above, the same way StudyForge works on
            yours.
          </p>
          <FormatDemo live={swipeDone} />
        </section>

        <section className="landing-section" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol className="steps">
            <li>
              <h3>Add your notes</h3>
              <p>PDFs, Word documents, photos of slides or the whiteboard, and lecture recordings.</p>
            </li>
            <li>
              <h3>Pick what you need</h3>
              <p>A quick summary before class, flashcards on the bus, a practice exam the week before.</p>
            </li>
            <li>
              <h3>Study with answers that cite the page</h3>
              <p>Ask questions in your own words. Every answer points back to the passage it used.</p>
            </li>
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="cited-title">
          <h2 id="cited-title">Answers that show their page</h2>
          <p className="section-lede">
            StudyForge only answers from your notes. Hover or tap a highlighted mark to see the passage behind it.
          </p>
          <CitedAnswer />
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          StudyForge is a React app talking to a Python (FastAPI) server. Your notes are split into passages, found with a
          mix of keyword and meaning-based search, and answered by Google's Gemini model using only those passages.
        </p>
        <p>
          <a href="https://github.com/Lukey-7/StudyForge" target="_blank" rel="noreferrer">
            Source code on GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
