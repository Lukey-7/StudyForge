import { useEffect, useState } from 'react'

let mermaidPromise = null
let renderCounter = 0

// Mermaid is large (~1 MB), so it is loaded only the first time a mind map is shown
// (dynamic import = Vite puts it in a separate chunk). initialize() runs once.
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
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

  if (error) {
    return (
      <div className="stack">
        <p className="error-text">Could not draw the mind map: {error}</p>
        <pre className="code-block">{code}</pre>
      </div>
    )
  }
  if (!svg) return <p className="muted">Drawing mind map…</p>

  // The SVG string comes from mermaid (securityLevel 'strict' sanitises labels), not straight from the model.
  return <div className="mindmap" dangerouslySetInnerHTML={{ __html: svg }} />
}
