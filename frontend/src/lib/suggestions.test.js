import { describe, expect, it } from 'vitest'
import { buildSuggestions, GENERIC_SUGGESTIONS } from './suggestions'

describe('buildSuggestions', () => {
  it('builds questions from headings, deduped, max 4', () => {
    const out = buildSuggestions(['B+ trees', 'b+ trees', 'Introduction', 'Hash indexes', 'Leaf splits', 'Buffer pool', 'Extra'])
    expect(out).toEqual(['Explain B+ trees', 'Quiz me on Hash indexes', 'Explain Leaf splits', 'Quiz me on Buffer pool'])
  })

  it('tops up with generic questions', () => {
    expect(buildSuggestions([null, 'Joins'])).toEqual(['Explain Joins', ...GENERIC_SUGGESTIONS.slice(0, 3)])
  })
})
