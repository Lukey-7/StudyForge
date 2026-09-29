// Podcast script laid out like a play script: speaker name in the margin, their line beside it.
export default function PodcastView({ output }) {
  const speakers = output.speakers || []
  const lines = output.lines || []

  return (
    <div className="stack">
      {output.title && <h3>{output.title}</h3>}
      <dl className="script">
        {lines.map((line, i) => (
          // data-speaker = position in the speakers list, so each voice gets its own colour in CSS
          <div key={i} className="script-line" data-speaker={Math.max(0, speakers.indexOf(line.speaker)) % 2}>
            <dt>{line.speaker}</dt>
            <dd>{line.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
