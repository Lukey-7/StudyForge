import { Link } from 'react-router-dom'
import PublicPage from '../../landing/PublicPage'

// What happens to a document between "upload" and "an answer that cites page 3", in plain words.
// This is a real sequence, so the stages are numbered.
export default function HowItWorksPage({ signedIn }) {
  return (
    <PublicPage
      signedIn={signedIn}
      title="How it works"
      lede="StudyForge never answers from general knowledge. Everything it writes is built from passages of your own notes, and it shows you which ones."
    >
      <ol className="stages">
        <li id="upload">
          <h2>Your file is read</h2>
          <p>
            PDFs are read page by page, so every passage keeps its page number. Word documents keep their headings.
            Photos of slides and scanned pages are read by Gemini's vision model, and lecture recordings are
            transcribed. The original file is kept in your account's storage.
          </p>
        </li>
        <li id="chunks">
          <h2>It is split into passages</h2>
          <p>
            The text is cut into passages of roughly a paragraph or two (about 600 words' worth of tokens), breaking at
            headings and paragraphs rather than mid-sentence. Neighbouring passages overlap a little, so a fact that
            sits on a boundary is never lost. Each passage remembers its page and its section heading.
          </p>
        </li>
        <li id="index">
          <h2>Each passage is indexed twice</h2>
          <p>
            Once by <strong>meaning</strong>: Gemini turns each passage into an embedding, a list of numbers that
            captures what it is about, stored in ChromaDB. And once by <strong>words</strong>: a keyword index that is
            good at exact terms, acronyms and names. Before embedding, each passage is prefixed with its document and
            section, so a passage that only says “it has logarithmic lookups” still knows it is about indexes.
          </p>
        </li>
        <li id="search">
          <h2>Your question finds the right passages</h2>
          <p>
            Both indexes are searched and their rankings are merged, so a question phrased in your own words and a
            question using the lecture's exact terms both work. Near-duplicate passages are dropped, and a last pass
            asks Gemini to order the best candidates by how useful they are. Only passages from the notebook you are
            in are ever considered.
          </p>
        </li>
        <li id="generate">
          <h2>The format is written from those passages</h2>
          <p>
            Formats like a summary or a mind map read the whole notebook. Formats like a quiz or flashcards use the
            passages most relevant to your focus topic. Gemini is asked for a strictly structured answer (a quiz is a
            list of questions with options and one correct index), which is checked before it reaches you; if it does
            not fit, it is asked once more with the exact problem pointed out. Results are cached, so opening the same
            format again is instant until your notes change.
          </p>
        </li>
        <li id="citations">
          <h2>Answers cite their page</h2>
          <p>
            In chat, the passages found for your question are labelled S1, S2 and so on and handed to Gemini with one
            rule: use only these, and mark every factual sentence with the label it came from. If the answer is not in
            your notes, it says so instead of guessing. Each mark you see is a real passage; click it and the source
            opens at that spot, highlighted. Follow-up questions (“what about its downsides?”) are first rewritten into
            standalone ones so the search knows what “its” refers to.
          </p>
        </li>
      </ol>

      <section className="public-section">
        <h2>Measured, not assumed</h2>
        <p>
          The search step is tested against a set of 33 labelled questions over three documents, so changes to it are
          judged by numbers. The results, and everything else about the engineering, are on the{' '}
          <Link to="/about">about page</Link>.
        </p>
      </section>

      <p className="public-next">
        <Link to="/formats">See all sixteen formats</Link>
      </p>
    </PublicPage>
  )
}
