import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel'
import SourcesPanel from '../components/SourcesPanel'
import StudioPanel from '../components/StudioPanel'
import { api } from '../lib/api'

const TABS = [
  { id: 'sources', label: 'Sources' },
  { id: 'studio', label: 'Studio' },
  { id: 'chat', label: 'Chat' },
]

// Three areas side by side on wide screens; on narrow screens a tab bar shows one at a time.
// All three stay mounted (just hidden with CSS) so switching tabs never interrupts
// a running generation or a streaming chat answer.
export default function NotebookPage() {
  const { notebookId } = useParams()
  const [activeTab, setActiveTab] = useState('studio')
  const notebook = useQuery({ queryKey: ['notebook', notebookId], queryFn: () => api(`/notebooks/${notebookId}`) })

  if (notebook.isPending) return <div className="page muted">Loading notebook…</div>
  if (notebook.isError) {
    return (
      <div className="page">
        <p className="error-text">{notebook.error.message}</p>
        <Link to="/">← Back to notebooks</Link>
      </div>
    )
  }

  return (
    <div className="notebook-page">
      <div className="notebook-header">
        <Link to="/" className="muted small">
          ← Notebooks
        </Link>
        <h2 className="ellipsis">{notebook.data.title}</h2>
      </div>

      <div className="tab-bar" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="notebook-columns">
        <section className={`column column-sources ${activeTab === 'sources' ? 'active' : ''}`}>
          <SourcesPanel notebookId={notebookId} />
        </section>
        <section className={`column column-studio ${activeTab === 'studio' ? 'active' : ''}`}>
          <StudioPanel notebookId={notebookId} />
        </section>
        <section className={`column column-chat ${activeTab === 'chat' ? 'active' : ''}`}>
          <ChatPanel notebookId={notebookId} />
        </section>
      </div>
    </div>
  )
}
