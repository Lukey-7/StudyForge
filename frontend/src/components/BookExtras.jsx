import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { API_URL, api, authHeaders, errorMessage } from '../lib/api'
import Markdown from './Markdown'
import QuizView from './outputs/QuizView'
import { loadMermaid, nextMermaidId } from './outputs/MindMapView'

// Phases 4 and 5 of the living textbook, as pieces the reader composes: figures drawn by code
// (chapter concept map, comparison tables), export (Markdown, EPUB, print to PDF), and the learner
// tools (explain differently, quiz me on this chapter).

// ---------------------------------------------------------------- figures
export function ChapterMap({ code }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const id = nextMermaidId('chapter-map')
    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((r) => !cancelled && setSvg(r.svg))
      .catch(() => {
        if (!cancelled) setFailed(true)
        document.getElementById(`d${id}`)?.remove()
      })
    return () => {
      cancelled = true
    }
  }, [code])
  if (failed) return <pre className="code-block">{code}</pre>
  if (!svg) return <p className="muted small">Drawing the map…</p>
  // mermaid (securityLevel 'strict') builds the SVG from labels our code wrote, not from raw model text
  return <div className="mindmap" dangerouslySetInnerHTML={{ __html: svg }} />
}

export function ComparisonTables({ tables, onOpenConcept }) {
  if (!tables?.length) return null
  return tables.map((t) => (
    <figure key={t.columns.map((c) => c.id).join('-')} className="book-figure">
      <figcaption className="small muted">Compared side by side (from what your sources say)</figcaption>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c.id}>
                  <button className="btn-link" onClick={() => onOpenConcept(c.id)}>
                    {c.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {t.columns.map((c) => (
                <td key={c.id}>{c.definition}</td>
              ))}
            </tr>
            <tr>
              {t.columns.map((c) => (
                <td key={c.id}>
                  <ul>
                    {c.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  ))
}

// ---------------------------------------------------------------- export
async function download(notebookId, format) {
  const res = await fetch(`${API_URL}/notebooks/${notebookId}/book/export?format=${format}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null), res.status))
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `book.${format}`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

// Markdown and EPUB download; "Print or save as PDF" renders the Markdown export into a print-only
// block and opens the browser's print dialog (a print stylesheet, no PDF library on the server).
export function ExportMenu({ notebookId }) {
  const [printing, setPrinting] = useState(null)
  const [error, setError] = useState('')
  const run = (fn) => () => {
    setError('')
    fn().catch((e) => setError(e.message))
  }
  useEffect(() => {
    if (!printing) return undefined
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 300) // let the book render first
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  return (
    <>
      <details className="book-export">
        <summary className="btn btn-quiet btn-sm">Export</summary>
        <div className="book-export-menu">
          <button className="btn-link" onClick={run(() => download(notebookId, 'md'))}>
            Markdown (.md)
          </button>
          <button className="btn-link" onClick={run(() => download(notebookId, 'epub'))}>
            E-book (.epub)
          </button>
          <button
            className="btn-link"
            onClick={run(async () => {
              const res = await fetch(`${API_URL}/notebooks/${notebookId}/book/export?format=md`, { headers: await authHeaders() })
              if (!res.ok) throw new Error(`Export failed (${res.status})`)
              setPrinting(await res.text())
            })}
          >
            Print or save as PDF
          </button>
          {error && <p className="error-text small">{error}</p>}
        </div>
      </details>
      {printing && (
        <div className="book-print" aria-hidden="true">
          <Markdown>{printing}</Markdown>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- explain differently
export function ExplainBox({ notebookId, sectionId }) {
  const explain = useMutation({
    mutationFn: (style) => api(`/notebooks/${notebookId}/book/sections/${sectionId}/explain`, { method: 'POST', body: { style } }),
  })
  return (
    <div className="book-explain">
      <div className="row">
        <span className="muted small">Explain this section</span>
        <button className="btn btn-quiet btn-sm" disabled={explain.isPending} onClick={() => explain.mutate('simpler')}>
          More simply
        </button>
        <button className="btn btn-quiet btn-sm" disabled={explain.isPending} onClick={() => explain.mutate('steps')}>
          Step by step
        </button>
      </div>
      {explain.isPending && <p className="muted small">Explaining…</p>}
      {explain.isError && <p className="error-text small">{explain.error.message}</p>}
      {explain.data && (
        <div className="book-explain-text">
          <p className="small muted">Explained again from this section's own passages:</p>
          <Markdown>{explain.data.text}</Markdown>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- quiz me on this chapter
// Runs the existing quiz pipeline focused on the chapter's title and concepts; the first full
// attempt's score is saved, and chapters under 70% show up as weak spots.
export function ChapterQuiz({ notebookId, chapter, conceptNames, onClose }) {
  const queryClient = useQueryClient()
  const panelRef = useRef(null)
  const focus = `${chapter}: ${conceptNames.join(', ')}`.slice(0, 200)
  const quiz = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/generate/quiz`, { method: 'POST', body: { focus_topic: focus, length: 'short' } }),
  })
  const save = useMutation({
    mutationFn: ({ score, total }) => api(`/notebooks/${notebookId}/book/quiz-result`, { method: 'POST', body: { chapter, score, total } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['book', notebookId] }),
  })
  const { mutate } = quiz
  useEffect(() => {
    mutate()
    panelRef.current?.focus()
  }, [mutate])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer concept-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Quiz: ${chapter}`}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-header">
          <div className="drawer-heading">
            <h2 className="ellipsis">Quiz: {chapter}</h2>
            <span className="muted small">Your first full attempt is saved; under 70% marks the chapter as a weak spot.</span>
          </div>
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-body">
          {quiz.isPending && <p className="muted">Writing questions on this chapter…</p>}
          {quiz.isError && <p className="error-text">{quiz.error.message}</p>}
          {quiz.data && <QuizView output={quiz.data.output} onFinish={(score, total) => save.mutate({ score, total })} />}
          {save.isSuccess && <p className="muted small">Score saved.</p>}
          {save.isError && <p className="error-text small">Couldn't save your score: {save.error.message}</p>}
        </div>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- charts from tables in the sources
// A table of numbers a source contains, drawn by code: one series of horizontal bars (magnitude by
// category), value at the end of each bar, a hover title per bar, and the table itself one click away.
export function ChartFigure({ chart, onOpenEvidence }) {
  const s = chart.series
  const max = s ? Math.max(...s.values, 0) || 1 : 1
  return (
    <figure className="book-figure book-chart">
      <figcaption className="small">
        <strong>{chart.title}</strong>
        {s && <span className="muted"> · {s.column}</span>}
        {chart.evidence && (
          <button className="evidence-chip" onClick={() => onOpenEvidence(chart.evidence, chart.title)}>
            {chart.evidence.source_name}
            {chart.evidence.page ? `, p. ${chart.evidence.page}` : ''}
          </button>
        )}
      </figcaption>
      {s && (
        <div className="bars" role="img" aria-label={`${chart.title}: ${s.labels.map((l, i) => `${l} ${s.values[i]}`).join(', ')}`}>
          {s.labels.map((label, i) => (
            <div key={label} className="bar-row" title={`${label}: ${s.values[i].toLocaleString()} ${s.column}`}>
              <span className="bar-label">{label}</span>
              <span className="bar-track">
                <span className="bar" style={{ '--w': `${Math.max((s.values[i] / max) * 100, 0.5)}%` }} />
                <span className="bar-value">{s.values[i].toLocaleString()}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <details className="disclosure" open={!s}>
        <summary>Show as a table</summary>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                {chart.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

// ---------------------------------------------------------------- process steps and code
// Ordered steps the sources describe, drawn as a flowchart by code (with the list as a fallback).
export function StepsFigure({ steps }) {
  return (
    <figure className="book-figure book-steps">
      <figcaption className="small">
        <strong>{steps.title || 'Steps'}</strong>
      </figcaption>
      <ChapterMap code={steps.diagram} />
      <details className="disclosure">
        <summary>Show as a list</summary>
        <ol>
          {steps.items.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </details>
    </figure>
  )
}

// A code example: from the sources (with its passage) or clearly labelled as illustrative.
export function CodeExample({ example, onOpenEvidence }) {
  return (
    <figure className="book-figure book-code">
      <figcaption className="small">
        <strong>{example.caption}</strong>{' '}
        {example.from_sources ? (
          example.evidence.map((e) => (
            <button key={e.chunk_id} className="evidence-chip" onClick={() => onOpenEvidence(e, example.caption)}>
              {e.source_name}
              {e.page ? `, p. ${e.page}` : ''}
            </button>
          ))
        ) : (
          <span className="book-code-illustrative">Illustrative example, not from your sources</span>
        )}
      </figcaption>
      <pre className="code-block">
        <code data-language={example.language}>{example.code}</code>
      </pre>
    </figure>
  )
}
