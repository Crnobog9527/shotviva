import { parseMarkdown } from '../markdown'
import { BlocksView } from './markdown-view'
import './blog.css'

// The admin editor's preview: the same tree, the same classes as the public page's text.
export function PostPreview({ source }: { source: string }) {
  return (
    <div className="mk-blog">
      <div className="mk-blog-text" style={{ marginTop: 0 }}>
        <BlocksView blocks={parseMarkdown(source).blocks} />
      </div>
    </div>
  )
}
