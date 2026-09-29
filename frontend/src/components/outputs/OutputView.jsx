import { titleCase } from '../../lib/format'
import CompareTableView from './CompareTableView'
import FlashcardsView from './FlashcardsView'
import MindMapView from './MindMapView'
import PodcastView from './PodcastView'
import QuizView from './QuizView'
import {
  ExamNotesView,
  FaqView,
  GlossaryView,
  KeyConceptsView,
  OutlineView,
  PracticeProblemsView,
  SimpleExplanationView,
  StudyGuideView,
  SummaryView,
  TextbookChapterView,
} from './TextViews'
import TimelineView from './TimelineView'

// pipeline_name -> component that knows that pipeline's output shape (see docs/API.md).
const RENDERERS = {
  summary: SummaryView,
  key_concepts: KeyConceptsView,
  faq: FaqView,
  quiz: QuizView,
  flashcards: FlashcardsView,
  exam_notes: ExamNotesView,
  study_guide: StudyGuideView,
  outline: OutlineView,
  mind_map: MindMapView,
  glossary: GlossaryView,
  timeline: TimelineView,
  practice_problems: PracticeProblemsView,
  simple_explanation: SimpleExplanationView,
  compare_contrast: CompareTableView,
  podcast: PodcastView,
  textbook_chapter: TextbookChapterView,
}

export default function OutputView({ generation, title, onClose }) {
  const Renderer = RENDERERS[generation.pipeline_name]
  const output = generation.output || {}

  return (
    <article className="panel glass-card output-view">
      <div className="panel-header">
        <h3>{title || titleCase(generation.pipeline_name)}</h3>
        <button className="icon-btn" aria-label="Close output" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* key = generation id: interactive views (quiz score, flashcard index) reset for a new result */}
      {Renderer ? (
        <Renderer key={generation.id} output={output} />
      ) : (
        <pre className="code-block">{JSON.stringify(output, null, 2)}</pre>
      )}

      <OutputFooter generation={generation} />
    </article>
  )
}

// Small "how was this made" line: model, time, cache, retrieval strategy, chunks used.
function OutputFooter({ generation }) {
  const meta = generation.output?._meta || {}
  return (
    <footer className="output-footer">
      {generation.cached && <span className="badge badge-accent">cached</span>}
      <span className="mono-label">{generation.model}</span>
      <span className="mono-label">{(generation.latency_ms / 1000).toFixed(1)} s</span>
      {Object.entries(meta).map(([key, value]) => (
        <span key={key} className="mono-label muted">
          {key}: {String(value)}
        </span>
      ))}
    </footer>
  )
}
