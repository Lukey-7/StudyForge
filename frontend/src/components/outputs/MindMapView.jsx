import { useEffect, useState } from 'react'
import { SPINE_COLORS } from '../../lib/format'
import MindTree from './MindTree'

let mermaidPromise = null
let renderCounter = 0
export const nextMermaidId = (prefix) => `${prefix}-${++renderCounter}`

// Mermaid's "base" theme is the one that honours themeVariables, so we feed it our tokens.
// Mind map branches use the cScale0..N colours; we reuse the notebook spine palette with dark text.
function themeVariables() {
  const vars = {
    background: '#24302B',
    primaryColor: '#2E3B35',
    primaryTextColor: '#ECE9DF',
    primaryBorderColor: '#9DA69D',
    lineColor: '#9DA69D',
    fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
    fontSize: '15px',
    // the mind map's root node is drawn with the git0 colours: make it chalk with dark text
    git0: '#ECE9DF',
    gitBranchLabel0: '#1A2320',
  }
  for (let i = 0; i < 12; i++) {
    vars[`cScale${i}`] = SPINE_COLORS[i % SPINE_COLORS.length]
    vars[`cScaleLabel${i}`] = '#1A2320'
  }
  return vars
}

// Mermaid is large (~1 MB), so it is loaded only the first time a mind map is shown
// (dynamic import = Vite puts it in a separate chunk). initialize() runs once.
export function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: themeVariables(), securityLevel: 'strict' })
      return mermaid
    })
  }
  return mermaidPromise
}

export default function MindMapView({ output }) {
  const code = output.mermaid || ''
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) return undefined
    let cancelled = false // ignore a slow render if the component changed/unmounted meanwhile
    const id = `mindmap-${++renderCounter}` // mermaid needs a unique element id per render

    loadMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err))
        document.getElementById(`d${id}`)?.remove() // mermaid can leave its temp node behind on failure
      })

    return () => {
      cancelled = true
    }
  }, [code])

  // No diagram code, or mermaid couldn't draw it: show the same map as an indented tree,
  // and the raw source for anyone who wants to paste it into another tool.
  if (error || !code) {
    return (
      <div className="stack">
        {error && <p className="muted small">The diagram couldn't be drawn, so here it is as a list.</p>}
        <MindTree output={output} />
        {code && (
          <details className="disclosure">
            <summary>Show the Mermaid source</summary>
            <pre className="code-block">{code}</pre>
          </details>
        )}
      </div>
    )
  }
  if (!svg) return <p className="muted">Drawing the mind map…</p>

  // The SVG string comes from mermaid (securityLevel 'strict' sanitises labels), not straight from the model.
  return <div className="mindmap" dangerouslySetInnerHTML={{ __html: svg }} />
}
