import { z } from 'zod'

import { cleanPosterLine, posterContentSchema, type PosterContent } from '@/core/poster'

// The JSON shape the text model fills when it sorts pasted text into the five blocks
// (ARCHITECTURE §5.3). Strict structured output wants every property present and one type per
// property, and an absent block is empty; toContent turns the answer into PosterContent.
// Rows are plain string lists rather than objects: a prize row is [rank, rankEn, prize] and a
// table row is its cells, or one string for a break row. Repeating keys on every row was half
// of the answer's tokens, and the wait is spent writing tokens (2026-11-14: 1990 → 1070 tokens,
// about 11 s → 7 s for the sample notice).

const str = { type: 'string' } as const
const strings = { type: 'array', items: str } as const
const object = (properties: Record<string, unknown>) =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }) as const

export const EXTRACT_JSON_SCHEMA = object({
  header: object({ brand: str, brandEn: str, cup: str, cupEn: str, city: str, title: str, subtitle: str, datetimeLabel: str, datetime: str }),
  prizes: object({ headline: str, note: str, rows: { type: 'array', description: 'one row per rank: [rank, rankEn, prize]', items: strings } }),
  info: object({ title: str, titleEn: str }),
  sections: { type: 'array', items: object({ title: str, style: { type: 'string', enum: ['kv', 'numbered', 'plain'] }, lines: strings }) },
  table: object({
    title: str, titleEn: str, columns: strings, footnote: str,
    rows: { type: 'array', description: 'a data row is one cell per column; a break or rest row is one string, its words', items: strings },
  }),
  footer: object({ phones: strings, phonesLabel: str, addressLabel: str, address: str, qrLabel: str }),
})

// Appended to the template's own instructions: how rows are written in this shape, and no
// indentation (pretty-printed JSON cost a third more tokens for nothing).
export const EXTRACT_FORMAT_NOTE = 'Answer format: write the JSON on one line, without indentation. prizes.rows: each row is [rank, rankEn, prize]. table.rows: a data row has one cell per column; a break or rest row is a list with one string, its words.'

const answerSchema = z.object({
  header: z.record(z.string(), z.string()),
  prizes: z.object({ headline: z.string(), note: z.string(), rows: z.array(z.array(z.string())) }),
  info: z.object({ title: z.string(), titleEn: z.string() }).optional(),
  sections: z.array(z.object({ title: z.string(), style: z.string(), lines: z.array(z.string()) })),
  table: z.object({ title: z.string(), titleEn: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())), footnote: z.string() }),
  footer: z.object({ phones: z.array(z.string()), phonesLabel: z.string(), addressLabel: z.string(), address: z.string(), qrLabel: z.string() }),
})

// A data row is padded or cut to the column count: the editor shows the mismatch as empty cells
// rather than refusing the whole answer. A one-string row in a wider table is a break row.
function tableOf(table: z.infer<typeof answerSchema>['table']) {
  if (table.columns.length < 2) return null
  const columns = table.columns.slice(0, 5)
  const width = columns.length
  const rows = table.rows.filter((row) => row.some((cell) => cell.trim()))
    .map((row) => (row.filter((cell) => cell.trim()).length === 1 && !row[1]?.trim() ? { break: row.find((cell) => cell.trim())! }
      : Array.from({ length: width }, (_, i) => row[i] ?? '')))
  return { ...table, columns, rows }
}

// [rank, rankEn, prize]; a two-item row whose second item is not English is [rank, prize].
const prizeRowsOf = (rows: string[][]) => rows.filter((row) => row.some((cell) => cell.trim())).map(([rank = '', second = '', ...prize]) =>
  (prize.length === 0 && !/^[A-Za-z][A-Za-z .'-]*$/.test(second) ? { rank, rankEn: '', prize: second } : { rank, rankEn: second, prize: prize.join(' ') }))

// Cut to at most max characters, counted as the schema counts them (an emoji is one), so an
// emoji is never split in half.
const cut = (value: string, max: number): string => Array.from(value).slice(0, max).join('')

type Issue = { code: string; origin?: string; maximum?: number | bigint; path: PropertyKey[] }
const clippable = (issue: Issue) => issue.code === 'too_big' && (issue.origin === 'string' || issue.origin === 'array') && issue.maximum != null

// Cuts the value an issue points at to the limit it names; false when the path no longer leads to one.
function clip(root: Record<string, unknown>, issue: Issue): boolean {
  const keys = issue.path
  let parent: unknown = root
  for (const key of keys.slice(0, -1)) parent = (parent as Record<PropertyKey, unknown> | undefined)?.[key]
  const last = keys.at(-1)
  if (!parent || typeof parent !== 'object' || last == null) return false
  const holder = parent as Record<PropertyKey, unknown>
  const value = holder[last]
  const max = Number(issue.maximum)
  if (typeof value === 'string') holder[last] = cut(cleanPosterLine(value), max)
  else if (Array.isArray(value)) holder[last] = value.slice(0, max)
  else return false
  return true
}

// The model's answer as content the editor can open. A value or list past its limit is cut to fit
// rather than failing the whole answer, and its path comes back in clipped so the editor shows it
// in yellow (a long 时间 line once failed a real notice). Anything else wrong still throws; the
// caller then hands the text back for the user to sort by hand.
export function toContent(json: unknown): { content: PosterContent; clipped: string[] } {
  const answer = answerSchema.parse(json)
  const draft: Record<string, unknown> = {
    header: answer.header,
    prizes: answer.prizes.rows.length > 0 || answer.prizes.headline ? { ...answer.prizes, rows: prizeRowsOf(answer.prizes.rows) } : null,
    ...(answer.info ? { info: answer.info } : {}),
    sections: answer.sections.filter((section) => section.title || section.lines.length > 0),
    table: tableOf(answer.table),
    footer: answer.footer,
  }
  const clipped = new Set<string>()
  for (let round = 0; round < 4; round += 1) {
    const result = posterContentSchema.safeParse(draft)
    if (result.success) return { content: result.data, clipped: [...clipped] }
    const issues = result.error.issues as Issue[]
    if (!issues.every(clippable) || !issues.every((issue) => clip(draft, issue))) throw result.error
    for (const issue of issues) clipped.add(issue.path.map(String).join('.'))
  }
  return { content: posterContentSchema.parse(draft), clipped: [...clipped] }
}
