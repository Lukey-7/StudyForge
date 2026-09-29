import { describe, expect, it } from 'vitest'
import { parseFrame, splitFrames } from './sse'

describe('SSE parsing', () => {
  it('parses an event frame with JSON data', () => {
    expect(parseFrame('event: token\ndata: {"text": "hi"}')).toEqual({ event: 'token', data: { text: 'hi' } })
  })

  it('keeps an incomplete frame as the rest', () => {
    const { frames, rest } = splitFrames('event: meta\ndata: {}\n\nevent: token\ndata: {"te')
    expect(frames).toEqual(['event: meta\ndata: {}'])
    expect(rest).toBe('event: token\ndata: {"te')
  })

  it('handles CRLF line endings', () => {
    const { frames } = splitFrames('event: done\r\ndata: {}\r\n\r\n')
    expect(parseFrame(frames[0]).event).toBe('done')
  })
})
