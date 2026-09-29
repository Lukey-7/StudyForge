// Glossary links in book text: finds concept names and aliases in a paragraph so the reader can
// hover a term for its definition. Longest names win ("B+ tree index" over "B+ tree"), matching is
// case-insensitive on word boundaries, and each concept is linked once per section (its first use),
// the way a textbook marks a term the first time it appears.

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// concepts: [{id, name, aliases, definition}] -> {pattern, byName} or null when there is nothing to find
export function buildMatcher(concepts) {
  const byName = new Map()
  for (const c of concepts || []) {
    for (const name of [c.name, ...(c.aliases || [])]) {
      const key = name.trim().toLowerCase()
      if (key.length >= 2 && !byName.has(key)) byName.set(key, c)
    }
  }
  if (byName.size === 0) return null
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  // \b does not work next to symbols like "+", so use explicit non-word lookarounds
  const pattern = new RegExp(`(?<![\\w])(${names.join('|')})(?![\\w])`, 'gi')
  return { pattern, byName }
}

// Splits text into [{text}] and [{text, concept}] pieces. `linked` is a Set of concept ids already
// linked earlier in the section; it is updated in place.
export function linkTerms(text, matcher, linked = new Set(), skip = new Set()) {
  if (!matcher) return [{ text }]
  const pieces = []
  let last = 0
  for (const m of text.matchAll(matcher.pattern)) {
    const concept = matcher.byName.get(m[0].toLowerCase())
    if (!concept || linked.has(concept.id) || skip.has(concept.id)) continue
    if (m.index > last) pieces.push({ text: text.slice(last, m.index) })
    pieces.push({ text: m[0], concept })
    linked.add(concept.id)
    last = m.index + m[0].length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}
