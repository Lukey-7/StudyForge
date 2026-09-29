import { describe, expect, it } from 'vitest'
import { claimsFor, splitSentences, supportingSentences } from './citationMatch'

const PASSAGE =
  'A deadlock is a situation in which a set of processes are all blocked. ' +
  'Deadlock avoidance requires advance knowledge of maximum resource needs; the Banker\'s algorithm grants a request only if the system remains in a safe state, meaning there exists some order in which every process can finish. ' +
  'Many general-purpose operating systems simply ignore deadlocks, an approach nicknamed the ostrich algorithm.'

const ANSWER =
  'The Banker\'s algorithm grants a request only if the system remains in a safe state [S1]. ' +
  'Paging removes external fragmentation [S2]. ' +
  'It also needs advance knowledge of maximum resource needs [S1, S2].'

describe('citation matching', () => {
  it('splits prose into sentences', () => {
    expect(splitSentences('One thing. Two things? Three!')).toEqual(['One thing.', 'Two things?', 'Three!'])
    expect(splitSentences('Deadlocks\n\nA deadlock blocks. It waits.')).toEqual(['Deadlocks', 'A deadlock blocks.', 'It waits.'])
  })

  it('finds the answer sentences that carry a label, including grouped marks', () => {
    expect(claimsFor(ANSWER, 'S1')).toHaveLength(2)
    expect(claimsFor(ANSWER, 'S2')).toHaveLength(2)
    expect(claimsFor(ANSWER, 'S3')).toEqual([])
  })

  it('highlights only the supporting sentence of the passage', () => {
    const picked = supportingSentences(PASSAGE, claimsFor(ANSWER, 'S1'))
    expect(picked.size).toBe(1)
    expect([...picked][0]).toMatch(/^Deadlock avoidance requires/)
  })

  it('highlights nothing when no sentence overlaps enough', () => {
    expect(supportingSentences(PASSAGE, ['Paging removes external fragmentation [S2].']).size).toBe(0)
    expect(supportingSentences(PASSAGE, []).size).toBe(0)
  })
})
