import { posterStrings, type PosterContent } from './content'
import { normalizeForMatch } from './verbatim'
import type { PosterPart } from './split'

// 自动核对 (ARCHITECTURE §5.3): every string the user confirmed for one poster, compared with the
// lines a vision model read off the finished image. A confirmed string counts as found when its
// normalized form (NFKC, no whitespace) sits inside the normalized reading. For one that is not,
// the closest line read is shown next to it, so the user sees what the poster says instead.

// kind: absent for a confirmed line not found (or found changed); 'extra' for a line on the poster
// that is in none of the confirmed text (an invented header row, a made-up table row); 'repeated'
// for a table row drawn more often than it was confirmed.
export type PosterDiff = { path: string; expected: string; seen: string; kind?: 'extra' | 'repeated' }

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

type Expected = readonly { path: string; text: string }[]

export function compareReading(expected: Expected, lines: readonly string[]): PosterDiff[] {
  const reading = normalizeForMatch(lines.join(''))
  const extras = extraLines(expected, lines)
  const unexplained = extras.map((diff) => diff.seen)
  // A changed line is usually one of the lines nothing confirmed explains: shown next to it there,
  // and not reported a second time as added.
  const missing = expected
    .filter(({ text }) => !reading.includes(normalizeForMatch(text)))
    .map(({ path, text }): PosterDiff => ({ path, expected: text, seen: closest(text, unexplained) || closest(text, lines) }))
  const shown = new Set(missing.map((diff) => diff.seen))
  return [...missing, ...repeatedRows(expected, lines), ...extras.filter((diff) => !shown.has(diff.seen))]
}

// Punctuation, symbols and a drawn list number ("1." before a numbered line) are layout, not text
// the user typed: ignored when deciding whether a line read off the poster was confirmed.
const LIST_NUMBER = /^\s*\d{1,2}\s*[.、．)]\s*/u
const loose = (text: string) => normalizeForMatch(text.replace(LIST_NUMBER, '')).replace(/[\p{P}\p{S}]/gu, '')

// A line counts as confirmed once every confirmed string it contains is taken out and what is left
// is under two characters or part of the confirmed text (a reader may merge "开赛时间" and "14:00",
// or read one wrapped line as two). Anything else is text the model added.
function extraLines(expected: Expected, lines: readonly string[]): PosterDiff[] {
  const pieces = [...new Set(expected.map(({ text }) => loose(text)).filter(Boolean))].sort((a, b) => b.length - a.length)
  const all = expected.map(({ text }) => loose(text)).join('')
  return lines.flatMap((line, i) => {
    const read = loose(line)
    const rest = pieces.reduce((left, piece) => left.split(piece).join(''), read)
    // A long line the poster wraps is read as pieces of one confirmed line: still confirmed.
    const added = !all.includes(read) && [...rest].length >= 2 && !all.includes(rest)
    return added ? [{ path: `extra.${i}`, expected: '', seen: line, kind: 'extra' as const }] : []
  })
}

// A table row read on more lines than it was confirmed (one row drawn twice).
function repeatedRows(expected: Expected, lines: readonly string[]): PosterDiff[] {
  const rows = expected.filter(({ path }) => /^table\.rows\.\d+$/.test(path))
  const read = lines.map(loose)
  const reported = new Set<string>()
  return rows.flatMap(({ path, text }) => {
    const key = loose(text)
    const confirmed = rows.filter((row) => loose(row.text) === key).length
    if (reported.has(key) || read.filter((line) => line === key).length <= confirmed) return []
    reported.add(key)
    return [{ path: `${path}.repeated`, expected: text, seen: text, kind: 'repeated' as const }]
  })
}
