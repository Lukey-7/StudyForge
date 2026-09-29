import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatBytes, plural } from '../lib/format'
import SourceProgress, { isProcessing } from './SourceProgress'
import { useToast } from './Toast'

const ACCEPT = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.flac'

// Left column: add notes (upload or paste) and see each source move through processing.
export default function SourcesPanel({ notebookId, onOpenSource }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [showPaste, setShowPaste] = useState(false)

  const sources = useQuery({
    queryKey: ['sources', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/sources`),
    // Poll every 2 s only while something is still being processed; stop when all are ready/failed.
    refetchInterval: (query) => (query.state.data?.some((s) => isProcessing(s.status)) ? 2000 : false),
    // Keep polling when the tab is hidden and refresh when it regains focus. Otherwise someone who
    // switches apps while a PDF is processed comes back to a stale "Reading the text…" for good.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sources', notebookId] })
    queryClient.invalidateQueries({ queryKey: ['notebooks'] }) // source counts on the notebooks page
  }

  // Upload files one after another (simpler to reason about than parallel uploads).
  const upload = useMutation({
    mutationFn: async (files) => {
      const duplicates = []
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const result = await api(`/notebooks/${notebookId}/sources`, { method: 'POST', formData: form })
        if (result.duplicate) duplicates.push(file.name)
      }
      return duplicates
    },
    onSuccess: (duplicates) => {
      if (duplicates.length) toast(`Already in this notebook: ${duplicates.join(', ')}`)
      refresh()
    },
    onError: refresh, // some files may have succeeded before the error
  })

  function handlePasted() {
    setShowPaste(false)
    toast('Notes added')
    refresh()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Sources</h2>
        <button className="btn btn-quiet" onClick={() => setShowPaste(!showPaste)} aria-expanded={showPaste}>
          {showPaste ? 'Upload files instead' : 'Paste text'}
        </button>
      </div>

      {showPaste ? (
        <PasteTextForm notebookId={notebookId} onDone={handlePasted} />
      ) : (
        <DropZone busy={upload.isPending} onFiles={(files) => upload.mutate(files)} />
      )}

      {upload.isError && (
        <p className="error-text small">
          Upload failed: {upload.error.message}. Check the file type and size, then try again.
        </p>
      )}

      {sources.isPending && <p className="muted small">Loading sources…</p>}
      {sources.isError && <p className="error-text small">Couldn't load sources: {sources.error.message}</p>}
      {sources.data?.length === 0 && (
        <p className="muted small">Nothing here yet. Add your first lecture notes above to start studying.</p>
      )}

      <ul className="source-list">
        {sources.data?.map((source) => (
          <SourceItem key={source.id} source={source} onChange={refresh} onOpen={() => onOpenSource(source.id)} />
        ))}
      </ul>
    </div>
  )
}

function DropZone({ busy, onFiles }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault() // stop the browser from opening the file
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`drop-zone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault() // required, otherwise onDrop never fires
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files)
          e.target.value = '' // allow picking the same file again later
          if (files.length) onFiles(files)
        }}
      />
      <p className="drop-title">{busy ? 'Uploading…' : 'Drop lecture notes here'}</p>
      <p className="drop-help">
        PDF, Word, text or Markdown, photos of slides or whiteboards, and recordings (MP3, WAV, M4A). Up to 25 MB each.
      </p>
      <button className="btn btn-secondary" disabled={busy} onClick={() => inputRef.current.click()}>
        Upload files
      </button>
    </div>
  )
}

function PasteTextForm({ notebookId, onDone }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const add = useMutation({
    mutationFn: () => api(`/notebooks/${notebookId}/sources/text`, { method: 'POST', body: { title, text } }),
    onSuccess: onDone,
  })

  return (
    <form
      className="stack paste-form"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <label className="field">
        <span>Title</span>
        <input
          className="input"
          placeholder="e.g. Lecture 3 notes"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input"
          rows={7}
          placeholder="Paste at least a couple of sentences"
          required
          minLength={20}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {add.isError && <p className="error-text small">Couldn't add the notes: {add.error.message}</p>}
      <button className="btn btn-primary" disabled={add.isPending}>
        {add.isPending ? 'Adding…' : 'Add notes'}
      </button>
    </form>
  )
}

function SourceItem({ source, onChange, onOpen }) {
  const retry = useMutation({
    mutationFn: () => api(`/sources/${source.id}/retry`, { method: 'POST' }),
    onSuccess: onChange,
  })
  const remove = useMutation({
    mutationFn: () => api(`/sources/${source.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  })

  const isReady = source.status === 'ready'
  const details = [
    formatBytes(source.size_bytes),
    source.page_count ? plural(source.page_count, 'page') : null,
    source.chunk_count ? plural(source.chunk_count, 'passage') : null,
  ].filter(Boolean)
  const actionError = retry.error || remove.error

  return (
    <li className={`source-item status-${source.status}`}>
      {/* Only a ready source has passages to read, so only then is the name a button. */}
      {isReady ? (
        <button className="source-name" onClick={onOpen} title={`Read ${source.file_name}`}>
          {source.file_name}
        </button>
      ) : (
        <span className="source-name" title={source.file_name}>
          {source.file_name}
        </span>
      )}
      <span className="source-details">{details.join(', ')}</span>

      {isProcessing(source.status) && <SourceProgress status={source.status} />}

      {source.status === 'failed' && (
        <div className="source-error">
          <p className="error-text small">
            {source.error_message || 'Processing failed.'} You can try again, or delete it and upload another copy.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
            {retry.isPending ? 'Retrying…' : 'Try again'}
          </button>
        </div>
      )}
      {actionError && <p className="error-text small">{actionError.message}</p>}

      <div className="source-actions">
        {isReady && (
          <button className="link-btn small" onClick={onOpen}>
            Read passages
          </button>
        )}
        <button
          className="link-btn link-danger small"
          disabled={remove.isPending}
          onClick={() => window.confirm(`Delete “${source.file_name}” from this notebook?`) && remove.mutate()}
        >
          Delete
        </button>
      </div>
    </li>
  )
}
