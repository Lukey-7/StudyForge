// The 16 study formats, grouped by what the student is trying to do.
// The backend (GET /pipelines) owns the names and descriptions; this file only adds
// friendly sentence-case labels and the grouping, which are a UI decision.
// Used by both the landing page and the Studio, so they always match.

// `color` is the CSS variable for the group's colour (see tokens.css), applied as `--goal`
// on the group element so its dot and stroke pick it up.
export const FORMAT_GROUPS = [
  {
    id: 'understand',
    label: 'Understand',
    color: 'var(--goal-understand)',
    formats: [
      { name: 'summary', label: 'Summary' },
      { name: 'simple_explanation', label: 'Simple explanation' },
      { name: 'key_concepts', label: 'Key concepts' },
      { name: 'glossary', label: 'Glossary' },
      { name: 'outline', label: 'Outline' },
      { name: 'mind_map', label: 'Mind map' },
    ],
  },
  {
    id: 'practise',
    label: 'Practise',
    color: 'var(--goal-practise)',
    formats: [
      { name: 'quiz', label: 'Quiz' },
      { name: 'flashcards', label: 'Flashcards' },
      { name: 'practice_problems', label: 'Practice problems' },
      { name: 'faq', label: 'FAQ' },
    ],
  },
  {
    id: 'revise',
    label: 'Revise',
    color: 'var(--goal-revise)',
    formats: [
      { name: 'exam_notes', label: 'Exam notes' },
      { name: 'study_guide', label: 'Study guide' },
      { name: 'compare_contrast', label: 'Compare & contrast' },
      { name: 'timeline', label: 'Timeline' },
    ],
  },
  {
    id: 'listen',
    label: 'Read & listen',
    color: 'var(--goal-listen)',
    formats: [
      { name: 'podcast', label: 'Podcast script' },
      { name: 'textbook_chapter', label: 'Textbook chapter' },
    ],
  },
]

// Flat lookup: name -> label.
const LABELS = Object.fromEntries(FORMAT_GROUPS.flatMap((g) => g.formats.map((f) => [f.name, f.label])))
const GROUP_OF = Object.fromEntries(FORMAT_GROUPS.flatMap((g) => g.formats.map((f) => [f.name, g])))

// The group a format belongs to (for its colour), or undefined for an unknown name.
export function groupOf(name) {
  return GROUP_OF[name]
}

// "key_concepts" -> "Key concepts". Falls back to a readable version of an unknown name.
export function formatLabel(name) {
  if (LABELS[name]) return LABELS[name]
  const words = String(name).replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Lower-case noun used inside sentences: "Generate flashcards", "writing flashcards".
export function formatNoun(name) {
  if (name === 'faq') return 'FAQ'
  return formatLabel(name).toLowerCase()
}
