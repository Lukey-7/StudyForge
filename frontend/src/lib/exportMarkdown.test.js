import { describe, expect, it } from 'vitest'
import { csvField, exportFileName, flashcardsToCsv, toMarkdown } from './exportMarkdown'

describe('toMarkdown', () => {
  it('writes a quiz with lettered options and the correct answer', () => {
    const md = toMarkdown('quiz', {
      questions: [{ question: 'What links the leaves?', options: ['Parents', 'A chain'], correct_index: 1, explanation: 'Leaves point to their neighbour.' }],
    })
    expect(md).toContain('# Quiz')
    expect(md).toContain('### 1. What links the leaves?')
    expect(md).toContain('- A. Parents\n- B. A chain')
    expect(md).toContain('**Answer:** B. A chain')
    expect(md).toContain('Leaves point to their neighbour.')
  })

  it('writes a compare table and escapes pipes inside cells', () => {
    const md = toMarkdown('compare_contrast', {
      concepts: ['B+ tree', 'Hash index'],
      rows: [{ aspect: 'Range query', values: ['Cheap | ordered', 'Full scan'] }],
      summary: 'Pick by query shape.',
    })
    expect(md).toContain('| Aspect | B+ tree | Hash index |')
    expect(md).toContain('| --- | --- | --- |')
    expect(md).toContain('| Range query | Cheap \\| ordered | Full scan |')
    expect(md.trim().endsWith('Pick by query shape.')).toBe(true)
  })

  it('handles every documented format without throwing', () => {
    const names = ['summary', 'key_concepts', 'faq', 'quiz', 'flashcards', 'exam_notes', 'study_guide', 'outline',
      'mind_map', 'glossary', 'timeline', 'practice_problems', 'simple_explanation', 'compare_contrast', 'podcast', 'textbook_chapter']
    for (const name of names) expect(toMarkdown(name, {})).toMatch(/^# /)
  })

  it('falls back to a JSON block for an unknown format', () => {
    expect(toMarkdown('mystery', { a: 1 })).toContain('```json')
  })
})

describe('flashcardsToCsv', () => {
  it('quotes every field and doubles quotes inside', () => {
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('keeps commas and line breaks inside one field', () => {
    const csv = flashcardsToCsv([
      { front: 'Fan-out, roughly?', back: 'About 256\nchildren' },
      { front: 'Plain', back: 'Card' },
    ])
    expect(csv).toBe('"Fan-out, roughly?","About 256\nchildren"\r\n"Plain","Card"\r\n')
  })
})

describe('exportFileName', () => {
  it('uses the format and the date', () => {
    expect(exportFileName('mind_map', '2026-09-29T10:00:00Z', 'md')).toBe('studyforge-mind-map-2026-09-29.md')
  })
})
