import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'

const MODES = ['hybrid_mmr', 'hybrid_mmr_rerank', 'hybrid', 'dense', 'bm25']
const LAYERS = ['dense', 'bm25', 'fused', 'mmr']

// Demo/debug panel: shows what each retrieval layer returned for a query.
// Collapsed by default (<details>) so it doesn't distract normal users.
export default function SearchDebug({ notebookId }) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('hybrid_mmr')
  const search = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/search`, { method: 'POST', body: { query, mode } }),
  })
  const result = search.data

  // chunk id -> citation label (S1, S2...) for chunks that made it into the final context
  const labelByChunk = Object.fromEntries((result?.citations || []).map((c) => [c.chunk_id, c.label]))

  return (
    <details className="panel search-debug">
      <summary>Retrieval debugger</summary>

      <form
        className="settings-bar"
        onSubmit={(e) => {
          e.preventDefault()
          search.mutate()
        }}
      >
        <input
          className="input field-grow"
          placeholder="What would a student ask?"
          aria-label="Search query"
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label="Retrieval mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" disabled={search.isPending}>
          {search.isPending ? 'Searching…' : 'Search'}
        </button>
      </form>

      {search.isError && <p className="error-text small">Search failed: {search.error.message}</p>}

      {result && (
        <div className="stack">
          <p className="muted small">
            Embedding model {result.embedding_model}, {result.context_tokens} tokens of context.
          </p>

          <div className="layer-grid">
            {LAYERS.filter((name) => Array.isArray(result.layers?.[name])).map((name) => (
              <div key={name} className="layer">
                <h3 className="layer-name">
                  {name} ({result.layers[name].length})
                </h3>
                <ol>
                  {result.layers[name].slice(0, 10).map((item, i) => {
                    // dense/bm25/fused items are {id, score}; the mmr layer is a plain list of ids
                    const id = typeof item === 'string' ? item : item.id
                    return (
                      <li key={`${id}-${i}`} className="code-small">
                        {labelByChunk[id] && <span className="cite-mark static">{labelByChunk[id]}</span>}
                        {id.slice(0, 8)}
                        {typeof item === 'object' && <span className="muted"> {item.score}</span>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>

          <ul className="citation-list">
            {result.citations.map((c) => (
              <li key={c.label}>
                <span className="cite-mark static">{c.label}</span> <strong>{c.source_name}</strong>
                {c.page ? <span className="muted small">, p. {c.page}</span> : null}
                <p className="muted small">{c.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}
