import { parseBlocks } from './blocks'
import { numberHeadings } from './ids'
import type { Block, TocEntry } from './types'

export type ParsedPost = { blocks: Block[]; toc: TocEntry[] }

// The post's Markdown as a tree plus its h2 / h3 contents list. Pure and synchronous, so the
// editor's preview and the public page draw the same thing.
export function parseMarkdown(source: string): ParsedPost {
  const blocks = parseBlocks(source)
  return { blocks, toc: numberHeadings(blocks) }
}

export type { Block, Inline, ListItem, TocEntry } from './types'
export { plainText } from './inline'
