import { useState } from 'react'

// One card at a time; click to flip (CSS 3D rotateY in app.css), prev/next to move.
export default function FlashcardsView({ output }) {
  const cards = output.cards || []
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (cards.length === 0) return <p className="muted">No cards.</p>
  const card = cards[index]

  function go(delta) {
    setFlipped(false) // always show the front of the next card
    setIndex((index + delta + cards.length) % cards.length)
  }

  return (
    <div className="flashcards">
      <button
        className={`flashcard ${flipped ? 'flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
        aria-label={flipped ? 'Show question' : 'Show answer'}
      >
        <div className="flashcard-inner">
          <div className="flashcard-face flashcard-front">
            <span className="mono-label muted">Question</span>
            <p>{card.front}</p>
          </div>
          <div className="flashcard-face flashcard-back">
            <span className="mono-label muted">Answer</span>
            <p>{card.back}</p>
          </div>
        </div>
      </button>

      <div className="flashcard-nav">
        <button className="btn btn-secondary btn-sm" onClick={() => go(-1)}>
          ← Prev
        </button>
        <span className="mono-label">
          {index + 1} / {cards.length}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => go(1)}>
          Next →
        </button>
      </div>
      <p className="muted small center">Click the card to flip it.</p>
    </div>
  )
}
