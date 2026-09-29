import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isDemoMode } from '../lib/supabase'
import CitedAnswer from './CitedAnswer'
import FormatDemo from './FormatDemo'
import { NOTES } from './samples'

// Must match the highlighter animation in landing.css (400 ms delay + 700 ms swipe).
const SWIPE_DONE_MS = 1100

const REPO_URL = 'https://github.com/Lukey-7/StudyForge'

// Public landing page. It is a sequence of full-width bands, each on its own surface:
// chalkboard (hero, formats), paper (how it works), raised slate (cited answers), deep slate (footer).
// The one orchestrated motion: the highlighter swipes across one sentence of the notes,
// then the format demo comes alive with a first sample.
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
        <div className="band-inner landing-header-inner">
          <Link to="/welcome" className="wordmark">
            StudyForge
          </Link>
          <nav className="landing-nav" aria-label="Sections">
            <a href="#formats">Formats</a>
            <a href="#how">How it works</a>
            <a href="#cited">Cited answers</a>
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
              <Link to="/notebooks" className="btn btn-primary">
                Your notebooks
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="band band-hero">
          <div className="band-inner hero">
            <div className="hero-copy">
              <h1 className="hero-title">Revise from your own notes, not the whole internet.</h1>
              <p className="hero-lede">
                Upload your lecture notes and StudyForge turns them into quizzes, flashcards, summaries and thirteen
                other ways to study. Ask it anything and every answer shows the page it came from.
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
              <p className="hero-formats">
                Works with PDFs, Word documents, photos of slides and lecture recordings.
              </p>
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
          </div>
        </section>

        <section id="formats" className="band band-formats" aria-labelledby="demo-title">
          <div className="band-inner">
            <h2 id="demo-title">One page of notes, sixteen ways to study it</h2>
            <p className="section-lede">
              Pick a format. Each sample below was made from the lecture paragraph above, the same way StudyForge works
              on yours.
            </p>
            <FormatDemo live={swipeDone} />
          </div>
        </section>

        <section id="how" className="band band-paper" aria-labelledby="how-title">
          <div className="band-inner">
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
          </div>
        </section>

        <section id="cited" className="band band-raised" aria-labelledby="cited-title">
          <div className="band-inner">
            <h2 id="cited-title">Answers that show their page</h2>
            <p className="section-lede">
              StudyForge only answers from your notes. Hover or tap a highlighted mark to see the passage behind it.
            </p>
            <CitedAnswer />
          </div>
        </section>

        <section className="band band-cta">
          <div className="band-inner cta">
            <h2>Your notes are already written. Start revising from them.</h2>
            <Link to={startHref} className="btn btn-primary btn-lg">
              Start studying
            </Link>
          </div>
        </section>
      </main>

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
            <a href="#formats">The sixteen formats</a>
            <a href="#how">How it works</a>
            <a href="#cited">Cited answers</a>
            {canSignIn ? <Link to="/login">Sign in</Link> : <Link to="/notebooks">Your notebooks</Link>}
          </nav>
          <nav className="footer-col" aria-label="Project">
            <h3>Project</h3>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source code on GitHub
            </a>
            <a href={`${REPO_URL}/blob/v2/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer">
              How it is built
            </a>
            <a href={`${REPO_URL}/blob/v2/docs/API.md`} target="_blank" rel="noreferrer">
              API reference
            </a>
          </nav>
          <nav className="footer-col" aria-label="Built with">
            <h3>Built with</h3>
            <span>React and FastAPI</span>
            <span>Gemini and ChromaDB</span>
            <span>Supabase</span>
          </nav>
        </div>
        <div className="band-inner footer-bottom">
          <span>Made by Varun Darji</span>
          <span>An open-source study project</span>
        </div>
      </footer>
    </div>
  )
}
