import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Markdown renderer used everywhere (GFM = tables, strike-through, task lists).
// react-markdown builds React elements and does NOT render raw HTML, so model output
// can't inject scripts into the page.
export default function Markdown({ children, components }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
