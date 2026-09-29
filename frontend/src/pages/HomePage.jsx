import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { plural, spineColor, timeAgo } from '../lib/format'
import { formatLabel, formatNoun, groupOf } from '../lib/formats'

// The signed-in home: what you were working on, what you made, what you asked, and one
// click back into any of it. One request (GET /me/overview) feeds the whole page.
export default function HomePage({ email }) {
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api('/me/overview') })

  if (overview.isPending) return <div className="page muted">Loading your desk…</div>
  if (overview.isError) {
    return (
      <div className="page">
        <p className="error-text">Couldn't load your home page: {overview.error.message}. Check the server is running, then reload.</p>
      </div>
    )
  }

  const { notebooks, totals, recent_generations: made, recent_chats: asked } = overview.data
  const latest = notebooks[0]

  return (
    <div className="page home">
      <header className="home-greeting">
        <h1>
          {greeting()}
          {firstName(email) ? `, ${firstName(email)}` : ''}.
        </h1>
        <p className="home-summary">{summary(totals)}</p>
      </header>

      {notebooks.length > 0 && <SearchEverything />}

      {notebooks.length === 0 ? (
        <FirstRun />
      ) : (
        <>
          <div className="home-top">
            <ContinueCard
              notebook={latest}
              lastMade={made.find((g) => g.notebook_id === latest.id)}
              lastAsked={asked.find((c) => c.notebook_id === latest.id)}
            />
            <aside className="home-shelf" aria-labelledby="shelf-title">
              <h2 id="shelf-title">Your notebooks</h2>
              <ul>
                {notebooks.slice(0, 5).map((nb) => (
                  <li key={nb.id}>
                    <Link to={`/notebooks/${nb.id}`} className="shelf-row" style={{ '--spine': spineColor(nb.id) }}>
                      <span className="shelf-row-title ellipsis">{nb.title}</span>
                      <span className="shelf-row-meta">{plural(nb.ready_count, 'document')} ready</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="home-shelf-actions">
                <Link to="/notebooks?new=1" className="btn btn-secondary btn-sm">
                  New notebook
                </Link>
                <Link to="/notebooks" className="btn btn-quiet btn-sm">
                  All notebooks
                </Link>
              </div>
            </aside>
          </div>

          <div className="home-lists">
            <section aria-labelledby="made-title">
              <h2 id="made-title">Recently made</h2>
              {made.length === 0 ? (
                <p className="muted">
                  Nothing yet. Open a notebook and pick a format in the Studio: a quiz or flashcards are a good start.
                </p>
              ) : (
                <ul className="home-list">
                  {made.map((g) => (
                    <li key={g.id}>
                      <Link
                        to={`/notebooks/${g.notebook_id}?gen=${g.id}`}
                        className="home-row"
                        style={{ '--goal': groupOf(g.pipeline_name)?.color }}
                      >
                        <span className="goal-dot" aria-hidden="true" />
                        <span className="home-row-main">
                          <span className="home-row-title">{formatLabel(g.pipeline_name)}</span>
                          <span className="home-row-sub ellipsis">
                            {g.notebook_title}
                            {g.params?.focus_topic ? `, on ${g.params.focus_topic}` : ''}
                          </span>
                        </span>
                        <span className="home-row-time">{timeAgo(g.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="asked-title">
              <h2 id="asked-title">Recent questions</h2>
              {asked.length === 0 ? (
                <p className="muted">No questions yet. Every notebook has a chat that answers only from your notes.</p>
              ) : (
                <ul className="home-list">
                  {asked.map((c) => (
                    <li key={c.id}>
                      <Link to={`/notebooks/${c.notebook_id}?chat=${c.id}`} className="home-row">
                        <span className="home-row-main">
                          <span className="home-row-question reading">{c.title}</span>
                          <span className="home-row-sub ellipsis">{c.notebook_title}</span>
                        </span>
                        <span className="home-row-time">{timeAgo(c.updated_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <p className="home-foot">
        New here or showing someone? <Link to="/welcome">See what StudyForge does</Link> or{' '}
        <Link to="/formats">browse the sixteen formats</Link>.
      </p>
    </div>
  )
}

// The most recently touched notebook, drawn as a large exercise-book cover.
function ContinueCard({ notebook, lastMade, lastAsked }) {
  const waiting = notebook.source_count - notebook.ready_count
  return (
    <article className="continue cover" style={{ '--spine': spineColor(notebook.id) }} aria-labelledby="continue-title">
      <div className="continue-body">
        <p className="continue-kicker">Pick up where you left off</p>
        <h2 id="continue-title" className="continue-title">
          {notebook.title}
        </h2>
        {notebook.description && <p className="continue-desc">{notebook.description}</p>}

        <dl className="continue-facts">
          <div>
            <dt>Documents</dt>
            <dd>
              {notebook.ready_count} ready
              {waiting > 0 ? `, ${waiting} still processing` : ''}
            </dd>
          </div>
          <div>
            <dt>Last made</dt>
            <dd>{lastMade ? `${formatLabel(lastMade.pipeline_name)}, ${timeAgo(lastMade.created_at)}` : 'Nothing yet'}</dd>
          </div>
          {lastAsked && (
            <div className="continue-asked">
              <dt>Last asked</dt>
              <dd className="reading">“{lastAsked.title}”</dd>
            </div>
          )}
        </dl>

        <div className="row continue-actions">
          <Link to={`/notebooks/${notebook.id}`} className="btn btn-primary">
            Open notebook
          </Link>
          {lastMade && (
            <Link to={`/notebooks/${notebook.id}?gen=${lastMade.id}`} className="btn btn-secondary">
              Reopen the {formatNoun(lastMade.pipeline_name)}
            </Link>
          )}
          {lastAsked && (
            <Link to={`/notebooks/${notebook.id}?chat=${lastAsked.id}`} className="btn btn-quiet">
              Continue the chat
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

// No notebooks yet: say what to do, in order. This is a real sequence, so it is numbered.
function FirstRun() {
  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <h2 id="first-run-title">Three steps to your first quiz</h2>
      <ol className="first-run-steps">
        <li>
          <strong>Create a notebook</strong> for one course or module.
        </li>
        <li>
          <strong>Add your notes</strong>: PDFs, Word files, photos of slides, or a recording.
        </li>
        <li>
          <strong>Pick a format</strong> in the Studio, or ask the chat anything.
        </li>
      </ol>
      <Link to="/notebooks?new=1" className="btn btn-primary btn-lg">
        Create your first notebook
      </Link>
    </section>
  )
}

function greeting(hour = new Date().getHours()) {
  if (hour < 5) return 'Studying late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// "varun.darji@somaiya.edu" -> "Varun". Empty in demo mode (no email).
export function firstName(email) {
  const local = String(email || '').split('@')[0]
  const first = local.split(/[._\-+\d]/).find(Boolean)
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : ''
}

// One sentence instead of a row of stat tiles.
export function summary({ notebooks, ready_sources: ready, generations }) {
  if (!notebooks) return 'Your desk is empty. Start by making a notebook for one of your courses.'
  const parts = [plural(notebooks, 'notebook'), `${plural(ready, 'document')} ready to study`]
  const made = generations ? `and you have made ${plural(generations, 'study set')} so far` : 'and nothing made yet'
  return `You have ${parts.join(' with ')}, ${made}.`
}

// Search every notebook's concepts and book sections at once (living textbook, phase 5).
function SearchEverything() {
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  })
  return (
    <section className="home-search" aria-label="Search all notebooks">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          setQ(draft.trim())
        }}
      >
        <input
          className="input"
          type="search"
          placeholder="Search every notebook, e.g. deadlock"
          aria-label="Search every notebook"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit" disabled={draft.trim().length < 2}>
          Search
        </button>
      </form>
      {results.isError && <p className="error-text small">{results.error.message}</p>}
      {results.data && results.data.length === 0 && <p className="muted small">Nothing in your books matches “{q}”.</p>}
      {results.data?.length > 0 && (
        <ul className="home-list">
          {results.data.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <Link to={`/notebooks/${r.notebook.id}?${r.kind === 'concept' ? 'concept' : 'section'}=${r.id}`} className="home-row">
                <span className="home-row-main">
                  <strong>{r.title}</strong>{' '}
                  <span className="muted small">
                    {r.kind === 'concept' ? 'concept' : 'book section'} · {r.notebook.title}
                  </span>
                </span>
                <span className="muted small ellipsis">{r.snippet}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
