import { exportFileName, flashcardsToCsv, toMarkdown } from '../../lib/exportMarkdown'
import { formatLabel } from '../../lib/formats'
import { useToast } from '../Toast'
import { RENDERERS } from './renderers'

// One generated output: toolbar (copy / download / Anki), the format's renderer, and a
// "how it was made" line.
export default function OutputView({ generation, onClose }) {
  const toast = useToast()
  const Renderer = RENDERERS[generation.pipeline_name]
  const output = generation.output || {}
  const name = generation.pipeline_name

  async function copyMarkdown() {
    if (await copyText(toMarkdown(name, output))) toast('Copied as Markdown')
    else toast("Couldn't copy: your browser blocked the clipboard. Use Download .md instead.", 'error')
  }

  function downloadMarkdown() {
    downloadText(toMarkdown(name, output), exportFileName(name, generation.created_at, 'md'), 'text/markdown')
    toast('Downloaded Markdown file')
  }

  function downloadAnki() {
    downloadText(flashcardsToCsv(output.cards), exportFileName(name, generation.created_at, 'csv'), 'text/csv')
    toast('Downloaded CSV. In Anki choose File, Import.')
  }

  return (
    <article className="panel output-view">
      <header className="output-header">
        <h2>{formatLabel(name)}</h2>
        <div className="output-toolbar">
          <button className="btn btn-quiet" onClick={copyMarkdown}>
            Copy as Markdown
          </button>
          <button className="btn btn-quiet" onClick={downloadMarkdown}>
            Download .md
          </button>
          {name === 'flashcards' && (
            <button className="btn btn-quiet" onClick={downloadAnki}>
              Export for Anki (.csv)
            </button>
          )}
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      {/* key = generation id: interactive views (quiz score, flashcard deck) reset for a new result */}
      <div className="reading output-body">
        {Renderer ? (
          <Renderer key={generation.id} output={output} generationId={generation.id} />
        ) : (
          <pre className="code-block">{JSON.stringify(output, null, 2)}</pre>
        )}
      </div>

      <OutputFooter generation={generation} />
    </article>
  )
}

// A sentence about how this was made, instead of a row of badges.
function OutputFooter({ generation }) {
  const meta = generation.output?._meta || {}
  const seconds = (generation.latency_ms / 1000).toFixed(1)
  const from = meta.chunks_used ? ` from ${meta.chunks_used} passages of your notes` : ''
  const text = generation.cached
    ? `Saved copy from earlier${from}. Tick “Make a fresh version” to write a new one.`
    : `Written by ${generation.model} in ${seconds} s${from}.`
  return (
    <footer className="output-footer" title={`Retrieval strategy: ${meta.strategy ?? 'unknown'}`}>
      {text}
    </footer>
  )
}

// The modern clipboard API needs a secure context (https or localhost) and permission.
// If it fails, fall back to the old trick: select text in a hidden textarea and run "copy".
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy') // deprecated but still the only fallback
    area.remove()
    return ok
  }
}

// Blob + temporary <a download> is the standard way to save generated text as a file.
function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
