import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'

// Frame for the public pages: the shared header, a main area, the shared footer.
// `wide` drops the prose measure for pages that lay content out in columns.
export default function PublicPage({ signedIn, title, lede, wide, children }) {
  const { hash, pathname } = useLocation()

  // Client-side routing doesn't scroll to #anchors by itself; do it after the page renders.
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1))
      if (target) {
        target.scrollIntoView({ block: 'start' })
        return
      }
    }
    window.scrollTo(0, 0)
  }, [hash, pathname])

  useEffect(() => {
    document.title = `${title} · StudyForge`
    return () => {
      document.title = 'StudyForge'
    }
  }, [title])

  return (
    <div className="landing">
      <SiteHeader signedIn={signedIn} />
      <main className="public-main">
        <div className={`band-inner ${wide ? '' : 'prose'}`}>
          <h1 className="public-title">{title}</h1>
          {lede && <p className="public-lede">{lede}</p>}
          {children}
        </div>
      </main>
      <SiteFooter signedIn={signedIn} />
    </div>
  )
}
