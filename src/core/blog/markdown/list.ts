import { parseBlocks } from './blocks'
import { parseInline } from './inline'
import type { Block, Hit, ListItem } from './types'

// Bullet and numbered lists. An item's later lines either continue its sentence or, when
// indented under it, hold its own paragraphs and nested lists.

const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/

export const isListLine = (line: string) => ITEM.test(line)

type Draft = { first: string[]; rest: string[] }

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

// Whether the next non-blank line after a blank still belongs to the list.
function continues(lines: readonly string[], from: number, base: number): boolean {
  const next = lines.slice(from).find((line) => line.trim() !== '')
  if (next === undefined) return false
  const item = ITEM.exec(next)
  return item ? item[1].length >= base : indentOf(next) > base
}

type Scan = { drafts: Draft[]; end: number }

// What one line does to the list being read: starts an item, continues the last one, or ends
// the list (returns false).
function take(lines: readonly string[], at: number, base: number, ordered: boolean, drafts: Draft[], startsBlock: (line: string) => boolean): boolean {
  const line = lines[at]
  const item = ITEM.exec(line)
  if (item && item[1].length <= base) {
    if (/\d/.test(item[2]) !== ordered) return false
    drafts.push({ first: [item[3]], rest: [] })
    return true
  }
  return continuation(lines, at, base, drafts, startsBlock)
}

// A line that is not a new item: a blank, an indented line under the last item, or the next
// words of its sentence. false when it belongs to whatever comes after the list.
function continuation(lines: readonly string[], at: number, base: number, drafts: Draft[], startsBlock: (line: string) => boolean): boolean {
  const line = lines[at]
  const last = drafts.at(-1)
  if (line.trim() === '') {
    if (!continues(lines, at + 1, base)) return false
    last?.rest.push('')
  } else if (indentOf(line) > base) {
    last?.rest.push(line.slice(Math.min(indentOf(line), base + 2)))
  } else if (startsBlock(line)) return false
  else last?.first.push(line.trim())
  return true
}

function scan(lines: readonly string[], from: number, base: number, ordered: boolean, startsBlock: (line: string) => boolean): Scan {
  const drafts: Draft[] = []
  let end = from
  while (end < lines.length && take(lines, end, base, ordered, drafts, startsBlock)) end++
  return { drafts, end }
}

export function listBlock(lines: readonly string[], i: number, startsBlock: (line: string) => boolean): Hit<Block> {
  const head = ITEM.exec(lines[i])
  if (!head) return null
  const ordered = /\d/.test(head[2])
  const { drafts, end } = scan(lines, i, head[1].length, ordered, startsBlock)
  const items: ListItem[] = drafts.map((draft) => ({ c: parseInline(draft.first.join(' ')), children: parseBlocks(draft.rest.join('\n')) }))
  return { node: { t: 'list', ordered, items }, end }
}
