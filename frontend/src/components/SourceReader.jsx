import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { splitSentences, supportingSentences } from '../lib/citationMatch'
import { plural } from '../lib/format'

// A drawer that shows a source the way the AI sees it: the list of chunks (passages)
// with their page and heading. When opened from a citation, the cited passage is marked
// with a highlighter bar in the margin and scrolled into view, and inside it only the
// sentence(s) that back up the answer's claims get the highlighter stroke, the way you
// would mark a textbook, so the student can check the answer against their own notes.
export default function SourceReader({ sourceId, highlightChunkId, citeLabel, claims, onClose }) {
  const panelRef = useRef(null)
  const markedRef = useRef(null)

  const source = useQuery({ queryKey: ['source', sourceId], queryFn: () => api(`/sources/${sourceId}`) })
  const chunks = useQuery({ queryKey: ['chunks', sourceId], queryFn: () => api(`/sources/${sourceId}/chunks`) })

  // Escape closes; focus moves into the drawer so keyboard users land in it.
  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Once the chunks are on screen, bring the cited passage into view: its start when it fits,
  // otherwise the first highlighted sentence, which is what the student came to check.
  useEffect(() => {
    const passage = markedRef.current
    if (!passage) return
    const firstMark = passage.querySelector('mark.support')
    const tall = passage.offsetHeight > (passage.parentElement?.clientHeight || 0) * 0.8
    if (firstMark && tall) firstMark.scrollIntoView({ block: 'center' })
    else passage.scrollIntoView({ block: 'start' })
  }, [chunks.data, highlightChunkId])

  const title = source.data?.file_name || 'Source'

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Reading ${title}`}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-heading">
            <h2 className="ellipsis" title={title}>
              {title}
            </h2>
            {chunks.data && (
              <span className="muted small">
                {plural(chunks.data.length, 'passage')}
                {source.data?.page_count ? ` from ${plural(source.data.page_count, 'page')}` : ''}
              </span>
            )}
          </div>
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="drawer-body reading">
          {chunks.isPending && <p className="muted">Loading the passages…</p>}
          {chunks.isError && <p className="error-text">Couldn't load this source: {chunks.error.message}</p>}
          {chunks.data?.length === 0 && (
            <p className="muted">This source has no passages yet. It may still be processing.</p>
          )}

          {chunks.data?.map((chunk) => {
            const marked = chunk.id === highlightChunkId
            const support = marked ? supportingSentences(chunk.text.replace(/^#+\s*/gm, ''), claims) : null
            return (
              <article key={chunk.id} className={`passage ${marked ? 'is-cited' : ''}`} ref={marked ? markedRef : null}>
                <p className="passage-label">
                  {pageLabel(chunk)}
                  {chunk.heading && <span className="passage-heading">{chunk.heading}</span>}
                  {marked && <span className="passage-cited-tag">{citeLabel ? `Cited as ${citeLabel}` : 'Cited'}</span>}
                </p>
                {paragraphs(chunk.text).map((para, i) => (
                  <p key={i} className={`passage-text ${para.isHeading ? 'passage-subhead' : ''}`}>
                    {support && !para.isHeading ? <Sentences text={para.text} support={support} /> : para.text}
                  </p>
                ))}
                {marked && support?.size === 0 && claims?.length > 0 && (
                  <p className="passage-note">The answer draws on this passage as a whole.</p>
                )}
              </article>
            )
          })}
        </div>
      </aside>
    </div>
  )
}

// A paragraph with its supporting sentences marked. The inline <mark> lets the highlighter
// stroke wrap line by line across a sentence that spans several lines.
function Sentences({ text, support }) {
  return splitSentences(text).map((sentence, i) => (
    <span key={i}>
      {i > 0 && ' '}
      {support.has(sentence) ? <mark className="support">{sentence}</mark> : sentence}
    </span>
  ))
}

// Split a chunk into paragraphs (blank lines) and turn Markdown "# Heading" lines into plain headings,
// so the highlighter doesn't paint empty lines or show raw # characters.
function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ text: p.replace(/^#+\s*/, ''), isHeading: /^#+\s/.test(p) }))
}

function pageLabel(chunk) {
  if (!chunk.page) return `Passage ${chunk.chunk_index + 1}`
  if (chunk.page_end && chunk.page_end !== chunk.page) return `pp. ${chunk.page}–${chunk.page_end}`
  return `p. ${chunk.page}`
}
