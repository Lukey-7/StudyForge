import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
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
  const history = useQuery({
    queryKey: ['book-history', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/book/history`),
  })
  return (
    <Drawer title="History of this book" subtitle="Each version is what one update to your sources changed." onClose={onClose}>
      {history.isError && <p className="error-text">Couldn't load the history: {history.error.message}</p>}
      {history.data?.length === 0 && <p className="muted">No versions yet.</p>}
      <ol className="book-history">
        {(history.data || []).map((h) => (
          <li key={h.version}>
            <p>
              <strong>Version {h.version}</strong> <span className="muted small">{new Date(h.created_at).toLocaleString()}</span>
            </p>
            <p className="small">{changeSummary(h.changes) || 'No visible changes'}.</p>
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
