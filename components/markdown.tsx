import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders author-written Markdown (GFM tables, lists, code). Raw HTML is never rendered —
 * react-markdown ignores it unless `rehype-raw` is added — and its default `urlTransform`
 * drops `javascript:` URLs, so stored text cannot inject markup. Styles live under `.markdown`
 * in app/globals.css.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
