import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { plural } from '../lib/format'
import { buildMatcher, linkTerms } from '../lib/glossary'

// The book itself (living textbook, phase 2): contents on the left, one section at a time in the
// middle, and beside every paragraph the passages it was written from (the evidence rail).
// Glossary terms in the text show their definition on hover and open the concept on click.
export default function BookReader({ notebookId, concepts, busy, onOpenConcept, onOpenEvidence }) {
  const queryClient = useQueryClient()
  const [openSection, setOpenSection] = useState(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [layoutRef, wide] = useWiderThan(760)

  const book = useQuery({
    queryKey: ['book', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/book`),
    // Sources being read or the knowledge map being built means the book is about to change.
    refetchInterval: (query) => (busy || query.state.data?.job?.status === 'running' ? 3000 : false),
    refetchIntervalInBackground: true,
  })
  useEffect(() => {
    if (!busy) queryClient.invalidateQueries({ queryKey: ['book', notebookId] })
  }, [busy, notebookId, queryClient])

  const write = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/book/write`, { method: 'POST' }),
    onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: ['book', notebookId] }), 1500),
  })
  const seen = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/book/seen`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['book', notebookId] }),
  })

  const data = book.data
  const sections = useMemo(() => (data?.chapters || []).flatMap((ch) => ch.sections.map((s) => ({ ...s, chapter: ch.title }))), [data])
  const current = sections.find((s) => s.id === openSection) || sections[0]
  const job = data?.job
  const writing = job?.status === 'running'
  const failed = sections.some((s) => s.status === 'failed')

  if (book.isError) return <p className="error-text small">Couldn't load the book: {book.error.message}</p>
  if (!data) return <p className="muted small">Opening your book…</p>

  if (sections.length === 0) {
    return (
      <div className="book-empty">
        {writing ? (
          <Progress job={job} />
        ) : (
          <>
            <h3>Your book starts here</h3>
            <p className="muted">
              Add documents in Sources. StudyForge maps their concepts, then writes a book from them: chapters in a sensible order, and
              every paragraph pointing at the passages it came from. It grows as you add sources.
            </p>
            {concepts.length > 0 && (
              <button className="btn btn-primary" onClick={() => write.mutate()} disabled={write.isPending}>
                Write the book
              </button>
            )}
            {job?.status === 'failed' && <p className="error-text small">The last attempt failed: {job.detail}</p>}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="book-reader">
      {writing && <Progress job={job} />}
      <ChangesBanner changes={data.changes} sections={sections} onOpen={setOpenSection} onDismiss={() => seen.mutate()} />
      {failed && !writing && (
        <p className="error-text small">
          Some sections could not be written.{' '}
          <button className="btn-link" onClick={() => write.mutate()} disabled={write.isPending}>
            Try again
          </button>
        </p>
      )}

      <div className="book-layout" ref={layoutRef}>
        {!wide && (
          <button className="toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
            <span>Contents</span>
            <span className="muted ellipsis">{current?.title}</span>
          </button>
        )}
        <nav className="book-toc" aria-label="Contents" hidden={!wide && !tocOpen}>
          {data.chapters.map((ch) => (
            <div key={ch.index} className="toc-chapter">
              <p className="toc-chapter-title">
                <span className="toc-number">{ch.index + 1}</span> {ch.title}
              </p>
              <ol>
                {ch.sections.map((s) => (
                  <li key={s.id}>
                    <button
                      className="toc-section"
                      aria-current={current?.id === s.id ? 'page' : undefined}
                      onClick={() => {
                        setOpenSection(s.id)
                        setTocOpen(false)
                      }}
                    >
                      <span>{s.title}</span>
                      {s.revised && <span className="toc-revised" title="Revised since you last read" aria-label="revised" />}
                      {s.status !== 'current' && <span className="toc-status">{STATUS[s.status]}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        {current && (
          <SectionView
            key={current.id}
            notebookId={notebookId}
            section={current}
            concepts={concepts}
            neighbours={neighbours(sections, current.id)}
            onOpenSection={setOpenSection}
            onOpenConcept={onOpenConcept}
            onOpenEvidence={onOpenEvidence}
          />
        )}
      </div>
    </div>
  )
}

// In the three-column layout the reader is narrow; there the contents fold into a toggle.
function useWiderThan(px) {
  const [el, setEl] = useState(null) // a callback ref: the layout mounts only once the book has loaded
  const [wide, setWide] = useState(true)
  useEffect(() => {
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= px))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, px])
  return [setEl, wide]
}

const STATUS = { stale: 'to update', writing: 'writing…', failed: 'failed' }

function neighbours(sections, id) {
  const i = sections.findIndex((s) => s.id === id)
  return { prev: sections[i - 1], next: sections[i + 1] }
}

function Progress({ job }) {
  return (
    <div className="book-progress" role="status">
      <span>Writing your book… {job.progress}%</span>
      <span className="book-progress-bar" style={{ '--p': `${job.progress}%` }} />
    </div>
  )
}

// "Since you last read: 2 new concepts, 1 section revised." with a link per changed section.
function ChangesBanner({ changes, sections, onOpen, onDismiss }) {
  const changed = [...changes.revised, ...changes.added].filter((c) => sections.some((s) => s.id === c.id))
  if (changed.length === 0 && changes.removed.length === 0 && changes.new_concepts.length === 0) return null
  const parts = [
    changes.new_concepts.length && plural(changes.new_concepts.length, 'new concept'),
    changes.added.length && plural(changes.added.length, 'new section'),
    changes.revised.length && `${plural(changes.revised.length, 'section')} revised`,
    changes.removed.length && `${plural(changes.removed.length, 'section')} removed`,
  ].filter(Boolean)
  return (
    <div className="book-changes" role="status">
      <p>
        <strong>Since you last read:</strong> {parts.join(', ')}.
      </p>
      {changed.length > 0 && (
        <div className="book-changes-links">
          {changed.map((c) => (
            <button key={c.id} className="related-chip" onClick={() => onOpen(c.id)}>
              {c.title}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-quiet btn-sm" onClick={onDismiss}>
        Mark as read
      </button>
    </div>
  )
}

function SectionView({ notebookId, section, concepts, neighbours, onOpenSection, onOpenConcept, onOpenEvidence }) {
  const [activePara, setActivePara] = useState(null)
  const detail = useQuery({
    queryKey: ['book-section', notebookId, section.id, section.version, section.status],
    queryFn: () => api(`/notebooks/${notebookId}/book/sections/${section.id}`),
  })
  const d = detail.data
  const matcher = useMemo(() => buildMatcher(concepts), [concepts])

  // Link each glossary term once per section; the section's own concepts are listed above instead.
  const paragraphs = useMemo(() => {
    if (!d) return []
    const linked = new Set()
    const own = new Set(d.concepts.map((c) => c.id))
    return d.paragraphs.map((p) => ({
      ...p,
      pieces: linkTerms(p.text, matcher, linked, own),
    }))
  }, [d, matcher])

  return (
    <article className="book-section" aria-label={section.title}>
      <header className="book-section-header">
        <p className="book-chapter-name">{section.chapter}</p>
        <h3>{section.title}</h3>
        {d && d.concepts.length > 0 && (
          <div className="related">
            {d.concepts.map((c) => (
              <button key={c.id} className="related-chip" onClick={() => onOpenConcept(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {detail.isError && <p className="error-text small">Couldn't load this section: {detail.error.message}</p>}
      {!d && !detail.isError && <p className="muted small">Loading…</p>}
      {d && paragraphs.length === 0 && (
        <p className="muted">
          {section.status === 'writing' ? 'This section is being written…' : 'This section has not been written yet.'}
        </p>
      )}

      {paragraphs.map((p, i) => (
        <div
          key={i}
          className={`book-para${activePara === i ? ' is-active' : ''}`}
          onMouseEnter={() => setActivePara(i)}
          onMouseLeave={() => setActivePara(null)}
        >
          <p className="reading">
            {p.pieces.map((piece, k) =>
              piece.concept ? <Term key={k} piece={piece} onOpen={onOpenConcept} /> : <span key={k}>{piece.text}</span>,
            )}
          </p>
          <aside className="book-rail" aria-label="Where this paragraph comes from">
            {p.evidence.length === 0 ? (
              <span className="book-rail-none">No passage cited</span>
            ) : (
              p.evidence.map((e) => (
                <button
                  key={e.chunk_id}
                  className="evidence-chip"
                  onFocus={() => setActivePara(i)}
                  onClick={() => onOpenEvidence(e, p.text)}
                >
                  {e.source_name}
                  {e.page ? `, p. ${e.page}` : ''}
                </button>
              ))
            )}
          </aside>
        </div>
      ))}

      {d && d.see_also.length > 0 && (
        <p className="book-see-also">
          <span className="muted">See also </span>
          {d.see_also.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <button className="btn-link" onClick={() => onOpenConcept(c.id)}>
                {c.name}
              </button>
            </span>
          ))}
        </p>
      )}

      <nav className="book-pager" aria-label="Sections">
        {neighbours.prev ? (
          <button className="btn btn-quiet btn-sm" onClick={() => onOpenSection(neighbours.prev.id)}>
            ← {neighbours.prev.title}
          </button>
        ) : (
          <span />
        )}
        {neighbours.next && (
          <button className="btn btn-quiet btn-sm" onClick={() => onOpenSection(neighbours.next.id)}>
            {neighbours.next.title} →
          </button>
        )}
      </nav>
    </article>
  )
}

function Term({ piece, onOpen }) {
  return (
    <span className="term-wrap">
      <button className="term" onClick={() => onOpen(piece.concept.id)} aria-describedby={`tip-${piece.concept.id}`}>
        {piece.text}
      </button>
      <span className="term-tip" role="tooltip" id={`tip-${piece.concept.id}`}>
        <strong>{piece.concept.name}</strong> {piece.concept.definition}
      </span>
    </span>
  )
}
