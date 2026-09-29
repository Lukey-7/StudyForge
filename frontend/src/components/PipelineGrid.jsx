import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const STRATEGY_LABELS = {
  whole_notebook_map_reduce: 'whole notebook',
  top_k_for_topic: 'top-k retrieval',
  per_source: 'per source',
}

// Grid of the 16 pipelines + the personalisation controls + a Generate button.
// `pipelines` is the React Query result for GET /pipelines (fetched by the parent).
export default function PipelineGrid({ notebookId, pipelines, onGenerated }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState('summary')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [length, setLength] = useState('medium')
  const [focusTopic, setFocusTopic] = useState('')
  const [force, setForce] = useState(false)

  const generate = useMutation({
    mutationFn: () =>
      api(`/notebooks/${notebookId}/generate/${selected}`, {
        method: 'POST',
        body: { difficulty, length, focus_topic: focusTopic.trim() || null, force },
      }),
    onSuccess: (generation) => {
      onGenerated(generation)
      queryClient.invalidateQueries({ queryKey: ['generations', notebookId] })
    },
  })

  const elapsed = useElapsedSeconds(generate.isPending)
  const spec = pipelines.data?.find((p) => p.name === selected)

  return (
    <div className="panel glass-card">
      <div className="panel-header">
        <h3>Studio</h3>
        <span className="mono-label muted">16 pipelines</span>
      </div>

      {pipelines.isPending && <p className="muted small">Loading pipelines…</p>}
      {pipelines.isError && <p className="error-text small">{pipelines.error.message}</p>}

      <div className="pipeline-grid">
        {pipelines.data?.map((p) => (
          <button
            key={p.name}
            className={`pipeline-card ${selected === p.name ? 'selected' : ''}`}
            onClick={() => setSelected(p.name)}
            disabled={generate.isPending}
            title={p.description}
          >
            <span className="pipeline-title">{p.title}</span>
            <span className="pipeline-desc">{p.description}</span>
            <span className="mono-label muted">{STRATEGY_LABELS[p.retrieval_strategy] || p.retrieval_strategy}</span>
          </button>
        ))}
      </div>

      <div className="controls">
        <label className="field field-inline">
          <span>Difficulty</span>
          <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label className="field field-inline">
          <span>Length</span>
          <select className="input" value={length} onChange={(e) => setLength(e.target.value)}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>
        <label className="field field-grow">
          <span>Focus topic (optional)</span>
          <input
            className="input"
            maxLength={200}
            placeholder="e.g. photosynthesis"
            value={focusTopic}
            onChange={(e) => setFocusTopic(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Force regenerate
        </label>
      </div>

      <div className="generate-row">
        <button className="btn btn-primary" disabled={generate.isPending || !spec} onClick={() => generate.mutate()}>
          {generate.isPending ? (
            <>
              <span className="spinner" /> Generating… {elapsed}s
            </>
          ) : (
            `Generate ${spec?.title ?? ''}`
          )}
        </button>
        {spec?.counts?.[length] && (
          <span className="muted small">
            ≈ {spec.counts[length]} items at “{length}”
          </span>
        )}
      </div>
      {generate.isPending && elapsed > 10 && (
        <p className="muted small">Big notebooks can take up to ~90 s (map-reduce + free-tier rate limits).</p>
      )}
      {generate.isError && <p className="error-text">{generate.error.message}</p>}
    </div>
  )
}

// Counts seconds while `running` is true, so the user sees the request is still alive.
function useElapsedSeconds(running) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return undefined
    const started = Date.now()
    setSeconds(0)
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])
  return seconds
}
