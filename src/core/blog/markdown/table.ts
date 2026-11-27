import { parseInline } from './inline'
import type { Align, Block, Hit } from './types'

// GFM pipe tables: a header row, a separator row of dashes (colons set the alignment), body rows.

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function cells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  return right ? 'right' : left ? 'left' : null
}

export function tableBlock(lines: readonly string[], i: number): Hit<Block> {
  const header = lines[i]
  const separator = lines[i + 1]
  if (!header?.includes('|') || separator === undefined || !SEPARATOR.test(separator) || !separator.includes('-')) return null
  const head = cells(header)
  const align = cells(separator).map(alignOf)
  if (head.length !== align.length) return null
  let end = i + 2
  const rows: string[][] = []
  while (end < lines.length && lines[end].trim() !== '' && lines[end].includes('|')) rows.push(cells(lines[end++]))
  // Short rows are padded and long ones cut, so every row has one cell per column.
  const fit = (row: string[]) => head.map((_, col) => parseInline(row[col] ?? ''))
  return { node: { t: 'table', align, head: head.map((cell) => parseInline(cell)), rows: rows.map(fit) }, end }
}
