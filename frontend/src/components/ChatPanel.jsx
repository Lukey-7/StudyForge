import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { postStream } from '../lib/sse'
import { buildSuggestions } from '../lib/suggestions'
import Markdown from './Markdown'

// Chat with your notes. Saved messages come from the server (React Query);
// the answer currently being streamed lives in local state (`live`) until it's saved,
// then we reload the session's messages and drop the live copy.
export default function ChatPanel({ notebookId, openSessionId, onOpenCitation }) {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState(openSessionId || null) // null = new chat; a deep link opens one
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [live, setLive] = useState(null) // { question, answer, citations, rewrittenQuery, stopped }
  const [chatError, setChatError] = useState('')
  const abortRef = useRef(null)
  const stoppedByUser = useRef(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

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
      startNewChat()
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

  // Loads a session's saved messages into the cache, then shows that session.
  async function showSession(id) {
    await queryClient
      .fetchQuery({ queryKey: ['chat-messages', id], queryFn: () => api(`/chat/sessions/${id}/messages`), staleTime: 0 })
      .catch(() => {})
    queryClient.invalidateQueries({ queryKey: ['chat-sessions', notebookId] })
    setSessionId(id)
  }

  async function ask(text) {
    const question = text.trim()
    if (!question || streaming) return

    setInput('')
    setChatError('')
    setStreaming(true)
    setLive({ question, answer: '', citations: [], rewrittenQuery: null, stopped: false })
    stoppedByUser.current = false
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
      if (err.name !== 'AbortError') {
        failed = true
        setChatError(`${err.message}. Check the server is running and try again.`)
      } else if (!stoppedByUser.current) {
        return // the component unmounted: nothing left to update
      }
    }

    if (stoppedByUser.current) {
      // The server saved the question but not the half-written answer. Show the saved
      // question from the session, and keep the partial answer on screen marked as stopped.
      setLive((l) => ({ ...l, question: finalSessionId ? null : l.question, stopped: true }))
      if (finalSessionId) await showSession(finalSessionId)
    } else {
      if (finalSessionId) await showSession(finalSessionId) // load saved messages BEFORE removing the live copy: no flicker
      setLive(null)
    }
    if (failed && !finalSessionId) setInput(question) // nothing was saved: give the text back to retry
    setStreaming(false)
  }

  function stop() {
    stoppedByUser.current = true
    abortRef.current?.abort()
  }

  function startNewChat() {
    setSessionId(null)
    setLive(null)
    setChatError('')
  }

  const isEmpty = !sessionId && !live

  return (
    <div className="panel chat-panel">
      <div className="panel-header chat-toolbar">
        <h2 className="visually-hidden">Chat</h2>
        <select
          className="input chat-session-select"
          aria-label="Choose a chat"
          value={sessionId ?? ''}
          disabled={streaming}
          onChange={(e) => {
            setLive(null)
            setSessionId(e.target.value || null)
          }}
        >
          <option value="">New chat</option>
          {sessions.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button className="btn btn-quiet" onClick={startNewChat} disabled={streaming || isEmpty}>
          New chat
        </button>
        {sessionId && (
          <button
            className="btn btn-quiet link-danger"
            disabled={streaming || deleteSession.isPending}
            onClick={() => window.confirm('Delete this chat and its messages?') && deleteSession.mutate(sessionId)}
          >
            Delete
          </button>
        )}
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {isEmpty && (
          <EmptyChat
            notebookId={notebookId}
            onPick={(q) => {
              ask(q)
              inputRef.current?.focus()
            }}
          />
        )}
        {messages.isError && <p className="error-text small">Couldn't load this chat: {messages.error.message}</p>}

        {savedMessages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role}
            content={m.content}
            citations={m.citations}
            rewrittenQuery={m.rewritten_query}
            onCitation={onOpenCitation}
          />
        ))}

        {live && (
          <>
            {live.question && <ChatMessage role="user" content={live.question} />}
            <ChatMessage
              role="assistant"
              content={live.answer}
              citations={live.citations}
              rewrittenQuery={live.rewrittenQuery !== live.question ? live.rewrittenQuery : null}
              onCitation={onOpenCitation}
              pending={streaming && !live.answer}
            />
            {live.stopped && <p className="muted small">You stopped this answer, so it wasn't saved.</p>}
          </>
        )}
        {chatError && (
          <p className="error-text small" role="alert">
            {chatError}
          </p>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
      >
        <textarea
          ref={inputRef}
          className="input"
          rows={2}
          maxLength={4000}
          aria-label="Your question"
          placeholder={streaming ? 'Writing the answer…' : 'Ask about your notes'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a new line (like most chat apps)
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(input)
            }
          }}
        />
        {streaming ? (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!input.trim()}>
            Ask
          </button>
        )}
      </form>
    </div>
  )
}

// Empty chat: explain what the chat does and offer a few questions built from the notes' headings.
function EmptyChat({ notebookId, onPick }) {
  const { suggestions, hasReadySource } = useSuggestions(notebookId)
  if (!hasReadySource) {
    return (
      <div className="chat-empty">
        <h3>Ask your notes</h3>
        <p className="muted">
          Add lecture notes in Sources first. Once a source is ready you can ask anything about it here.
        </p>
      </div>
    )
  }
  return (
    <div className="chat-empty">
      <h3>Ask your notes</h3>
      <p className="muted">
        Answers come only from the sources in this notebook, and each claim points to the passage it came from.
      </p>
      <div className="suggestions">
        {suggestions.map((q) => (
          <button key={q} className="suggestion" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

// Headings of the first few ready sources -> up to 4 suggested questions.
// Uses the same ['sources'] and ['chunks'] cache keys as the Sources panel and reader, so no extra requests.
function useSuggestions(notebookId) {
  const sources = useQuery({ queryKey: ['sources', notebookId], queryFn: () => api(`/notebooks/${notebookId}/sources`) })
  const readyIds = (sources.data || []).filter((s) => s.status === 'ready').slice(0, 3).map((s) => s.id)
  const chunkQueries = useQueries({
    queries: readyIds.map((id) => ({ queryKey: ['chunks', id], queryFn: () => api(`/sources/${id}/chunks`) })),
  })
  const headings = chunkQueries.flatMap((q) => (q.data || []).map((c) => c.heading))
  return { suggestions: buildSuggestions(headings), hasReadySource: readyIds.length > 0 }
}

// Turn "[S1]" (or "[S1, S2]", or a book section "[B1]") into markdown links "[S1](#cite-S1)" so react-markdown hands them
// to our custom <a> renderer below, which draws a highlighter mark instead of a link.
function linkCitations(text) {
  return (text || '').replace(/\[([SB]\d+(?:\s*,\s*[SB]\d+)*)\]/g, (_, labels) =>
    labels
      .split(/\s*,\s*/)
      .map((label) => `[${label}](#cite-${label})`)
      .join(' '),
  )
}

function ChatMessage({ role, content, citations = [], rewrittenQuery, onCitation, pending }) {
  if (role === 'user') {
    return <div className="msg msg-user">{content}</div>
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
      const where = citation ? `${citation.source_name}${citation.page ? `, page ${citation.page}` : ''}` : ''
      return (
        <button
          type="button"
          className="cite-mark"
          disabled={!citation}
          title={citation ? `Open ${where}` : label}
          aria-label={citation ? `Source ${label}: ${where}` : label}
          onClick={() => onCitation(citation, content)}
        >
          {label}
        </button>
      )
    },
  }

  return (
    <div className="msg msg-answer reading">
      {rewrittenQuery && <p className="rewritten">Searched your notes for “{rewrittenQuery}”</p>}
      {pending ? (
        <p className="muted">Searching your notes…</p>
      ) : (
        <Markdown components={components}>{linkCitations(content)}</Markdown>
      )}
    </div>
  )
}
