import { describe, expect, it } from 'vitest'
import { firstName, summary } from './HomePage'

describe('home page text', () => {
  it('takes a first name from an email address', () => {
    expect(firstName('varun.darji@somaiya.edu')).toBe('Varun')
    expect(firstName('MARIA_ruiz99@x.com')).toBe('Maria')
    expect(firstName('')).toBe('')
    expect(firstName(undefined)).toBe('')
  })

  it('summarises the desk in one sentence', () => {
    expect(summary({ notebooks: 0, ready_sources: 0, generations: 0 })).toMatch(/desk is empty/)
    expect(summary({ notebooks: 1, ready_sources: 1, generations: 0 })).toBe(
      'You have 1 notebook with 1 document ready to study, and nothing made yet.',
    )
    expect(summary({ notebooks: 2, ready_sources: 5, generations: 3 })).toBe(
      'You have 2 notebooks with 5 documents ready to study, and you have made 3 study sets so far.',
    )
  })
})
