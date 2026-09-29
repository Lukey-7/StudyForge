// Pure logic for the flashcard study session (no React), so it is easy to test.
//
// A deck is { queue, learned, pos }:
//   queue   - card indexes still to learn, in the order they will be shown
//   learned - card indexes the student marked "Got it"
//   pos     - which queue entry is on screen
// Functions return a NEW deck instead of changing the old one (React state must not be mutated).

export function createDeck(cardCount, learned = []) {
  const known = new Set(learned.filter((i) => i >= 0 && i < cardCount))
  const queue = []
  for (let i = 0; i < cardCount; i++) if (!known.has(i)) queue.push(i)
  return { queue, learned: [...known], pos: 0 }
}

// The card index on screen, or null when everything is learned.
export function currentCard(deck) {
  return deck.queue.length ? deck.queue[deck.pos] : null
}

// "Got it": the card leaves the queue for good. pos now points at the next card.
export function markGotIt(deck) {
  const card = currentCard(deck)
  if (card === null) return deck
  const queue = deck.queue.filter((_, i) => i !== deck.pos)
  return { queue, learned: [...deck.learned, card], pos: clampPos(deck.pos, queue.length) }
}

// "Again": the card goes to the back of the queue so it comes round once more.
export function markAgain(deck) {
  const card = currentCard(deck)
  if (card === null || deck.queue.length === 1) return deck
  const queue = deck.queue.filter((_, i) => i !== deck.pos)
  queue.push(card)
  return { ...deck, queue, pos: clampPos(deck.pos, queue.length) }
}

// ←/→ browse the remaining cards without rating them (wraps around).
export function move(deck, delta) {
  if (!deck.queue.length) return deck
  const n = deck.queue.length
  return { ...deck, pos: (deck.pos + delta + n) % n }
}

// When the last card of the queue is removed, go back to the start instead of falling off the end.
function clampPos(pos, length) {
  return pos < length ? pos : 0
}
