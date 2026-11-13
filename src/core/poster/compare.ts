import { posterStrings, type PosterContent } from './content'
import { normalizeForMatch } from './verbatim'
import type { PosterPart } from './split'

// 自动核对 (ARCHITECTURE §5.3): every string the user confirmed for one poster, compared with the
// lines a vision model read off the finished image. A confirmed string counts as found when its
// normalized form (NFKC, no whitespace) sits inside the normalized reading. For one that is not,
// the closest line read is shown next to it, so the user sees what the poster says instead.

export type PosterDiff = { path: string; expected: string; seen: string }

// The confirmed strings this poster shows: header and footer, and only its own blocks. A table
// row is compared as one line (its cells in order), so a wrong number points at its row.
export function partStrings(content: PosterContent, part: PosterPart): { path: string; text: string }[] {
  const table = part.table && {
    title: part.table.title, titleEn: part.table.titleEn, columns: part.table.columns, footnote: part.table.footnote,
    rows: part.table.rows.map((row) => (Array.isArray(row) ? row.join(' ') : row.break)),
  }
  const info = part.sections ? content.info : undefined
  return posterStrings({ header: content.header, prizes: part.prizes, info, sections: part.sections, table, footer: content.footer })
}

// 1 − edit distance / longer length: one wrong digit in "2 200" still finds "2 280" first.
function similarity(a: string, b: string): number {
  if (!a || !b) return a === b ? 1 : 0
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length)
}

function closest(expected: string, lines: readonly string[]): string {
  const target = normalizeForMatch(expected)
  let best = { line: '', score: 0 }
  for (const line of lines) {
    const score = similarity(target, normalizeForMatch(line))
    if (score > best.score) best = { line, score }
  }
  return best.score >= 0.5 ? best.line : ''
}

export function compareReading(expected: readonly { path: string; text: string }[], lines: readonly string[]): PosterDiff[] {
  const reading = normalizeForMatch(lines.join(''))
  return expected
    .filter(({ text }) => !reading.includes(normalizeForMatch(text)))
    .map(({ path, text }) => ({ path, expected: text, seen: closest(text, lines) }))
}
