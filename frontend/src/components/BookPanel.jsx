import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { isProcessing } from './SourceProgress'

// The Book tab, phase 1: the knowledge map. Every concept StudyForge found across the
// notebook's sources, with how many sources support it and where the sources disagree.
// Opening a concept shows its claims, each with evidence chips that open the exact passage.
export default function BookPanel({ notebookId, onOpenEvidence }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [onlyConflicts, setOnlyConflicts] = useState(false)
  const [openId, setOpenId] = useState(null)

  // Same key as the Sources panel, so both share one request and one polling loop.
  const sources = useQuery({ queryKey: ['sources', notebookId], queryFn: () => api(`/notebooks/${notebookId}/sources`) })
  const stillReading = sources.data?.some((s) => isProcessing(s.status))
  const map = useQuery({
    queryKey: ['knowledge', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/knowledge`),
    // Poll while a source is being processed or the map is being built; stop when idle.
    refetchInterval: (query) => (stillReading || query.state.data?.job?.status === 'running' ? 3000 : false),
    refetchIntervalInBackground: true,
  })
  // A source finishing processing is when its knowledge build starts: refresh once then.
  const wasReading = useRef(false)
  useEffect(() => {
    if (wasReading.current && !stillReading) queryClient.invalidateQueries({ queryKey: ['knowledge', notebookId] })
    wasReading.current = Boolean(stillReading)
  }, [stillReading, notebookId, queryClient])

  const rebuild = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/knowledge/rebuild`, { method: 'POST' }),
    onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: ['knowledge', notebookId] }), 1500),
  })

  const data = map.data
  const conflicted = new Set(data?.concepts_with_conflicts || [])
  const query = filter.trim().toLowerCase()
  const shown = (data?.concepts || []).filter(
    (c) =>
      (!onlyConflicts || conflicted.has(c.id)) &&
      (!query || c.name.toLowerCase().includes(query) || c.aliases.some((a) => a.toLowerCase().includes(query))),
  )
  const terms = shown.filter((c) => c.kind === 'term')
  const examples = shown.filter((c) => c.kind === 'example')
  const job = data?.job

  return (
    <div className="panel book">
      <div className="panel-header book-header">
        <div>
          <h2>Book</h2>
          {data && data.concepts.length > 0 && (
            <p className="muted small">
              {plural(data.concepts.filter((c) => c.kind === 'term').length, 'concept')} and{' '}
              {plural(data.concepts.filter((c) => c.kind === 'example').length, 'named example')} found across your
              sources.
            </p>
          )}
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => rebuild.mutate()} disabled={rebuild.isPending || job?.status === 'running'}>
          Rebuild knowledge map
        </button>
      </div>

      {map.isError && <p className="error-text small">Couldn't load the knowledge map: {map.error.message}</p>}
      {job?.status === 'running' && (
        <div className="book-progress" role="status">
          <span>Reading your sources and mapping concepts… {job.progress}%</span>
          <span className="book-progress-bar" style={{ '--p': `${job.progress}%` }} />
        </div>
      )}
      {job?.queued?.length > 0 && <p className="muted small">{job.queued[0]}</p>}
      {job?.failed?.length > 0 && (
        <p className="error-text small">Part of the map could not be built: {job.failed[0]}. Try Rebuild knowledge map.</p>
      )}

      {data && data.concepts.length === 0 && job?.status !== 'running' && (
        <div className="book-empty">
          <h3>Your book starts here</h3>
          <p className="muted">
            Add documents in Sources. StudyForge reads them and maps every concept and named example, with the sources
            that support each one and the places where your sources disagree. The more you add, the more complete it gets.
          </p>
        </div>
      )}

      {data && data.concepts.length > 0 && (
        <>
          <div className="book-filters">
            <input
              className="input"
              type="search"
              placeholder="Find a concept"
              aria-label="Find a concept"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {data.conflict_count > 0 && (
              <label className="book-toggle">
                <input type="checkbox" checked={onlyConflicts} onChange={(e) => setOnlyConflicts(e.target.checked)} />
                Only where sources disagree ({data.conflict_count})
              </label>
            )}
          </div>
          <ConceptList title="Concepts" concepts={terms} conflicted={conflicted} onOpen={setOpenId} />
          <ConceptList title="Named examples" concepts={examples} conflicted={conflicted} onOpen={setOpenId} />
          {shown.length === 0 && <p className="muted small">Nothing matches “{filter}”.</p>}
        </>
      )}

      {openId && (
        <ConceptDrawer
          notebookId={notebookId}
          conceptId={openId}
          onOpenConcept={setOpenId}
          onOpenEvidence={onOpenEvidence}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function ConceptList({ title, concepts, conflicted, onOpen }) {
  if (concepts.length === 0) return null
  return (
    <section className="concept-section" aria-label={title}>
      <h3>{title}</h3>
      <ul className="concept-list">
        {concepts.map((c) => (
          <li key={c.id}>
            <button className="concept-row" onClick={() => onOpen(c.id)}>
              <span className="concept-row-name">{c.name}</span>
              <span className="concept-row-def">{c.definition}</span>
              <span className="concept-row-meta">
                {plural(c.source_count, 'source')}
                {conflicted.has(c.id) && <span className="concept-disagree">Sources disagree</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ConceptDrawer({ notebookId, conceptId, onOpenConcept, onOpenEvidence, onClose }) {
  const panelRef = useRef(null)
  const detail = useQuery({
    queryKey: ['concept', notebookId, conceptId],
    queryFn: () => api(`/notebooks/${notebookId}/concepts/${conceptId}`),
  })

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, conceptId])

  const d = detail.data
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer concept-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={d ? d.concept.name : 'Concept'}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-heading">
            <h2 className="ellipsis">{d ? d.concept.name : 'Loading…'}</h2>
            {d && (
              <span className="muted small">
                {d.concept.kind === 'example' ? 'Named example' : 'Concept'}
                {d.concept.aliases.length > 0 && `, also called ${d.concept.aliases.join(', ')}`}
              </span>
            )}
          </div>
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="drawer-body">
          {detail.isError && <p className="error-text">Couldn't load this concept: {detail.error.message}</p>}
          {d && (
            <>
              <p className="concept-definition reading">{d.concept.definition}</p>

              {d.conflicts.length > 0 && (
                <section className="concept-block">
                  <h3>Where your sources disagree</h3>
                  {d.conflicts.map((c) => (
                    <div key={c.id} className="conflict">
                      <div className="conflict-side">
                        <p className="conflict-label">The book says</p>
                        <p className="reading">{c.claim_text}</p>
                        <EvidenceChips evidence={c.claim_evidence} claim={c.claim_text} onOpen={onOpenEvidence} />
                      </div>
                      <div className="conflict-side">
                        <p className="conflict-label">But one source says</p>
                        <p className="reading">{c.contradicting_text}</p>
                        <EvidenceChips evidence={[c.contradicting_evidence]} claim={c.contradicting_text} onOpen={onOpenEvidence} />
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <section className="concept-block">
                <h3>What your sources say</h3>
                <ul className="claim-list">
                  {d.claims.map((claim) => (
                    <li key={claim.id} className="claim">
                      <p className="reading">{claim.text}</p>
                      <EvidenceChips evidence={claim.evidence} claim={claim.text} onOpen={onOpenEvidence} />
                    </li>
                  ))}
                </ul>
              </section>

              {d.related.length > 0 && (
                <section className="concept-block">
                  <h3>Related</h3>
                  <div className="related">
                    {d.related.map((r) => (
                      <button key={`${r.id}-${r.kind}-${r.direction}`} className="related-chip" onClick={() => onOpenConcept(r.id)}>
                        <span className="muted">{relationLabel(r)}</span> {r.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

// One chip per supporting passage: "lecture.pdf, p. 3". Opens the source reader at that passage
// with the claim as the text to find, so its sentence is marked.
function EvidenceChips({ evidence, claim, onOpen }) {
  return (
    <div className="evidence-chips">
      {evidence.map((e) => (
        <button key={e.chunk_id} className="evidence-chip" onClick={() => onOpen(e, claim)}>
          {e.source_name}
          {e.page ? `, p. ${e.page}` : ''}
        </button>
      ))}
    </div>
  )
}

export function relationLabel({ kind, direction }) {
  if (kind === 'contrasts_with') return 'Contrasts with'
  if (kind === 'requires') return direction === 'out' ? 'Requires' : 'Needed for'
  return direction === 'out' ? 'Part of' : 'Includes'
}
