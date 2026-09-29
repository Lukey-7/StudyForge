import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import BookPanel from '../components/BookPanel'
import ChatPanel from '../components/ChatPanel'
import SourceReader from '../components/SourceReader'
import { claimsFor } from '../lib/citationMatch'
import SourcesPanel from '../components/SourcesPanel'
import StudioPanel from '../components/StudioPanel'
import { api } from '../lib/api'

// The Book is the notebook's main view; the 16 formats live under "Study tools".
// Wide screens: Sources | (Book or Study tools) | Chat. Narrow screens: one tab at a time.
const TABS = [
  { id: 'sources', label: 'Sources' },
  { id: 'book', label: 'Book' },
  { id: 'studio', label: 'Study tools' },
  { id: 'chat', label: 'Chat' },
]
const CENTRE = TABS.filter((t) => t.id === 'book' || t.id === 'studio')

// Three areas side by side on wide screens; on narrow screens a tab bar shows one at a time.
// All three stay mounted (just hidden with CSS) so switching tabs never interrupts
// a running generation or a streaming chat answer.
//
// This page also owns the source reader, because two different areas open it:
// the Sources list (read a whole source) and the Chat (jump to the passage a citation points at).
export default function NotebookPage() {
  const { notebookId } = useParams()
  // Deep links from the home page: ?gen=<id> reopens an output, ?chat=<id> reopens a conversation.
  const [searchParams] = useSearchParams()
  const openGenerationId = searchParams.get('gen')
  const openChatId = searchParams.get('chat')
  const [activeTab, setActiveTab] = useState(openChatId ? 'chat' : openGenerationId ? 'studio' : 'book')
  // What the middle column shows on wide screens; follows the last centre tab picked.
  const [centre, setCentre] = useState(openGenerationId ? 'studio' : 'book')
  const pick = (id) => {
    setActiveTab(id)
    if (id === 'book' || id === 'studio') setCentre(id)
  }
  const [reader, setReader] = useState(null) // { sourceId, chunkId?, label?, claims? } or null when closed
  const notebook = useQuery({ queryKey: ['notebook', notebookId], queryFn: () => api(`/notebooks/${notebookId}`) })

  if (notebook.isPending) return <div className="page muted">Opening notebook…</div>
  if (notebook.isError) {
    return (
      <div className="page stack">
        <p className="error-text">Couldn't open this notebook: {notebook.error.message}</p>
        <Link to="/notebooks">Back to your notebooks</Link>
      </div>
    )
  }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <Link to="/notebooks" className="back-link">
          Your notebooks
        </Link>
        <h1 className="workspace-title ellipsis">{notebook.data.title}</h1>
      </div>

      <div className="tab-bar" role="tablist" aria-label="Notebook areas">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className="tab"
            onClick={() => pick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="workspace-columns">
        <section className={`column column-sources ${activeTab === 'sources' ? 'active' : ''}`} aria-label="Sources">
          <SourcesPanel notebookId={notebookId} onOpenSource={(sourceId) => setReader({ sourceId })} />
        </section>
        <section
          className={`column column-studio ${activeTab === 'book' || activeTab === 'studio' ? 'active' : ''}`}
          aria-label={centre === 'book' ? 'Book' : 'Study tools'}
        >
          <div className="centre-switch" role="tablist" aria-label="Book or study tools">
            {CENTRE.map((tab) => (
              <button key={tab.id} role="tab" aria-selected={centre === tab.id} className="centre-tab" onClick={() => pick(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
          {/* both stay mounted so a running generation survives switching to the Book */}
          <div hidden={centre !== 'book'}>
            <BookPanel
              notebookId={notebookId}
              onOpenEvidence={(e, claim) => setReader({ sourceId: e.source_id, chunkId: e.chunk_id, label: 'evidence', claims: [claim] })}
            />
          </div>
          <div hidden={centre !== 'studio'}>
            <StudioPanel notebookId={notebookId} openGenerationId={openGenerationId} />
          </div>
        </section>
        <section className={`column column-chat ${activeTab === 'chat' ? 'active' : ''}`} aria-label="Chat">
          <ChatPanel
            notebookId={notebookId}
            openSessionId={openChatId}
            onOpenCitation={(c, answer) =>
              setReader({ sourceId: c.source_id, chunkId: c.chunk_id, label: c.label, claims: claimsFor(answer, c.label) })
            }
          />
        </section>
      </div>

      {reader && (
        <SourceReader
          sourceId={reader.sourceId}
          highlightChunkId={reader.chunkId}
          citeLabel={reader.label}
          claims={reader.claims}
          onClose={() => setReader(null)}
        />
      )}
    </div>
  )
}
