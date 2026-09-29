import { useState } from 'react'
import MindTree from '../components/outputs/MindTree'
import { RENDERERS } from '../components/outputs/renderers'
import { FORMAT_GROUPS, formatLabel, groupOf } from '../lib/formats'
import { SAMPLES } from './samples'

// The format selector + a live sample. Uses the app's real renderers (so the quiz can be
// answered and the flashcards flip), except the mind map, which is drawn with CSS here
// so the landing page doesn't have to download mermaid.
const LANDING_RENDERERS = { ...RENDERERS, mind_map: MindTree }

// `live` turns true when the hero highlight has finished; then the first sample appears.
export default function FormatDemo({ live }) {
  const [picked, setPicked] = useState(null)
  const selected = picked ?? (live ? 'quiz' : null)
  const Renderer = selected ? LANDING_RENDERERS[selected] : null
  const group = selected ? groupOf(selected) : null

  return (
    <div className="format-demo">
      <div className="demo-picker" role="radiogroup" aria-label="Study formats">
        {FORMAT_GROUPS.map((g) => (
          <div key={g.id} className="demo-group" style={{ '--goal': g.color }}>
            <h3>
              <span className="goal-dot" aria-hidden="true" />
              {g.label}
            </h3>
            <ul>
              {g.formats.map((f) => (
                <li key={f.name}>
                  <button
                    role="radio"
                    aria-checked={selected === f.name}
                    className={`demo-format ${selected === f.name ? 'is-selected' : ''}`}
                    onClick={() => setPicked(f.name)}
                  >
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* The panel takes the colour of the selected format's group along its top edge */}
      <div className="demo-output" aria-live="polite" style={group ? { '--goal': group.color } : undefined}>
        {Renderer ? (
          <>
            <p className="demo-output-title">
              <span className="goal-dot" aria-hidden="true" />
              {formatLabel(selected)}
              <span className="demo-output-group">{group.label}</span>
            </p>
            <div className="reading">
              {/* key: switching format starts that sample fresh */}
              <Renderer key={selected} output={SAMPLES[selected]} />
            </div>
          </>
        ) : (
          <p className="muted">Pick a format to see it made from this page.</p>
        )}
      </div>
    </div>
  )
}
