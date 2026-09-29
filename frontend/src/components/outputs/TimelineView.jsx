// Vertical timeline: a rule on the left with a tick per event (styled in outputs.css).
export default function TimelineView({ output }) {
  const events = output.events || []

  if (!output.has_dated_events || events.length === 0) {
    return (
      <div className="empty-state">
        <p>These notes don't contain dates or a sequence of events, so there's no timeline to draw.</p>
        <p className="muted small">Timelines work best for history, biographies or step-by-step processes.</p>
      </div>
    )
  }

  return (
    <ol className="timeline">
      {events.map((event, i) => (
        <li key={i} className="timeline-item">
          <span className="timeline-date">{event.date}</span>
          <h4>{event.title}</h4>
          <p>{event.description}</p>
        </li>
      ))}
    </ol>
  )
}
