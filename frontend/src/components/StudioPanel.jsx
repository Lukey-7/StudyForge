import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import GenerationHistory from './GenerationHistory'
import OutputView from './outputs/OutputView'
import PipelineGrid from './PipelineGrid'
import SearchDebug from './SearchDebug'

// The middle column: pick a pipeline and generate, view the result, browse history.
// It owns just one piece of UI state - which generation is on screen.
export default function StudioPanel({ notebookId }) {
  const [current, setCurrent] = useState(null)

  // Loaded once and cached forever: the pipeline catalogue never changes at runtime.
  const pipelines = useQuery({ queryKey: ['pipelines'], queryFn: () => api('/pipelines'), staleTime: Infinity })
  const titleOf = (name) => pipelines.data?.find((p) => p.name === name)?.title

  return (
    <div className="studio">
      <PipelineGrid notebookId={notebookId} pipelines={pipelines} onGenerated={setCurrent} />

      {current && (
        <OutputView generation={current} title={titleOf(current.pipeline_name)} onClose={() => setCurrent(null)} />
      )}

      <GenerationHistory
        notebookId={notebookId}
        selectedId={current?.id}
        titleOf={titleOf}
        onSelect={setCurrent}
      />

      <SearchDebug notebookId={notebookId} />
    </div>
  )
}
