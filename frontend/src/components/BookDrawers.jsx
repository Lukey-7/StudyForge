import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { changeSummary } from '../lib/bookChanges'
import { plural } from '../lib/format'

// Side drawers of the book reader (living textbook, phase 3): where the sources disagree, and the
// book's history. Both reuse the drawer from the concept view.
function Drawer({ title, subtitle, onClose, children }) {
  const panelRef = useRef(null)
  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer concept-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-heading">
            <h2 className="ellipsis">{title}</h2>
            {subtitle && <span className="muted small">{subtitle}</span>}
          </div>
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}

function Chips({ evidence, text, onOpen }) {
  return (
    <div className="evidence-chips">
      {evidence.map((e) => (
        <button key={e.chunk_id} className="evidence-chip" onClick={() => onOpen(e, text)}>
          {e.source_name}
          {e.page ? `, p. ${e.page}` : ''}
        </button>
      ))}
    </div>
  )
}

// Every contradiction the claim check recorded: what the book says, what the other source says,
// both with their passages. The book never silently picks a side.
export function ConflictsDrawer({ conflicts, onClose, onOpenConcept, onOpenSection, onOpenEvidence }) {
  return (
    <Drawer
      title="Where your sources disagree"
      subtitle={`${plural(conflicts.length, 'disagreement')}. The book keeps what it says and shows the other source here.`}
      onClose={onClose}
    >
      {conflicts.length === 0 && <p className="muted">Your sources agree with each other so far.</p>}
      {conflicts.map((c) => (
        <section key={c.id} className="concept-block">
          <h3>
            <button className="btn-link" onClick={() => onOpenConcept(c.concept.id)}>
              {c.concept.name}
            </button>
            {c.section && (
              <span className="muted small">
                {' '}
                in{' '}
                <button className="btn-link" onClick={() => onOpenSection(c.section.id)}>
                  {c.section.title}
                </button>
              </span>
            )}
          </h3>
          <div className="conflict">
            <div className="conflict-side">
              <p className="conflict-label">The book says</p>
              <p className="reading">{c.claim_text}</p>
              <Chips evidence={c.claim_evidence} text={c.claim_text} onOpen={onOpenEvidence} />
            </div>
            <div className="conflict-side">
              <p className="conflict-label">But one source says</p>
              <p className="reading">{c.contradicting_text}</p>
              <Chips evidence={[c.contradicting_evidence]} text={c.contradicting_text} onOpen={onOpenEvidence} />
            </div>
          </div>
        </section>
      ))}
    </Drawer>
  )
}

// Every version of the book and what it changed; sections open at the version that changed them.
export function HistoryDrawer({ notebookId, onClose, onOpenSection }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(null)
  const history = useQuery({
    queryKey: ['book-history', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/book/history`),
  })
  const revert = useMutation({
    mutationFn: (version) => api(`/notebooks/${notebookId}/book/revert`, { method: 'POST', body: { version } }),
    onSuccess: () => {
      setConfirming(null)
      queryClient.invalidateQueries({ queryKey: ['book', notebookId] })
      queryClient.invalidateQueries({ queryKey: ['book-history', notebookId] })
    },
  })
  return (
    <Drawer
      title="History of this book"
      subtitle="Each version is what one update changed. The last 5 versions are kept, and you can go back to any of them."
      onClose={onClose}
    >
      {revert.isError && <p className="error-text small">Couldn't revert: {revert.error.message}</p>}
      {history.isError && <p className="error-text">Couldn't load the history: {history.error.message}</p>}
      {history.data?.length === 0 && <p className="muted">No versions yet.</p>}
      <ol className="book-history">
        {(history.data || []).map((h) => (
          <li key={h.version}>
            <p>
              <strong>Version {h.version}</strong> <span className="muted small">{new Date(h.created_at).toLocaleString()}</span>
            </p>
            <p className="small">
              {h.changes.reverted_to ? `Went back to version ${h.changes.reverted_to}` : changeSummary(h.changes) || 'No visible changes'}.
            </p>
            {h.can_revert &&
              (confirming === h.version ? (
                <p className="small">
                  The book will read as it did in version {h.version}, until your sources or settings change.{' '}
                  <button className="btn btn-secondary btn-sm" onClick={() => revert.mutate(h.version)} disabled={revert.isPending}>
                    {revert.isPending ? 'Reverting…' : 'Revert'}
                  </button>{' '}
                  <button className="btn-link" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </p>
              ) : (
                <button className="btn btn-quiet btn-sm" onClick={() => setConfirming(h.version)}>
                  Revert to this version
                </button>
              ))}
            <div className="related">
              {[...(h.changes.added || []), ...(h.changes.revised || [])].map((s) => (
                <button key={s.id} className="related-chip" onClick={() => onOpenSection(s.id, h.version)}>
                  {s.title}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Drawer>
  )
}

// The back-of-book index: terms A-Z with numbered sections; bold numbers teach the term.
export function IndexDrawer({ notebookId, onClose, onOpenSection, onOpenConcept }) {
  const [filter, setFilter] = useState('')
  const index = useQuery({ queryKey: ['book-index', notebookId], queryFn: () => api(`/notebooks/${notebookId}/book/index`) })
  const q = filter.trim().toLowerCase()
  const entries = (index.data || []).filter((e) => !q || e.term.toLowerCase().includes(q))
  const letters = [...new Set(entries.map((e) => e.term[0].toUpperCase()))]
  return (
    <Drawer title="Index" subtitle="Section numbers; bold is where a term is taught, the rest are mentions." onClose={onClose}>
      <input
        className="input"
        type="search"
        placeholder="Find a term"
        aria-label="Find a term in the index"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {index.isError && <p className="error-text small">Couldn't load the index: {index.error.message}</p>}
      {index.data && entries.length === 0 && <p className="muted small">Nothing in the index matches.</p>}
      {letters.map((letter) => (
        <section key={letter} className="book-index-letter">
          <h3>{letter}</h3>
          <ul>
            {entries
              .filter((e) => e.term[0].toUpperCase() === letter)
              .map((e) => (
                <li key={`${e.term}-${e.concept_id}`}>
                  <button className="btn-link" onClick={() => onOpenConcept(e.concept_id)}>
                    {e.term}
                  </button>
                  {e.see ? (
                    <span className="muted">, see {e.see}</span>
                  ) : (
                    <span className="book-index-refs">
                      {e.sections.map((r) => (
                        <button
                          key={r.id}
                          className={`book-index-ref${r.main ? ' is-main' : ''}`}
                          title={r.title}
                          onClick={() => onOpenSection(r.id)}
                        >
                          {r.number}
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Drawer>
  )
}

const LEVELS = [
  ['beginner', 'Beginner', 'New to the subject: simple words, intuition first'],
  ['intermediate', 'Intermediate', 'Knows the basics'],
  ['advanced', 'Advanced', 'Precise and compact'],
]
const DEPTHS = [
  ['concise', 'Concise', '1 to 3 paragraphs a section'],
  ['standard', 'Standard', '2 to 5 paragraphs'],
  ['detailed', 'Detailed', '4 to 7 paragraphs'],
]

// How the reader wants the book written. Saving a change rewrites the book in the background.
export function SettingsDrawer({ notebookId, settings, onClose }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(settings)
  const save = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/book/settings`, { method: 'PUT', body: draft }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['book', notebookId] }),
  })
  const changed = JSON.stringify(draft) !== JSON.stringify(settings)
  const group = (name, label, options) => (
    <fieldset className="book-settings-group">
      <legend>{label}</legend>
      {options.map(([value, title, hint]) => (
        <label key={value} className="book-settings-option">
          <input type="radio" name={name} checked={draft[name] === value} onChange={() => setDraft({ ...draft, [name]: value })} />
          <span>
            <strong>{title}</strong> <span className="muted small">{hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
  return (
    <Drawer title="Book settings" subtitle="How your book is written. Changing them rewrites the book." onClose={onClose}>
      {group('audience', 'Level', LEVELS)}
      {group('depth', 'Depth', DEPTHS)}
      <fieldset className="book-settings-group">
        <legend>Extras</legend>
        <label className="book-settings-option">
          <input type="checkbox" checked={draft.examples} onChange={(e) => setDraft({ ...draft, examples: e.target.checked })} />
          <span>
            <strong>Worked examples</strong> <span className="muted small">use the examples your sources give</span>
          </span>
        </label>
        <label className="book-settings-option">
          <input type="checkbox" checked={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.checked })} />
          <span>
            <strong>Code examples</strong> <span className="muted small">from your sources, or clearly labelled as illustrative</span>
          </span>
        </label>
      </fieldset>
      {save.isError && <p className="error-text small">{save.error.message}</p>}
      {save.isSuccess && <p className="muted small">{save.data.rewriting ? 'Saved. Your book is being rewritten.' : 'Nothing changed.'}</p>}
      <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!changed || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save and rewrite'}
      </button>
    </Drawer>
  )
}
