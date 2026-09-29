import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDate, titleCase } from '../lib/format'

// Latest 50 generations for this notebook; click one to show it in the output view.
export default function GenerationHistory({ notebookId, selectedId, titleOf, onSelect }) {
  const generations = useQuery({
    queryKey: ['generations', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/generations`),
  })

  return (
    <div className="panel glass-card">
      <div className="panel-header">
        <h3>History</h3>
        {generations.data && <span className="mono-label muted">{generations.data.length}</span>}
      </div>

      {generations.isPending && <p className="muted small">Loading…</p>}
      {generations.isError && <p className="error-text small">{generations.error.message}</p>}
      {generations.data?.length === 0 && <p className="muted small">Nothing generated yet.</p>}

      <ul className="history-list">
        {generations.data?.map((g) => (
          <li key={g.id}>
            <button className={`history-item ${g.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(g)}>
              <span className="history-title">{titleOf(g.pipeline_name) || titleCase(g.pipeline_name)}</span>
              <span className="muted small">
                {g.params?.difficulty} · {g.params?.length}
                {g.params?.focus_topic ? ` · “${g.params.focus_topic}”` : ''}
              </span>
              <span className="muted small">{formatDate(g.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
