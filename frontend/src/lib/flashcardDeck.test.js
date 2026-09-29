import { describe, expect, it } from 'vitest'
import { createDeck, currentCard, markAgain, markGotIt, move } from './flashcardDeck'

describe('flashcard deck', () => {
  it('starts with every card not yet learned', () => {
    const deck = createDeck(3, [1])
    expect(deck.queue).toEqual([0, 2])
    expect(deck.learned).toEqual([1])
  })

  it('ignores saved ratings for cards that no longer exist', () => {
    expect(createDeck(2, [5]).queue).toEqual([0, 1])
  })

  it('"Got it" removes the card and shows the next one', () => {
    const deck = markGotIt(createDeck(3))
    expect(deck.queue).toEqual([1, 2])
    expect(deck.learned).toEqual([0])
    expect(currentCard(deck)).toBe(1)
  })

  it('"Again" sends the card to the end of the deck', () => {
    const deck = markAgain(createDeck(3))
    expect(deck.queue).toEqual([1, 2, 0])
    expect(currentCard(deck)).toBe(1)
  })

  it('wraps to the start after rating the last card in the queue', () => {
    let deck = move(createDeck(3), -1) // go to the last card
    expect(currentCard(deck)).toBe(2)
    deck = markGotIt(deck)
    expect(currentCard(deck)).toBe(0)
  })

  it('is finished when every card is learned', () => {
    let deck = createDeck(2)
    deck = markGotIt(markGotIt(deck))
    expect(currentCard(deck)).toBe(null)
    expect(deck.learned).toEqual([0, 1])
  })
})
