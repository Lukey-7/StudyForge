import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'

export default function NotebooksPage() {
  const [showCreate, setShowCreate] = useState(false)
  const notebooks = useQuery({ queryKey: ['notebooks'], queryFn: () => api('/notebooks') })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notebooks</h1>
          <p className="muted">Each notebook holds your sources, generated study material and chats.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New notebook
        </button>
      </div>

      {notebooks.isPending && <p className="muted">Loading notebooks…</p>}
      {notebooks.isError && <p className="error-text">Could not load notebooks: {notebooks.error.message}</p>}
      {notebooks.data?.length === 0 && (
        <div className="glass-card empty-state">
          <h3>No notebooks yet</h3>
          <p className="muted">Create one, upload a PDF or notes, and generate quizzes, flashcards and more.</p>
        </div>
      )}

      <div className="card-grid">
        {notebooks.data?.map((nb) => (
          <NotebookCard key={nb.id} notebook={nb} />
        ))}
      </div>

      {showCreate && <CreateNotebookModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function NotebookCard({ notebook }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api(`/notebooks/${notebook.id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notebooks'] }),
  })

  function handleDelete(e) {
    e.preventDefault() // the card is a link; don't navigate
    if (window.confirm(`Delete "${notebook.title}" and everything in it? This cannot be undone.`)) {
      remove.mutate()
    }
  }

  return (
    <Link to={`/notebooks/${notebook.id}`} className="glass-card notebook-card">
      <div className="notebook-card-top">
        <h3>{notebook.title}</h3>
        <button className="icon-btn danger" title="Delete notebook" onClick={handleDelete} disabled={remove.isPending}>
          🗑
        </button>
      </div>
      {notebook.description && <p className="muted clamp-2">{notebook.description}</p>}
      <div className="notebook-card-meta">
        <span className="badge">
          {notebook.source_count} source{notebook.source_count === 1 ? '' : 's'}
        </span>
        {notebook.source_count > 0 && (
          <span className="badge badge-green">{notebook.ready_count} ready</span>
        )}
        <span className="muted small">{formatDate(notebook.updated_at)}</span>
      </div>
      {remove.isError && <p className="error-text small">{remove.error.message}</p>}
    </Link>
  )
}

function CreateNotebookModal({ onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const create = useMutation({
    mutationFn: () => api('/notebooks', { method: 'POST', body: { title, description: description || null } }),
    onSuccess: (notebook) => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
      navigate(`/notebooks/${notebook.id}`) // go straight in so the user can add sources
    },
  })

  return (
    <Modal title="New notebook" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <label className="field">
          <span>Title</span>
          <input className="input" required maxLength={200} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <textarea className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {create.isError && <p className="error-text">{create.error.message}</p>}
        <div className="row-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
