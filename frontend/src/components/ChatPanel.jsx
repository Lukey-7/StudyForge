import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { postStream } from '../lib/sse'
import Markdown from './Markdown'

// Chat with your sources. Saved messages come from the server (React Query);
// the answer currently being streamed lives in local state (`live`) until it's saved,
// then we reload the session's messages and drop the live copy.
export default function ChatPanel({ notebookId }) {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState(null) // null = new chat
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [live, setLive] = useState(null) // { question, answer, citations, rewrittenQuery }
  const [chatError, setChatError] = useState('')
  const [activeCitation, setActiveCitation] = useState(null)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  const sessions = useQuery({
    queryKey: ['chat-sessions', notebookId],
    queryFn: () => api(`/notebooks/${notebookId}/chat/sessions`),
  })
  const messages = useQuery({
    queryKey: ['chat-messages', sessionId],
    queryFn: () => api(`/chat/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
  })

  const deleteSession = useMutation({
    mutationFn: (id) => api(`/chat/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSessionId(null)
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', notebookId] })
    },
  })

  // Stop reading the stream if the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Keep the newest text in view while tokens arrive.
  const savedMessages = sessionId ? messages.data || [] : []
  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [savedMessages.length, live?.answer])

  async function send(e) {
    e.preventDefault()
    const question = input.trim()
    if (!question || streaming) return

    setInput('')
    setChatError('')
    setActiveCitation(null)
    setStreaming(true)
    setLive({ question, answer: '', citations: [], rewrittenQuery: null })
    abortRef.current = new AbortController()

    let finalSessionId = sessionId
    let failed = false
    const onEvent = (event, data) => {
      if (event === 'meta') {
        finalSessionId = data.session_id
        setLive((l) => ({ ...l, citations: data.citations || [], rewrittenQuery: data.rewritten_query }))
      } else if (event === 'token') {
        setLive((l) => ({ ...l, answer: l.answer + data.text }))
      } else if (event === 'done') {
        finalSessionId = data.session_id
      } else if (event === 'error') {
        failed = true
        setChatError(data.message)
      }
    }

    try {
      await postStream(`/notebooks/${notebookId}/chat`, { message: question, session_id: sessionId }, onEvent, abortRef.current.signal)
    } catch (err) {
      if (err.name === 'AbortError') return // component unmounted
      failed = true
      setChatError(err.message)
    }

    if (finalSessionId) {
      // Load the saved messages BEFORE removing the live bubble, so nothing flickers.
      await queryClient
        .fetchQuery({
          queryKey: ['chat-messages', finalSessionId],
          queryFn: () => api(`/chat/sessions/${finalSessionId}/messages`),
          staleTime: 0,
        })
        .catch(() => {})
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', notebookId] })
      setSessionId(finalSessionId)
    }
    if (failed && !finalSessionId) setInput(question) // nothing was saved: give the text back to retry
    setLive(null)
    setStreaming(false)
  }

  function startNewChat() {
    setSessionId(null)
    setActiveCitation(null)
    setChatError('')
  }

  return (
    <div className="panel glass-card chat-panel">
      <div className="panel-header chat-toolbar">
        <select
          className="input chat-session-select"
          value={sessionId ?? ''}
          disabled={streaming}
          onChange={(e) => {
            setSessionId(e.target.value || null)
            setActiveCitation(null)
          }}
        >
          <option value="">New chat</option>
          {sessions.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={startNewChat} disabled={streaming}>
          + New
        </button>
        {sessionId && (
          <button
            className="icon-btn danger"
            title="Delete this chat"
            disabled={streaming || deleteSession.isPending}
            onClick={() => window.confirm('Delete this chat?') && deleteSession.mutate(sessionId)}
          >
            🗑
          </button>
        )}
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {!sessionId && !live && (
          <p className="muted small center">Ask anything about your sources. Answers cite passages like [S1].</p>
        )}
        {messages.isError && <p className="error-text small">{messages.error.message}</p>}

        {savedMessages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role}
            content={m.content}
            citations={m.citations}
            rewrittenQuery={m.rewritten_query}
            onCitation={setActiveCitation}
          />
        ))}

        {live && (
          <>
            <ChatMessage role="user" content={live.question} />
            <ChatMessage
              role="assistant"
              content={live.answer}
              citations={live.citations}
              rewrittenQuery={live.rewrittenQuery !== live.question ? live.rewrittenQuery : null}
              onCitation={setActiveCitation}
              pending={streaming && !live.answer}
            />
          </>
        )}
        {chatError && <p className="error-text small">{chatError}</p>}
      </div>

      {activeCitation && <CitationCard citation={activeCitation} onClose={() => setActiveCitation(null)} />}

      <form className="chat-input" onSubmit={send}>
        <textarea
          className="input"
          rows={2}
          maxLength={4000}
          placeholder={streaming ? 'Answering…' : 'Ask a question…'}
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a new line (like most chat apps)
            if (e.key === 'Enter' && !e.shiftKey) send(e)
          }}
        />
        <button className="btn btn-primary" disabled={streaming || !input.trim()}>
          {streaming ? <span className="spinner" /> : 'Send'}
        </button>
      </form>
    </div>
  )
}

// Turn "[S1]" into a markdown link "[S1](#cite-S1)" so react-markdown hands it to our
// custom <a> renderer below, which draws a clickable chip instead of a link.
function linkCitations(text) {
  return (text || '').replace(/\[S(\d+)\]/g, '[S$1](#cite-S$1)')
}

function ChatMessage({ role, content, citations = [], rewrittenQuery, onCitation, pending }) {
  if (role === 'user') {
    return (
      <div className="bubble-row right">
        <div className="bubble bubble-accent">{content}</div>
      </div>
    )
  }

  const components = {
    a: ({ href, children }) => {
      if (!href?.startsWith('#cite-')) {
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      }
      const label = href.slice('#cite-'.length)
      const citation = citations?.find((c) => c.label === label)
      return (
        <button
          type="button"
          className="cite-chip"
          disabled={!citation}
          title={citation ? `${citation.source_name}${citation.page ? `, p. ${citation.page}` : ''}` : label}
          onClick={() => onCitation(citation)}
        >
          {label}
        </button>
      )
    },
  }

  return (
    <div className="bubble-row left">
      <div className="bubble bubble-other">
        {rewrittenQuery && <div className="rewritten muted small">Searched for: “{rewrittenQuery}”</div>}
        {pending ? (
          <span className="muted">
            <span className="spinner" /> Searching your sources…
          </span>
        ) : (
          <Markdown components={components}>{linkCitations(content)}</Markdown>
        )}
      </div>
    </div>
  )
}

function CitationCard({ citation, onClose }) {
  return (
    <div className="citation-card">
      <div className="citation-card-header">
        <span className="cite-chip static">{citation.label}</span>
        <strong className="ellipsis">{citation.source_name}</strong>
        <button className="icon-btn" aria-label="Close citation" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="muted small">
        {citation.page ? `Page ${citation.page}` : 'No page number'}
        {citation.heading ? ` · ${citation.heading}` : ''}
      </div>
      <p className="citation-snippet">{citation.snippet}</p>
    </div>
  )
}
