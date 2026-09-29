// Which sentences of a cited passage actually back up the answer?
//
// The backend cites whole passages (S1 = one chunk of ~600 tokens). Highlighting all of it
// says "somewhere in here"; highlighting the one sentence the claim came from says "here".
// We find it the simple, explainable way: word overlap between each claim in the answer
// that carries the citation mark and each sentence of the passage. If nothing overlaps
// clearly, we highlight nothing and let the margin bar mark the passage as a whole.

const STOPWORDS = new Set(
  `the a an and or but if then than that this these those there their they them it its is are was were be
   been being of in on at to for from by with as into over under about which who whom what when where why
   how can could would should will may might must do does did not no only also such some any each every
   more most other same so very just based provided context according`.split(/\s+/),
)

// Minimum share of a claim's content words that must appear in a sentence to count as support.
const MIN_OVERLAP = 0.35
const MIN_SHARED_WORDS = 3

export function contentWords(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ') // drop [S1] marks
      .match(/[a-z0-9']+/g)
      ?.map((w) => w.replace(/'s$/, ''))
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)) ?? [],
  )
}

// "One. Two? Three!" -> ["One.", "Two?", "Three!"]. Keeps abbreviation-free prose happy,
// which is what lecture notes mostly are.
// Blank lines (paragraph breaks) always end a sentence, so a heading without a full stop
// never fuses with the sentence after it.
export function splitSentences(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map((s) => s.trim())
    .filter(Boolean)
}

// The sentences of the answer that carry this citation label, with the marks stripped.
export function claimsFor(answer, label) {
  const mark = new RegExp(`\\[\\s*(?:S\\d+\\s*,\\s*)*${label}(?:\\s*,\\s*S\\d+)*\\s*\\]`)
  return splitSentences(answer).filter((s) => mark.test(s))
}

// Returns the set of passage sentences (exact strings from splitSentences) that best support
// the claims: for each claim, the single best-overlapping sentence, if it overlaps enough.
export function supportingSentences(passageText, claims) {
  const sentences = splitSentences(passageText)
  const words = sentences.map(contentWords)
  const picked = new Set()
  for (const claim of claims || []) {
    const claimWords = contentWords(claim)
    if (claimWords.size === 0) continue
    let best = -1
    let bestScore = 0
    words.forEach((sentenceWords, i) => {
      let shared = 0
      for (const w of claimWords) if (sentenceWords.has(w)) shared += 1
      const score = shared / claimWords.size
      if (shared >= MIN_SHARED_WORDS && score > bestScore) {
        best = i
        bestScore = score
      }
    })
    if (best >= 0 && bestScore >= MIN_OVERLAP) picked.add(sentences[best])
  }
  return picked
}
