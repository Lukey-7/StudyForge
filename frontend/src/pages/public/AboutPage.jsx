import { Link } from 'react-router-dom'
import PublicPage from '../../landing/PublicPage'
import { REPO_URL } from '../../landing/SiteFooter'

// Retrieval evaluation, copied from backend/eval/results.md (run 2026-09-29, 33 questions,
// gemini-embedding-001, rerank by gemini-3.8-flash). Update this when the eval is re-run.
const EVAL = [
  { mode: 'Meaning search only (Chroma)', r1: '0.82', r5: '0.97', mrr: '0.89' },
  { mode: 'Keyword search only (BM25)', r1: '0.91', r5: '0.97', mrr: '0.94' },
  { mode: 'Both, merged', r1: '0.82', r5: '1.00', mrr: '0.90' },
  { mode: 'Both, merged, duplicates removed', r1: '0.82', r5: '1.00', mrr: '0.90' },
  { mode: 'All of the above plus the Gemini rerank (what runs by default)', r1: '1.00', r5: '1.00', mrr: '1.00' },
]

export default function AboutPage({ signedIn }) {
  return (
    <PublicPage
      signedIn={signedIn}
      title="How StudyForge is built"
      lede="A student project that grew into a full application. Everything here is open source, and every design decision is written down in the repository."
    >
      <section className="public-section" id="architecture">
        <h2>The shape of it</h2>
        <p>
          A React app in the browser talks to a Python server. The server keeps your notebooks, documents and chat in
          a Postgres database, your original files in file storage, and the meaning-based index of your passages in a
          vector database. Google's Gemini models do the reading, writing and embedding. Nothing runs in the browser
          except the interface.
        </p>
      </section>

      <section className="public-section" id="react">
        <h2>React and FastAPI</h2>
        <p>
          The interface is React with Vite, written in plain JavaScript and CSS so every part of it can be explained
          without a framework manual. Server data (your notebooks, the state of an upload) is handled by React Query,
          which also polls while a document is being processed.
        </p>
        <p>
          The server is FastAPI. Each request is checked against your login, every notebook is checked for ownership,
          and long jobs (reading a PDF, embedding its passages) run in the background while the interface polls for
          progress. Chat answers stream word by word over a long-lived HTTP response.
        </p>
      </section>

      <section className="public-section" id="gemini">
        <h2>Gemini and ChromaDB</h2>
        <p>
          Gemini Flash writes every format and every answer, reads scanned pages and transcribes audio. It is asked for
          strictly structured output, which the server validates before it reaches you. A separate Gemini embedding
          model turns each passage into a vector, and ChromaDB stores those vectors and finds the nearest ones to your
          question. A hand-written keyword index runs alongside it, and the two rankings are merged.
        </p>
        <p>
          Every call to Gemini goes through a rate limiter and retries with back-off, because the free tier is small.
          If Gemini is unavailable and an OpenAI key is configured, text generation falls back to it; embeddings never
          mix providers.
        </p>
      </section>

      <section className="public-section" id="supabase">
        <h2>Supabase</h2>
        <p>
          Supabase provides three things: a Postgres database for notebooks, documents, passages, generated outputs
          and chat; file storage for the originals you upload; and sign-in. The database uses row-level security, so
          even a direct query with your login can only ever see your own rows. Postgres is the source of truth for
          passage text; the vector index can always be rebuilt from it.
        </p>
      </section>

      <section className="public-section" id="eval">
        <h2>How well does the search work?</h2>
        <p>
          The search step is scored on 33 questions over three study documents, each labelled with the passage that
          answers it. Two numbers: how often the right passage is the first result, and how often it is in the top
          five. MRR rewards the right passage being ranked high.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Search method</th>
                <th>Right passage first</th>
                <th>In the top five</th>
                <th>MRR</th>
              </tr>
            </thead>
            <tbody>
              {EVAL.map((row) => (
                <tr key={row.mode}>
                  <th>{row.mode}</th>
                  <td>{row.r1}</td>
                  <td>{row.r5}</td>
                  <td>{row.mrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="public-note">
          The set is small and close to its ceiling, so read this as a comparison between methods, not a promise of
          perfect search. The full run, and the script that produces it, are in the repository.
        </p>
      </section>

      <section className="public-section" id="history">
        <h2>History</h2>
        <p>
          The first version was written in Go, with a Go LLM library and SQLite, and presented at a master's viva. Its
          search matched keywords only. This version is a rewrite: React, FastAPI, real embeddings, hybrid search,
          structured output, cited chat, tests and an evaluation. The Go version is preserved in the repository under{' '}
          <code>legacy-go/</code>.
        </p>
      </section>

      <section className="public-section" id="author">
        <h2>Who made it</h2>
        <p>
          StudyForge is by Varun Darji, an M.Sc. Computer Science graduate. The source code, the architecture notes
          and the decision log are all public.
        </p>
        <p className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Source code on GitHub
          </a>
          <Link to="/api" className="btn btn-quiet">
            API reference
          </Link>
          <Link to="/privacy" className="btn btn-quiet">
            Your notes and privacy
          </Link>
        </p>
      </section>
    </PublicPage>
  )
}
