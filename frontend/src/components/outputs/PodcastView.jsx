// Podcast script shown as chat bubbles; the first speaker on the left, others on the right.
export default function PodcastView({ output }) {
  const speakers = output.speakers || []
  const lines = output.lines || []

  return (
    <div className="stack">
      {output.title && <h3>{output.title}</h3>}
      <p className="muted small">Speakers: {speakers.join(', ')}</p>
      <div className="podcast">
        {lines.map((line, i) => {
          const side = line.speaker === speakers[0] ? 'left' : 'right'
          return (
            <div key={i} className={`bubble-row ${side}`}>
              <div className={`bubble ${side === 'left' ? 'bubble-other' : 'bubble-accent'}`}>
                <span className="mono-label">{line.speaker}</span>
                <p>{line.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
