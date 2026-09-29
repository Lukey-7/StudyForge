// Colored pill for a source's ingestion status.
const IN_PROGRESS = ['uploaded', 'extracting', 'chunking', 'embedding']

export function isProcessing(status) {
  return IN_PROGRESS.includes(status)
}

export default function StatusBadge({ status }) {
  let variant = 'badge-amber'
  if (status === 'ready') variant = 'badge-green'
  if (status === 'failed') variant = 'badge-red'
  return (
    <span className={`badge ${variant}`}>
      {isProcessing(status) && <span className="spinner" aria-hidden="true" />}
      {status}
    </span>
  )
}
