import { parseInline } from './inline'
import { isListLine, listBlock } from './list'
import { tableBlock } from './table'
import type { Block, Hit } from './types'

// Block syntax, one line at a time. Each rule looks at the line it is given and either takes
// the lines that are its own or returns null; the first rule that takes some wins.

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>\s?(.*)$/

// A post's own title is the page's one H1, so # and ## both make a section (h2), ### a
// subsection (h3), and anything deeper h4.
const levelOf = (marks: number): 2 | 3 | 4 => (marks <= 2 ? 2 : marks === 3 ? 3 : 4)

const startsBlock = (line: string): boolean =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || isListLine(line)

function fenced(lines: readonly string[], i: number): Hit<Block> {
  const open = FENCE.exec(lines[i])
  if (!open) return null
  let end = i + 1
  const body: string[] = []
  while (end < lines.length && !lines[end].trim().startsWith(open[1])) body.push(lines[end++])
  return { node: { t: 'code', lang: open[2], v: body.join('\n') }, end: end + 1 }
}

function heading(lines: readonly string[], i: number): Hit<Block> {
  const match = HEADING.exec(lines[i])
  // The id is set once the whole post is parsed (ids.ts), so repeats can be told apart.
  return match ? { node: { t: 'heading', level: levelOf(match[1].length), id: '', c: parseInline(match[2]) }, end: i + 1 } : null
}

const rule = (lines: readonly string[], i: number): Hit<Block> => (RULE.test(lines[i]) ? { node: { t: 'hr' }, end: i + 1 } : null)

function quote(lines: readonly string[], i: number): Hit<Block> {
  if (!QUOTE.test(lines[i])) return null
  const inner: string[] = []
  let end = i
  while (end < lines.length && QUOTE.test(lines[end])) {
    inner.push((QUOTE.exec(lines[end]) as RegExpExecArray)[1])
    end++
  }
  return { node: { t: 'quote', c: parseBlocks(inner.join('\n')) }, end }
}

function paragraph(lines: readonly string[], i: number): Hit<Block> {
  let end = i + 1
  while (end < lines.length && lines[end].trim() !== '' && !startsBlock(lines[end]) && !tableBlock(lines, end)) end++
  return { node: { t: 'p', c: parseInline(lines.slice(i, end).map((line) => line.trim()).join(' ')) }, end }
}

const RULES = [fenced, heading, rule, quote, (lines: readonly string[], i: number) => listBlock(lines, i, startsBlock), tableBlock, paragraph]

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++
      continue
    }
    const hit = RULES.reduce<Hit<Block>>((found, take) => found ?? take(lines, i), null) as NonNullable<Hit<Block>>
    blocks.push(hit.node)
    i = hit.end
  }
  return blocks
}
