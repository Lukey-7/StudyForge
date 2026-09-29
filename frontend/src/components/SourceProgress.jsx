// Ingestion is a real sequence on the backend: uploaded -> extracting -> chunking -> embedding -> ready.
// We draw it as a thin line of five segments so the student sees how far along a file is.
export const STAGES = [
  { status: 'uploaded', label: 'Uploaded' },
  { status: 'extracting', label: 'Reading the text' },
  { status: 'chunking', label: 'Splitting into passages' },
  { status: 'embedding', label: 'Indexing for search' },
  { status: 'ready', label: 'Ready' },
]

export function isProcessing(status) {
  return ['uploaded', 'extracting', 'chunking', 'embedding'].includes(status)
}

export default function SourceProgress({ status }) {
  const current = STAGES.findIndex((s) => s.status === status) // -1 for "failed"
  const label = STAGES[current]?.label

  return (
    <div className="progress" aria-label={`Step ${current + 1} of ${STAGES.length}: ${label}`}>
      <ol className="progress-line" aria-hidden="true">
        {STAGES.map((stage, i) => (
          <li key={stage.status} className={i < current ? 'done' : i === current ? 'now' : ''} />
        ))}
      </ol>
      <span className="progress-label">{label}…</span>
    </div>
  )
}
