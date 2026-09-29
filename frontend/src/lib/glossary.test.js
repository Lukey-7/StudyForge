import { describe, expect, it } from 'vitest'
import { buildMatcher, linkTerms } from './glossary'

const concepts = [
  { id: 'bt', name: 'B+ tree', aliases: [] },
  { id: 'bti', name: 'B+ tree index', aliases: [] },
  { id: 'tlb', name: 'Translation lookaside buffer', aliases: ['TLB'] },
]

const linkedNames = (pieces) => pieces.filter((p) => p.concept).map((p) => p.concept.id)

describe('glossary links', () => {
  it('prefers the longest name and keeps the text intact', () => {
    const text = 'A B+ tree index is built on a B+ tree.'
    const pieces = linkTerms(text, buildMatcher(concepts))
    expect(linkedNames(pieces)).toEqual(['bti', 'bt'])
    expect(pieces.map((p) => p.text).join('')).toBe(text)
  })

  it('matches aliases case-insensitively on word boundaries only', () => {
    const pieces = linkTerms('The tlb caches translations; TLBs are small.', buildMatcher(concepts))
    expect(pieces.filter((p) => p.concept).map((p) => p.text)).toEqual(['tlb'])
  })

  it('links a concept once per section, and never the section’s own concepts when skipped', () => {
    const matcher = buildMatcher(concepts)
    const linked = new Set()
    expect(linkedNames(linkTerms('A B+ tree.', matcher, linked))).toEqual(['bt'])
    expect(linkedNames(linkTerms('Another B+ tree.', matcher, linked))).toEqual([])
    expect(linkedNames(linkTerms('The TLB.', matcher, new Set(), new Set(['tlb'])))).toEqual([])
  })

  it('returns plain text when there are no concepts', () => {
    expect(linkTerms('Plain.', buildMatcher([]))).toEqual([{ text: 'Plain.' }])
  })
})
