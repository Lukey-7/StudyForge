import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatBytes } from '../lib/format'
import StatusBadge, { isProcessing } from './StatusBadge'

const ACCEPT = '.pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.flac'

export default function SourcesPanel({ notebookId }) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const sources = useQuery({
    queryKey: ['sources', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/sources`),
    // Poll every 2 s only while something is still being ingested; stop when all are ready/failed.
    refetchInterval: (query) => (query.state.data?.some((s) => isProcessing(s.status)) ? 2000 : false),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sources', notebookId] })
    queryClient.invalidateQueries({ queryKey: ['notebooks'] }) // source counts on the home page
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
      setNotice(duplicates.length ? `Already uploaded: ${duplicates.join(', ')}` : '')
      refresh()
    },
    onError: refresh, // some files may have succeeded before the error
  })

  function handlePasted() {
    setShowPaste(false)
    refresh()
  }

  return (
    <div className="panel glass-card">
      <div className="panel-header">
        <h3>Sources</h3>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowPaste(!showPaste)}>
          {showPaste ? 'Close' : 'Paste text'}
        </button>
      </div>

      {showPaste ? (
        <PasteTextForm notebookId={notebookId} onDone={handlePasted} />
      ) : (
        <DropZone busy={upload.isPending} onFiles={(files) => upload.mutate(files)} />
      )}

      {upload.isError && <p className="error-text small">{upload.error.message}</p>}
      {notice && <p className="notice-text small">{notice}</p>}

      {sources.isPending && <p className="muted small">Loading sources…</p>}
      {sources.isError && <p className="error-text small">{sources.error.message}</p>}
      {sources.data?.length === 0 && <p className="muted small">No sources yet. Add a PDF, notes, an image or audio.</p>}

      <ul className="source-list">
        {sources.data?.map((source) => (
          <SourceItem key={source.id} source={source} onChange={refresh} />
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

  function openPicker() {
    if (!busy) inputRef.current.click()
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
      onClick={openPicker}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
      role="button"
      tabIndex={0}
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
      {busy ? (
        <span>
          <span className="spinner" /> Uploading…
        </span>
      ) : (
        <>
          <strong>Drop files here</strong>
          <span className="muted small">or click to browse · PDF, DOCX, TXT, MD, images, audio · max 25 MB</span>
        </>
      )}
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
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <input
        className="input"
        placeholder="Title (e.g. Lecture 3 notes)"
        required
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input"
        rows={6}
        placeholder="Paste your notes here (at least 20 characters)…"
        required
        minLength={20}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {add.isError && <p className="error-text small">{add.error.message}</p>}
      <button className="btn btn-primary btn-sm" disabled={add.isPending}>
        {add.isPending ? 'Adding…' : 'Add as source'}
      </button>
    </form>
  )
}

function SourceItem({ source, onChange }) {
  const retry = useMutation({
    mutationFn: () => api(`/sources/${source.id}/retry`, { method: 'POST' }),
    onSuccess: onChange,
  })
  const remove = useMutation({
    mutationFn: () => api(`/sources/${source.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  })

  const details = [
    formatBytes(source.size_bytes),
    source.page_count ? `${source.page_count} pages` : null,
    source.chunk_count ? `${source.chunk_count} chunks` : null,
  ].filter(Boolean)

  const actionError = retry.error || remove.error

  return (
    <li className="source-item">
      <div className="source-top">
        <span className="source-name ellipsis" title={source.file_name}>
          {source.file_name}
        </span>
        <StatusBadge status={source.status} />
      </div>
      <div className="muted small">{details.join(' · ')}</div>

      {source.status === 'failed' && (
        <div className="source-error">
          <span className="error-text small">{source.error_message || 'Processing failed.'}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
            Retry
          </button>
        </div>
      )}
      {actionError && <p className="error-text small">{actionError.message}</p>}

      <button
        className="link-btn danger small"
        disabled={remove.isPending}
        onClick={() => window.confirm(`Delete "${source.file_name}"?`) && remove.mutate()}
      >
        Delete
      </button>
    </li>
  )
}
