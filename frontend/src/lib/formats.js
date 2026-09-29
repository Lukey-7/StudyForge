// The 16 study formats, grouped by what the student is trying to do.
// The backend (GET /pipelines) owns the names; this file adds friendly sentence-case labels,
// the grouping, a one-line description and how the format reads the notes (its retrieval
// strategy, in plain words). Used by the landing page, the Formats page and the Studio,
// so they always match.

// How a format reads the notebook (mirrors the backend's three retrieval strategies).
export const READS = {
  whole: 'Reads the whole notebook',
  topic: 'Finds the passages most relevant to your topic',
  each: 'Works through each document in turn',
}

// `color` is the CSS variable for the group's colour (see tokens.css), applied as `--goal`
// on the group element so its dot and stroke pick it up.
export const FORMAT_GROUPS = [
  {
    id: 'understand',
    label: 'Understand',
    color: 'var(--goal-understand)',
    blurb: 'Get the shape of a topic before you go deep.',
    formats: [
      { name: 'summary', label: 'Summary', description: 'A structured summary with the key points.', reads: 'whole' },
      {
        name: 'simple_explanation',
        label: 'Simple explanation',
        description: 'The idea explained as if you were new to it, starting from an everyday analogy.',
        reads: 'topic',
      },
      {
        name: 'key_concepts',
        label: 'Key concepts',
        description: 'The core concepts with a definition, why each matters, and an example.',
        reads: 'topic',
      },
      { name: 'glossary', label: 'Glossary', description: 'An alphabetical list of terms and definitions.', reads: 'topic' },
      {
        name: 'outline',
        label: 'Outline',
        description: 'A table of contents of the material, in the order it is presented.',
        reads: 'whole',
      },
      { name: 'mind_map', label: 'Mind map', description: 'The main ideas as a branching map.', reads: 'whole' },
    ],
  },
  {
    id: 'practise',
    label: 'Practise',
    color: 'var(--goal-practise)',
    blurb: 'Test yourself instead of re-reading.',
    formats: [
      {
        name: 'quiz',
        label: 'Quiz',
        description: 'Multiple-choice questions with the answer and an explanation for each.',
        reads: 'topic',
      },
      {
        name: 'flashcards',
        label: 'Flashcards',
        description: 'Front-and-back cards you can rate as you go, and export to Anki.',
        reads: 'topic',
      },
      {
        name: 'practice_problems',
        label: 'Practice problems',
        description: 'Problems to work through, each with a step-by-step solution.',
        reads: 'topic',
      },
      { name: 'faq', label: 'FAQ', description: 'The questions an exam is likely to ask, with model answers.', reads: 'topic' },
    ],
  },
  {
    id: 'revise',
    label: 'Revise',
    color: 'var(--goal-revise)',
    blurb: 'Compress a topic for the days before an exam.',
    formats: [
      {
        name: 'exam_notes',
        label: 'Exam notes',
        description: 'Ultra-compressed bullet notes for last-minute revision, ending with likely exam questions.',
        reads: 'whole',
      },
      {
        name: 'study_guide',
        label: 'Study guide',
        description: 'Learning objectives, guided sections and check-yourself questions.',
        reads: 'whole',
      },
      {
        name: 'compare_contrast',
        label: 'Compare & contrast',
        description: 'A table comparing related concepts across the aspects that matter.',
        reads: 'topic',
      },
      {
        name: 'timeline',
        label: 'Timeline',
        description: 'Dated events in order, when the material has any. Never invents dates.',
        reads: 'whole',
      },
    ],
  },
  {
    id: 'listen',
    label: 'Read & listen',
    color: 'var(--goal-listen)',
    blurb: 'Longer forms for when you have time.',
    formats: [
      {
        name: 'podcast',
        label: 'Podcast script',
        description: 'A dialogue between a curious host and an expert that teaches the material.',
        reads: 'each',
      },
      {
        name: 'textbook_chapter',
        label: 'Textbook chapter',
        description: 'All your documents compiled into one coherent chapter with review questions.',
        reads: 'each',
      },
    ],
  },
]

// Flat lookups.
const ALL = FORMAT_GROUPS.flatMap((g) => g.formats.map((f) => ({ ...f, group: g })))
const BY_NAME = Object.fromEntries(ALL.map((f) => [f.name, f]))

// "key_concepts" -> "Key concepts". Falls back to a readable version of an unknown name.
export function formatLabel(name) {
  if (BY_NAME[name]) return BY_NAME[name].label
  const words = String(name).replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Lower-case noun used inside sentences: "Generate flashcards", "writing flashcards".
export function formatNoun(name) {
  if (name === 'faq') return 'FAQ'
  return formatLabel(name).toLowerCase()
}

// The group a format belongs to (for its colour), or undefined for an unknown name.
export function groupOf(name) {
  return BY_NAME[name]?.group
}
