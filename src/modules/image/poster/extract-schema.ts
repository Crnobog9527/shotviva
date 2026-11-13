import { z } from 'zod'

import { cleanPosterLine, posterContentSchema, type PosterContent } from '@/core/poster'

// The JSON shape the text model fills when it sorts pasted text into the five blocks
// (ARCHITECTURE §5.3). Strict structured output wants every property present and one type per
// property, so a table row is { cells, break } here (break '' for a data row) and an absent block
// is empty; toContent turns that into PosterContent.

const str = { type: 'string' } as const
const strings = { type: 'array', items: str } as const
const object = (properties: Record<string, unknown>) =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }) as const

export const EXTRACT_JSON_SCHEMA = object({
  header: object({ brand: str, brandEn: str, cup: str, cupEn: str, city: str, title: str, subtitle: str, datetimeLabel: str, datetime: str }),
  prizes: object({ headline: str, note: str, rows: { type: 'array', items: object({ rank: str, rankEn: str, prize: str }) } }),
  info: object({ title: str, titleEn: str }),
  sections: { type: 'array', items: object({ title: str, style: { type: 'string', enum: ['kv', 'numbered', 'plain'] }, lines: strings }) },
  table: object({ title: str, titleEn: str, columns: strings, rows: { type: 'array', items: object({ cells: strings, break: str }) }, footnote: str }),
  footer: object({ phones: strings, phonesLabel: str, addressLabel: str, address: str, qrLabel: str }),
})

const answerSchema = z.object({
  header: z.record(z.string(), z.string()),
  prizes: z.object({ headline: z.string(), note: z.string(), rows: z.array(z.object({ rank: z.string(), rankEn: z.string(), prize: z.string() })) }),
  info: z.object({ title: z.string(), titleEn: z.string() }).optional(),
  sections: z.array(z.object({ title: z.string(), style: z.string(), lines: z.array(z.string()) })),
  table: z.object({
    title: z.string(), titleEn: z.string(), columns: z.array(z.string()),
    rows: z.array(z.object({ cells: z.array(z.string()), break: z.string() })), footnote: z.string(),
  }),
  footer: z.object({ phones: z.array(z.string()), phonesLabel: z.string(), addressLabel: z.string(), address: z.string(), qrLabel: z.string() }),
})

// A data row is padded or cut to the column count: the editor shows the mismatch as empty cells
// rather than refusing the whole answer.
function tableOf(table: z.infer<typeof answerSchema>['table']) {
  if (table.columns.length < 2) return null
  const columns = table.columns.slice(0, 5)
  const width = columns.length
  const rows = table.rows.map((row) => (row.break.trim() && row.cells.every((cell) => !cell.trim())
    ? { break: row.break }
    : Array.from({ length: width }, (_, i) => row.cells[i] ?? '')))
  return { ...table, columns, rows }
}

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
    prizes: answer.prizes.rows.length > 0 || answer.prizes.headline ? answer.prizes : null,
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
