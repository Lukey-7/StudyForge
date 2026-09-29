// Vertical timeline: a line on the left with a dot per event (styled in app.css).
export default function TimelineView({ output }) {
  const events = output.events || []

  if (!output.has_dated_events || events.length === 0) {
    return (
      <div className="empty-state">
        <p>Your sources don’t seem to contain dates or a sequence of events, so there’s no timeline to draw.</p>
        <p className="muted small">Try a history text, a biography or a process description.</p>
      </div>
    )
  }

  return (
    <ol className="timeline">
      {events.map((event, i) => (
        <li key={i} className="timeline-item">
          <span className="timeline-date mono-label">{event.date}</span>
          <h4>{event.title}</h4>
          <p className="muted">{event.description}</p>
        </li>
      ))}
    </ol>
  )
}
