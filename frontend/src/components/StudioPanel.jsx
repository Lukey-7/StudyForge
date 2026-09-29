import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatNoun } from '../lib/formats'
import FormatPicker from './FormatPicker'
import GenerationHistory from './GenerationHistory'
import OutputView from './outputs/OutputView'
import SearchDebug from './SearchDebug'

// The middle column: choose a format, set a few options, generate, read the result, reopen old ones.
export default function StudioPanel({ notebookId, openGenerationId }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState('summary')
  const [settings, setSettings] = useState({
    difficulty: 'intermediate',
    length: 'medium',
    focusTopic: '',
    force: false,
  })
  const [current, setCurrent] = useState(null) // the generation on screen
  const outputRef = useRef(null)

  // Loaded once and cached forever: the format catalogue never changes at runtime.
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api('/pipelines'), staleTime: Infinity })

  const generate = useMutation({
    mutationFn: (name) =>
      api(`/notebooks/${notebookId}/generate/${name}`, {
        method: 'POST',
        body: {
          difficulty: settings.difficulty,
          length: settings.length,
          focus_topic: settings.focusTopic.trim() || null,
          force: settings.force,
        },
      }),
    onSuccess: (generation) => {
      setCurrent(generation)
      queryClient.invalidateQueries({ queryKey: ['generations', notebookId] })
    },
  })

  // Reopen the output a deep link points at (?gen=<id>), once, as soon as the history is loaded.
  const history = useQuery({
    queryKey: ['generations', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/generations`),
  })
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (!openGenerationId || openedFromLink.current || !history.data) return
    const found = history.data.find((g) => g.id === openGenerationId)
    if (found) {
      openedFromLink.current = true
      setSelected(found.pipeline_name)
      setCurrent(found)
    }
  }, [openGenerationId, history.data])

  // Bring a newly opened output into view (it sits below the picker).
  useEffect(() => {
    if (current) outputRef.current?.scrollIntoView({ block: 'start' })
  }, [current])

  const elapsed = useElapsedSeconds(generate.isPending)
  const noun = formatNoun(selected)
  const spec = pipelines.data?.find((p) => p.name === selected)
  const update = (key) => (e) =>
    setSettings({ ...settings, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <div className="studio">
      <div className="panel">
        <div className="panel-header">
          <h2>Studio</h2>
        </div>

        {pipelines.isError && <p className="error-text small">Couldn't load the formats: {pipelines.error.message}</p>}
        <FormatPicker
          pipelines={pipelines.data}
          selected={selected}
          onSelect={setSelected}
          disabled={generate.isPending}
        />

        {/* Sticky at the bottom of the column, so Generate is reachable without scrolling past 16 formats */}
        <div className="studio-actions">
          <div className="settings-bar">
            <label className="field">
              <span>Difficulty</span>
              <select className="input" value={settings.difficulty} onChange={update('difficulty')}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label className="field">
              <span>Length</span>
              <select className="input" value={settings.length} onChange={update('length')}>
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
                placeholder="e.g. leaf splits"
                value={settings.focusTopic}
                onChange={update('focusTopic')}
              />
            </label>
            <label className="checkbox" title="Ignore the saved copy and write a new one">
              <input type="checkbox" checked={settings.force} onChange={update('force')} />
              Make a fresh version
            </label>
          </div>

          <div className="generate-row">
            <button
              className="btn btn-primary"
              disabled={generate.isPending || !spec}
              onClick={() => generate.mutate(selected)}
            >
              {generate.isPending ? 'Generating…' : `Generate ${noun}`}
            </button>
            {generate.isPending ? (
              <p className="muted small" role="status">
                Reading your notes and writing {noun}… {elapsed} s
                {elapsed > 15 && ' Large notebooks can take up to a minute and a half.'}
              </p>
            ) : (
              spec?.counts?.[settings.length] > 1 && (
                <p className="muted small">About {spec.counts[settings.length]} items at this length.</p>
              )
            )}
          </div>
          {generate.isError && (
            <p className="error-text" role="alert">
              Couldn't generate {noun}: {generate.error.message}
            </p>
          )}
        </div>
      </div>

      <div ref={outputRef} className="output-anchor">
        {current && <OutputView generation={current} onClose={() => setCurrent(null)} />}
      </div>

      <GenerationHistory notebookId={notebookId} selectedId={current?.id} onSelect={setCurrent} />
      <SearchDebug notebookId={notebookId} />
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
