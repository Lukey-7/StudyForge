import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FormatSample } from '../../landing/FormatDemo'
import PublicPage from '../../landing/PublicPage'
import { NOTES } from '../../landing/samples'
import { FORMAT_GROUPS, READS } from '../../lib/formats'

// All sixteen formats, grouped by goal. Each one says what it makes, how it reads the
// notes, and can show a sample made from the landing page's lecture paragraph.
export default function FormatsPage({ signedIn }) {
  const [open, setOpen] = useState(null) // name of the format whose sample is showing

  return (
    <PublicPage
      signedIn={signedIn}
      wide
      title="The sixteen formats"
      lede="Every format takes the same input, your notes, and makes something different from it. Pick by what you are trying to do. Each one can be tuned by difficulty, length and a focus topic."
    >
      <p className="public-note">
        The samples below were made from this paragraph: “{NOTES.before}
        {NOTES.highlighted}
        {NOTES.after}” ({NOTES.source}, {NOTES.page}).
      </p>

      {FORMAT_GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="formats-group" style={{ '--goal': group.color }}>
          <header className="formats-group-head">
            <h2>
              <span className="goal-dot" aria-hidden="true" />
              {group.label}
            </h2>
            <p>{group.blurb}</p>
          </header>
          <ul className="formats-list">
            {group.formats.map((f) => {
              const showing = open === f.name
              return (
                <li key={f.name} id={f.name} className={`formats-item ${showing ? 'is-open' : ''}`}>
                  <div className="formats-item-text">
                    <h3>{f.label}</h3>
                    <p>{f.description}</p>
                    <p className="formats-reads">{READS[f.reads]}</p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    aria-expanded={showing}
                    aria-controls={`sample-${f.name}`}
                    onClick={() => setOpen(showing ? null : f.name)}
                  >
                    {showing ? 'Hide sample' : 'Show a sample'}
                  </button>
                  {showing && (
                    <div id={`sample-${f.name}`} className="formats-sample demo-output">
                      <FormatSample name={f.name} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <p className="public-next">
        <Link to="/how-it-works">How your notes become these</Link>
      </p>
    </PublicPage>
  )
}
