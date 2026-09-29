// pipeline_name -> component that knows that pipeline's output shape (see docs/API.md).
// Shared by the Studio and the landing page, so the landing samples use the real renderers.
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

export const RENDERERS = {
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
