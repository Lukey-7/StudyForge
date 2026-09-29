import { describe, expect, it } from 'vitest'
import { changeSummary } from './bookChanges'

describe('changeSummary', () => {
  it('lists only what changed, in reading order', () => {
    const changes = { new_concepts: ['A', 'B'], added: [{ id: 1 }], revised: [{ id: 2 }, { id: 3 }], removed: [] }
    expect(changeSummary(changes)).toBe('2 new concepts, 1 new section, 2 sections revised')
  })

  it('is empty when nothing changed', () => {
    expect(changeSummary({ new_concepts: [], added: [], revised: [], removed: [] })).toBe('')
  })
})
