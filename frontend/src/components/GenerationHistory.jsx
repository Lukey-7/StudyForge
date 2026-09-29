import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDate, timeAgo } from '../lib/format'
import { formatLabel } from '../lib/formats'

// Latest 50 generations for this notebook; click one to open it again (no new AI call).
export default function GenerationHistory({ notebookId, selectedId, onSelect }) {
  const generations = useQuery({
    queryKey: ['generations', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/generations`),
  })

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Made earlier</h2>
      </div>

      {generations.isPending && <p className="muted small">Loading…</p>}
      {generations.isError && <p className="error-text small">Couldn't load earlier outputs: {generations.error.message}</p>}
      {generations.data?.length === 0 && (
        <p className="muted small">Everything you generate is kept here, so you can come back to it without waiting again.</p>
      )}

      <ul className="history-list">
        {generations.data?.map((g) => (
          <li key={g.id}>
            <button
              className={`history-item ${g.id === selectedId ? 'is-open' : ''}`}
              aria-current={g.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(g)}
            >
              <span className="history-title">{formatLabel(g.pipeline_name)}</span>
              <span className="history-params">{describeParams(g.params)}</span>
              <time className="history-time" dateTime={g.created_at} title={formatDate(g.created_at)}>
                {timeAgo(g.created_at)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// { difficulty: 'advanced', length: 'short', focus_topic: 'joins' } -> "Advanced, short, on joins"
function describeParams(params = {}) {
  const parts = [params.difficulty, params.length].filter(Boolean)
  let text = parts.join(', ')
  text = text.charAt(0).toUpperCase() + text.slice(1)
  return params.focus_topic ? `${text}, on “${params.focus_topic}”` : text
}
