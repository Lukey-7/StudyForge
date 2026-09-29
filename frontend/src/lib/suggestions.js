// Suggested first questions for an empty chat, built from the headings the backend
// found while chunking the student's notes. Pure function so it can be tested.

export const GENERIC_SUGGESTIONS = [
  'Summarise the main ideas in my notes',
  'What key terms should I know?',
  'What is most likely to come up in the exam?',
  'Explain the hardest idea in simple words',
]

// Headings that tell us nothing about the topic.
const USELESS = /^(introduction|intro|contents|table of contents|summary|references|untitled|page \d+)$/i

export function buildSuggestions(headings, max = 4) {
  // Clean, drop useless or overly long headings, and dedupe case-insensitively.
  const seen = new Set()
  const topics = []
  for (const raw of headings) {
    const heading = String(raw || '').replace(/^#+\s*/, '').trim()
    const key = heading.toLowerCase()
    if (!heading || heading.length > 60 || USELESS.test(heading) || seen.has(key)) continue
    seen.add(key)
    topics.push(heading)
  }

  // Alternate between "explain" and "quiz me" so the list shows both uses of the chat.
  const fromNotes = topics.slice(0, max).map((t, i) => (i % 2 === 0 ? `Explain ${t}` : `Quiz me on ${t}`))
  // Top up with generic questions if the notes had too few headings.
  return [...fromNotes, ...GENERIC_SUGGESTIONS].slice(0, max)
}
