import { Link } from 'react-router-dom'
import PublicPage from '../../landing/PublicPage'

// Plain answers to "where do my notes go". Everything stated here is what the code does;
// change this page if the code changes.
export default function PrivacyPage({ signedIn }) {
  return (
    <PublicPage
      signedIn={signedIn}
      title="Your notes and privacy"
      lede="Short version: your notes stay in your account, passages of them are sent to Google's Gemini API to write answers, and nothing is shared with other users."
    >
      <section className="public-section">
        <h2>Where your notes are stored</h2>
        <p>
          The original files you upload are kept in file storage attached to your account. The text extracted from
          them, the passages it is split into, everything generated from them and your chat history are kept in a
          Postgres database. Both are hosted on Supabase. The database is set up so that each row belongs to one
          user and cannot be read by another, even by someone querying the database directly with their own login.
        </p>
      </section>

      <section className="public-section">
        <h2>What is sent to Google</h2>
        <p>
          To make a format or answer a question, the relevant passages of your notes are sent to Google's Gemini API
          together with the instructions, and the text of each passage is sent to Gemini's embedding model once, when
          the document is processed. Photos and scanned pages are sent to be read, and recordings to be transcribed.
          Google's terms for the Gemini API apply to that data. If an OpenAI key is configured as a fallback, the same
          passages may be sent to OpenAI when Gemini is unavailable.
        </p>
      </section>

      <section className="public-section">
        <h2>What is not done</h2>
        <p>
          Your notes are not used to train anything. They are not shared with other users; a notebook is visible only
          to the account that made it. There is no advertising and no analytics script in the interface.
        </p>
      </section>

      <section className="public-section">
        <h2>Deleting things</h2>
        <p>
          Deleting a document removes its file, its passages and its vectors. Deleting a notebook removes everything in
          it, including generated formats and chat history. Deleting your account (from your Supabase-backed sign-in)
          removes all of your notebooks with it.
        </p>
      </section>

      <section className="public-section">
        <h2>Running your own copy</h2>
        <p>
          StudyForge is open source. If you would rather keep everything on infrastructure you control, the{' '}
          <Link to="/about">about page</Link> and the repository explain how it is put together and how to run it.
        </p>
      </section>
    </PublicPage>
  )
}
