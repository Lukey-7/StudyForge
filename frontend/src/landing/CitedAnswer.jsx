import { useState } from 'react'
import { CITED_ANSWER } from './samples'

// A static chat excerpt. Hovering, focusing or clicking a citation mark shows the passage
// it came from as a note in the margin (below the answer on narrow screens).
export default function CitedAnswer() {
  const [active, setActive] = useState('S1')
  const citation = CITED_ANSWER.citations[active]

  return (
    <div className="cited">
      <div className="cited-chat">
        <p className="msg msg-user">{CITED_ANSWER.question}</p>
        <p className="msg msg-answer reading">
          {CITED_ANSWER.parts.map((part, i) =>
            typeof part === 'string' ? (
              part
            ) : (
              <button
                key={i}
                className={`cite-mark ${active === part.cite ? 'is-active' : ''}`}
                aria-pressed={active === part.cite}
                aria-label={`Source ${part.cite}`}
                onMouseEnter={() => setActive(part.cite)}
                onFocus={() => setActive(part.cite)}
                onClick={() => setActive(part.cite)}
              >
                {part.cite}
              </button>
            ),
          )}
        </p>
      </div>

      <aside className="margin-note cited-note" aria-live="polite">
        <p className="margin-note-title">
          {active}: {citation.source}, p. {citation.page}
        </p>
        <p className="reading">
          <span className="swipe is-static">{citation.snippet}</span>
        </p>
      </aside>
    </div>
  )
}
