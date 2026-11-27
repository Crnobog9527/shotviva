import { plainText } from './inline'
import type { Block, TocEntry } from './types'

// Heading ids for the contents list and #links: the heading's words, lower case, letters and
// numbers (Chinese included) kept and everything else a dash; a repeat gets -2, -3.

export function slugOfHeading(text: string): string {
  const slug = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return slug || 'section'
}

// Sets every top-level heading's id, in place, and returns the h2 / h3 entries for the contents.
export function numberHeadings(blocks: Block[]): TocEntry[] {
  const seen = new Map<string, number>()
  const toc: TocEntry[] = []
  for (const block of blocks) {
    if (block.t !== 'heading') continue
    const base = slugOfHeading(plainText(block.c))
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    block.id = count === 1 ? base : `${base}-${count}`
    if (block.level !== 4) toc.push({ id: block.id, text: plainText(block.c), level: block.level })
  }
  return toc
}
