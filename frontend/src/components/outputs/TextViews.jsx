// Renderers for the "read-only" pipelines. Each takes the pipeline's `output` object
// (shapes documented in docs/API.md) and lays it out. `|| []` guards keep a slightly
// malformed output from crashing the page.
import Markdown from '../Markdown'

function BulletList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="bullets">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function Section({ title, children }) {
  return (
    <section className="output-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

export function SummaryView({ output }) {
  return (
    <div className="stack">
      {output.title && <h3>{output.title}</h3>}
      {(output.summary_paragraphs || []).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <Section title="Key points">
        <BulletList items={output.key_points} />
      </Section>
    </div>
  )
}

export function KeyConceptsView({ output }) {
  return (
    <div className="concept-grid">
      {(output.concepts || []).map((c, i) => (
        <div key={i} className="concept-card">
          <h4>{c.name}</h4>
          <p>{c.definition}</p>
          <p className="small">
            <span className="mono-label text-accent">Why it matters</span> {c.why_it_matters}
          </p>
          <p className="small muted">
            <span className="mono-label">Example</span> {c.example}
          </p>
        </div>
      ))}
    </div>
  )
}

// <details>/<summary> is a native accordion: no state needed.
export function FaqView({ output }) {
  return (
    <div className="accordion">
      {(output.items || []).map((item, i) => (
        <details key={i} className="accordion-item">
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

export function ExamNotesView({ output }) {
  return (
    <div className="stack">
      {(output.sections || []).map((s, i) => (
        <Section key={i} title={s.heading}>
          <BulletList items={s.bullets} />
        </Section>
      ))}
      {output.likely_exam_questions?.length > 0 && (
        <Section title="Likely exam questions">
          <ol className="bullets">
            {output.likely_exam_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}

export function StudyGuideView({ output }) {
  return (
    <div className="stack">
      <Section title="Learning objectives">
        <BulletList items={output.learning_objectives} />
      </Section>
      {(output.sections || []).map((s, i) => (
        <Section key={i} title={s.title}>
          <Markdown>{s.content}</Markdown>
          {s.check_yourself?.length > 0 && (
            <div className="callout">
              <span className="mono-label text-accent">Check yourself</span>
              <BulletList items={s.check_yourself} />
            </div>
          )}
        </Section>
      ))}
      <Section title="Key takeaways">
        <BulletList items={output.key_takeaways} />
      </Section>
    </div>
  )
}

// level 1-3 -> indentation via a CSS class
export function OutlineView({ output }) {
  return (
    <div className="stack">
      {output.title && <h3>{output.title}</h3>}
      <ul className="outline">
        {(output.items || []).map((item, i) => (
          <li key={i} className={`outline-item level-${item.level}`}>
            <strong>{item.title}</strong>
            {item.summary && <span className="muted small"> — {item.summary}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GlossaryView({ output }) {
  // Alphabetical is what people expect from a glossary.
  const terms = [...(output.terms || [])].sort((a, b) => a.term.localeCompare(b.term))
  return (
    <dl className="glossary">
      {terms.map((t, i) => (
        <div key={i} className="glossary-row">
          <dt>{t.term}</dt>
          <dd>{t.definition}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PracticeProblemsView({ output }) {
  return (
    <div className="stack">
      {(output.problems || []).map((p, i) => (
        <div key={i} className="problem">
          <div className="problem-header">
            <strong>Problem {i + 1}</strong>
            <span className="badge">{p.difficulty}</span>
          </div>
          <p>{p.problem}</p>
          <details className="accordion-item">
            <summary>Show worked solution</summary>
            <ol className="bullets">
              {(p.solution_steps || []).map((step, si) => (
                <li key={si}>{step}</li>
              ))}
            </ol>
            <p>
              <span className="mono-label text-green">Answer</span> {p.final_answer}
            </p>
          </details>
        </div>
      ))}
    </div>
  )
}

export function SimpleExplanationView({ output }) {
  return (
    <div className="stack">
      {output.title && <h3>{output.title}</h3>}
      {output.analogy && (
        <div className="callout">
          <span className="mono-label text-accent">Think of it like…</span>
          <p>{output.analogy}</p>
        </div>
      )}
      {(output.explanation_paragraphs || []).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <Section title="Key takeaways">
        <BulletList items={output.key_takeaways} />
      </Section>
    </div>
  )
}

export function TextbookChapterView({ output }) {
  return (
    <div className="stack chapter">
      {output.title && <h3>{output.title}</h3>}
      <Markdown>{output.introduction}</Markdown>
      {(output.sections || []).map((s, i) => (
        <Section key={i} title={s.heading}>
          <Markdown>{s.content_markdown}</Markdown>
        </Section>
      ))}
      {output.summary && (
        <Section title="Summary">
          <Markdown>{output.summary}</Markdown>
        </Section>
      )}
      {output.review_questions?.length > 0 && (
        <Section title="Review questions">
          <ol className="bullets">
            {output.review_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  )
}
