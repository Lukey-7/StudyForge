import { useState } from 'react'
import { createDeck, currentCard, markAgain, markGotIt, move } from '../../lib/flashcardDeck'
import { readJson, writeJson } from '../../lib/storage'

// Study flashcards one at a time: flip, then rate yourself.
// "Got it" takes the card out of the deck; "Again" sends it to the back.
// Learned cards are remembered per generation in localStorage (only when there is a generation id,
// so the landing page demo doesn't save anything).
export default function FlashcardsView({ output, generationId }) {
  const cards = output.cards || []
  const storageKey = generationId ? `studyforge:flashcards:${generationId}` : null
  const [deck, setDeck] = useState(() => createDeck(cards.length, storageKey ? readJson(storageKey, []) : []))
  const [flipped, setFlipped] = useState(false)

  if (cards.length === 0) return <p className="muted">No cards came back. Try generating them again.</p>

  // Every change goes through here: new deck, show the front, and save progress.
  function update(nextDeck) {
    setDeck(nextDeck)
    setFlipped(false)
    if (storageKey) writeJson(storageKey, nextDeck.learned)
  }

  // Keys work while focus is anywhere inside the flashcards (not on the whole page,
  // which would steal Space from scrolling and typing elsewhere).
  function onKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setFlipped((f) => !f)
    } else if (e.key === 'ArrowRight') update(move(deck, 1))
    else if (e.key === 'ArrowLeft') update(move(deck, -1))
  }

  const index = currentCard(deck)
  const progress = `${deck.learned.length} of ${cards.length} learned`

  if (index === null) {
    return (
      <div className="flashcards-done">
        <p className="quiz-score">All {cards.length} cards learned.</p>
        <button className="btn btn-secondary" onClick={() => update(createDeck(cards.length))}>
          Study the deck again
        </button>
      </div>
    )
  }

  const card = cards[index]
  return (
    <div className="flashcards">
      <p className="flashcards-progress" role="status">
        {progress}
        <span className="muted">, {deck.queue.length} to go</span>
      </p>

      <button
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
        onKeyDown={onKeyDown}
        aria-label={flipped ? `Answer: ${card.back}. Press Space to see the question.` : `Question: ${card.front}. Press Space to see the answer.`}
      >
        <span className="flashcard-inner">
          <span className="flashcard-face flashcard-front">
            <span className="flashcard-side">Question</span>
            <span className="flashcard-text">{card.front}</span>
          </span>
          <span className="flashcard-face flashcard-back">
            <span className="flashcard-side">Answer</span>
            <span className="flashcard-text">{card.back}</span>
          </span>
        </span>
      </button>

      <div className="flashcard-controls">
        <button className="btn btn-secondary" onClick={() => update(move(deck, -1))} aria-label="Previous card">
          Previous
        </button>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => update(markAgain(deck))}>
            Again
          </button>
          <button className="btn btn-primary" onClick={() => update(markGotIt(deck))}>
            Got it
          </button>
        </div>
        <button className="btn btn-secondary" onClick={() => update(move(deck, 1))} aria-label="Next card">
          Next
        </button>
      </div>
      <p className="muted small center">Click the card or press Space to flip. Arrow keys move between cards.</p>
    </div>
  )
}
