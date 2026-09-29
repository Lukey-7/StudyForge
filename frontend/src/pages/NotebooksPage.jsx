import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { plural, spineColor, timeAgo } from '../lib/format'

// "Your notebooks": every notebook drawn as an exercise-book cover.
export default function NotebooksPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const notebooks = useQuery({ queryKey: ['notebooks'], queryFn: () => api('/notebooks') })

  const all = notebooks.data || []
  const query = search.trim().toLowerCase()
  const shown = query ? all.filter((nb) => nb.title.toLowerCase().includes(query)) : all

  return (
    <div className="page">
      <div className="page-header">
        <h1>Your notebooks</h1>
        {all.length > 0 && (
          <input
            className="input search-input"
            type="search"
            placeholder="Find a notebook by title"
            aria-label="Find a notebook by title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {notebooks.isPending && <p className="muted">Loading your notebooks…</p>}
      {notebooks.isError && (
        <p className="error-text">
          Couldn't load your notebooks: {notebooks.error.message}. Check the server is running, then reload.
        </p>
      )}

      {notebooks.data && all.length === 0 && (
        <div className="empty-state">
          <h2>Start with one module</h2>
          <p className="muted">
            A notebook holds the lecture notes for one course. Add your PDFs, slides or recordings and StudyForge turns
            them into quizzes, flashcards and answers that cite the page.
          </p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Create your first notebook
          </button>
        </div>
      )}

      {all.length > 0 && (
        <div className="shelf">
          {!query && (
            <button className="cover cover-new" onClick={() => setShowCreate(true)}>
              <span className="cover-new-plus" aria-hidden="true">
                +
              </span>
              New notebook
            </button>
          )}
          {shown.map((nb) => (
            <NotebookCover key={nb.id} notebook={nb} />
          ))}
        </div>
      )}

      {query && shown.length === 0 && all.length > 0 && (
        <p className="muted">
          No notebook titles match “{search.trim()}”.{' '}
          <button className="link-btn" onClick={() => setSearch('')}>
            Clear search
          </button>
        </p>
      )}

      {showCreate && <CreateNotebookModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function NotebookCover({ notebook }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const remove = useMutation({
    mutationFn: () => api(`/notebooks/${notebook.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast(`Deleted “${notebook.title}”`)
      queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    },
    onError: (err) => toast(`Couldn't delete the notebook: ${err.message}`, 'error'),
  })

  function handleDelete() {
    if (window.confirm(`Delete “${notebook.title}” with all its sources, outputs and chats? This can't be undone.`)) {
      remove.mutate()
    }
  }

  const counts =
    notebook.source_count === 0
      ? 'No sources yet'
      : `${plural(notebook.source_count, 'source')}, ${notebook.ready_count} ready`

  // The link covers the whole cover (see .cover-link::after in CSS); the delete button sits above it.
  // A <button> inside an <a> would be invalid HTML, so they are siblings.
  return (
    <article className="cover" style={{ '--spine': spineColor(notebook.id) }}>
      <h2 className="cover-title">
        <Link to={`/notebooks/${notebook.id}`} className="cover-link">
          {notebook.title}
        </Link>
      </h2>
      {notebook.description && <p className="cover-desc">{notebook.description}</p>}
      <div className="cover-meta">
        <span>{counts}</span>
        <span>updated {timeAgo(notebook.updated_at)}</span>
      </div>
      <button className="cover-delete" onClick={handleDelete} disabled={remove.isPending} aria-label={`Delete ${notebook.title}`}>
        Delete
      </button>
    </article>
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
          <input
            className="input"
            required
            maxLength={200}
            autoFocus
            placeholder="e.g. Databases, week 1–6"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <textarea className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {create.isError && <p className="error-text">Couldn't create the notebook: {create.error.message}</p>}
        <div className="row-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Creating…' : 'Create notebook'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
