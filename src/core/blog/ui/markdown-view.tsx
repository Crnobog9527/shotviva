import type { ReactNode } from 'react'

import { isExternal } from '../markdown/url'
import type { Block, Inline, ListItem } from '../markdown'

// Draws a parsed post. Every element here is chosen by this file, never copied from the
// source, and every address went through markdown/url.ts, so a post cannot inject markup.

function InlineView({ nodes }: { nodes: readonly Inline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text':
        return node.v
      case 'code':
        return <code key={i}>{node.v}</code>
      case 'strong':
        return <strong key={i}><InlineView nodes={node.c} /></strong>
      case 'em':
        return <em key={i}><InlineView nodes={node.c} /></em>
      case 'image':
        // eslint-disable-next-line @next/next/no-img-element -- an author's own https or /assets address, any size
        return <img key={i} src={node.src} alt={node.alt} loading="lazy" decoding="async" />
      case 'link':
        return (
          <a key={i} href={node.href} {...(isExternal(node.href) ? { rel: 'noopener', target: '_blank' } : {})}>
            <InlineView nodes={node.c} />
          </a>
        )
    }
  })
}

// A paragraph that holds one image and nothing else is a figure; its alt text is the caption.
function loneImage(nodes: readonly Inline[]): Extract<Inline, { t: 'image' }> | null {
  const [only] = nodes
  return nodes.length === 1 && only.t === 'image' ? only : null
}

function ListView({ ordered, items }: { ordered: boolean; items: readonly ListItem[] }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List>
      {items.map((item, i) => (
        <li key={i}>
          <InlineView nodes={item.c} />
          <BlocksView blocks={item.children} />
        </li>
      ))}
    </List>
  )
}

function TableView({ block }: { block: Extract<Block, { t: 'table' }> }) {
  const style = (col: number) => (block.align[col] ? { textAlign: block.align[col] as 'left' | 'center' | 'right' } : undefined)
  return (
    <div className="mk-blog-table" tabIndex={0} role="region" aria-label="Table">
      <table>
        <thead>
          <tr>
            {block.head.map((cell, col) => (
              <th key={col} scope="col" style={style(col)}><InlineView nodes={cell} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, col) => (
                <td key={col} style={style(col)}><InlineView nodes={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeadingView({ block }: { block: Extract<Block, { t: 'heading' }> }) {
  const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4'
  return <Tag id={block.id || undefined}><InlineView nodes={block.c} /></Tag>
}

function ParagraphView({ nodes }: { nodes: readonly Inline[] }) {
  const image = loneImage(nodes)
  if (!image) return <p><InlineView nodes={nodes} /></p>
  return <figure><InlineView nodes={nodes} />{image.alt ? <figcaption>{image.alt}</figcaption> : null}</figure>
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'heading':
      return <HeadingView block={block} />
    case 'p':
      return <ParagraphView nodes={block.c} />
    case 'list':
      return <ListView ordered={block.ordered} items={block.items} />
    case 'quote':
      return <blockquote><BlocksView blocks={block.c} /></blockquote>
    case 'code':
      return <pre><code>{block.v}</code></pre>
    case 'hr':
      return <hr />
    case 'table':
      return <TableView block={block} />
  }
}

export function BlocksView({ blocks }: { blocks: readonly Block[] }) {
  return blocks.map((block, i) => <BlockView key={i} block={block} />)
}
