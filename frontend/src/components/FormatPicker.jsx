import { useState } from 'react'
import { FORMAT_GROUPS } from '../lib/formats'

// The 16 formats grouped by goal, with a filter box. Works as a radio group:
// one format is selected, and the selected one gets the highlighter.
// `pipelines` (GET /pipelines) provides the one-line descriptions.
export default function FormatPicker({ pipelines, selected, onSelect, disabled }) {
  const [filter, setFilter] = useState('')
  const describe = (name) => pipelines?.find((p) => p.name === name)?.description || ''

  const query = filter.trim().toLowerCase()
  const matches = (f) => !query || f.label.toLowerCase().includes(query) || describe(f.name).toLowerCase().includes(query)
  const groups = FORMAT_GROUPS.map((g) => ({ ...g, formats: g.formats.filter(matches) })).filter((g) => g.formats.length)

  return (
    <div className="format-picker">
      <input
        className="input"
        type="search"
        placeholder="Filter formats, e.g. exam"
        aria-label="Filter formats"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {groups.length === 0 && <p className="muted small">No format matches “{filter}”.</p>}

      {groups.map((group) => (
        <fieldset key={group.id} className="format-group" disabled={disabled}>
          <legend>{group.label}</legend>
          {group.formats.map((f) => (
            <label key={f.name} className={`format-option ${selected === f.name ? 'is-selected' : ''}`}>
              {/* a real (visually hidden) radio input gives arrow-key navigation for free */}
              <input
                type="radio"
                name="format"
                className="visually-hidden"
                value={f.name}
                aria-label={f.label}
                aria-describedby={`format-desc-${f.name}`}
                checked={selected === f.name}
                onChange={() => onSelect(f.name)}
              />
              <span className="format-name">{f.label}</span>
              <span className="format-desc" id={`format-desc-${f.name}`}>
                {describe(f.name)}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  )
}
