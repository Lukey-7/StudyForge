// Turns a generation's `output` (shapes in docs/API.md) into Markdown the student can
// paste into their own notes app, plus a CSV of flashcards that Anki can import.
// Pure functions: no React, no DOM, so they are unit-tested in exportMarkdown.test.js.
import { formatLabel } from './formats'

const list = (items) => (items || []).map((item) => `- ${item}`).join('\n')
const numbered = (items) => (items || []).map((item, i) => `${i + 1}. ${item}`).join('\n')

// Table cells can't contain "|" or line breaks in Markdown.
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')

// One small function per output shape. Each returns an array of blocks (joined by blank lines).
const WRITERS = {
  summary: (o) => [o.title && `## ${o.title}`, ...(o.summary_paragraphs || []), '### Key points', list(o.key_points)],

  simple_explanation: (o) => [
    o.title && `## ${o.title}`,
    o.analogy && `> ${o.analogy}`,
    ...(o.explanation_paragraphs || []),
    '### Key takeaways',
    list(o.key_takeaways),
  ],

  key_concepts: (o) =>
    (o.concepts || []).map(
      (c) => `### ${c.name}\n\n${c.definition}\n\n**Why it matters:** ${c.why_it_matters}\n\n**Example:** ${c.example}`,
    ),

  glossary: (o) =>
    [...(o.terms || [])].sort((a, b) => a.term.localeCompare(b.term)).map((t) => `**${t.term}**: ${t.definition}`),

  // level 1-3 becomes 0-4 spaces of indentation, which Markdown reads as nesting.
  outline: (o) => [
    o.title && `## ${o.title}`,
    (o.items || [])
      .map((item) => {
        const indent = '  '.repeat(Math.max(0, (item.level || 1) - 1))
        return `${indent}- **${item.title}**${item.summary ? `: ${item.summary}` : ''}`
      })
      .join('\n'),
  ],

  mind_map: (o) => [
    `## ${o.root || 'Mind map'}`,
    (o.branches || []).map((b) => `- ${b.label}\n${(b.children || []).map((c) => `  - ${c}`).join('\n')}`).join('\n'),
    o.mermaid && '```mermaid\n' + o.mermaid + '\n```',
  ],

  quiz: (o) =>
    (o.questions || []).map((q, i) => {
      const options = (q.options || []).map((opt, oi) => `- ${String.fromCharCode(65 + oi)}. ${opt}`).join('\n')
      const answer = `${String.fromCharCode(65 + q.correct_index)}. ${q.options?.[q.correct_index] ?? ''}`
      return `### ${i + 1}. ${q.question}\n\n${options}\n\n**Answer:** ${answer}\n\n${q.explanation || ''}`.trim()
    }),

  flashcards: (o) => (o.cards || []).map((c) => `**Q:** ${c.front}\n\n**A:** ${c.back}`),

  practice_problems: (o) =>
    (o.problems || []).map(
      (p, i) =>
        `### Problem ${i + 1} (${p.difficulty})\n\n${p.problem}\n\n**Solution**\n\n${numbered(p.solution_steps)}\n\n**Answer:** ${p.final_answer}`,
    ),

  faq: (o) => (o.items || []).map((item) => `### ${item.question}\n\n${item.answer}`),

  exam_notes: (o) => [
    ...(o.sections || []).map((s) => `### ${s.heading}\n\n${list(s.bullets)}`),
    o.likely_exam_questions?.length && `### Likely exam questions\n\n${numbered(o.likely_exam_questions)}`,
  ],

  study_guide: (o) => [
    `### Learning objectives\n\n${list(o.learning_objectives)}`,
    ...(o.sections || []).map((s) => {
      const check = s.check_yourself?.length ? `\n\n**Check yourself**\n\n${list(s.check_yourself)}` : ''
      return `### ${s.title}\n\n${s.content || ''}${check}`
    }),
    `### Key takeaways\n\n${list(o.key_takeaways)}`,
  ],

  compare_contrast: (o) => {
    const concepts = o.concepts || []
    const header = `| Aspect | ${concepts.map(cell).join(' | ')} |`
    const divider = `| --- | ${concepts.map(() => '---').join(' | ')} |`
    const rows = (o.rows || []).map((r) => `| ${cell(r.aspect)} | ${concepts.map((_, i) => cell(r.values?.[i])).join(' | ')} |`)
    return [[header, divider, ...rows].join('\n'), o.summary]
  },

  timeline: (o) =>
    o.has_dated_events === false || !o.events?.length
      ? ['_No dated events were found in these notes._']
      : [(o.events || []).map((e) => `- **${e.date}**: ${e.title}. ${e.description}`).join('\n')],

  podcast: (o) => [o.title && `## ${o.title}`, ...(o.lines || []).map((l) => `**${l.speaker}:** ${l.text}`)],

  textbook_chapter: (o) => [
    o.title && `## ${o.title}`,
    o.introduction,
    ...(o.sections || []).map((s) => `### ${s.heading}\n\n${s.content_markdown}`),
    o.summary && `### Summary\n\n${o.summary}`,
    o.review_questions?.length && `### Review questions\n\n${numbered(o.review_questions)}`,
  ],
}

// Whole document: a heading with the format's name, then that format's blocks.
export function toMarkdown(pipelineName, output = {}) {
  const writer = WRITERS[pipelineName]
  const body = writer ? writer(output) : ['```json\n' + JSON.stringify(output, null, 2) + '\n```']
  const blocks = [`# ${formatLabel(pipelineName)}`, ...body].filter(Boolean) // drop empty/false blocks
  return blocks.join('\n\n') + '\n'
}

// CSV field: always quoted, and quotes inside are doubled ("" is how CSV escapes a quote).
// Quoting also keeps commas and line breaks inside one field.
export function csvField(text) {
  return `"${String(text ?? '').replace(/"/g, '""')}"`
}

// Two columns, front and back, one card per line. No header row: Anki would import it as a card.
export function flashcardsToCsv(cards = []) {
  return cards.map((c) => `${csvField(c.front)},${csvField(c.back)}`).join('\r\n') + '\r\n'
}

// "quiz" + ISO date -> "studyforge-quiz-2026-09-29.md"
export function exportFileName(pipelineName, createdAt, extension) {
  const date = (createdAt || new Date().toISOString()).slice(0, 10)
  return `studyforge-${pipelineName.replace(/_/g, '-')}-${date}.${extension}`
}
