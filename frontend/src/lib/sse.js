import { API_URL, authHeaders, errorMessage } from './api'

// Parses one SSE frame ("event: x\ndata: {...}") into { event, data }.
// Frames are separated by a blank line; a frame can have several data: lines.
export function parseFrame(frame) {
  let event = 'message'
  const dataLines = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(raw) }
  } catch {
    return { event, data: raw }
  }
}

// Splits a text buffer into complete frames plus the unfinished tail.
// Network chunks can end in the middle of a frame, so we keep the tail for next time.
export function splitFrames(buffer) {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() // last piece is incomplete (or '')
  return { frames: parts.filter((p) => p.trim()), rest }
}

// POST + streaming response. EventSource can't do POST or custom headers,
// so we use fetch() and read the body stream ourselves.
export async function postStream(path, body, onEvent, signal) {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(errorMessage(data, res.status))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder() // stream mode handles multi-byte chars split across chunks
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { frames, rest } = splitFrames(buffer)
    buffer = rest
    for (const frame of frames) {
      const parsed = parseFrame(frame)
      if (parsed) onEvent(parsed.event, parsed.data)
    }
  }
  // Flush a final frame that wasn't followed by a blank line.
  const last = parseFrame(buffer.trim())
  if (last) onEvent(last.event, last.data)
}
