import { z } from 'zod'

// What a dense-text poster says (ARCHITECTURE §5.3): five blocks the user confirms before any
// image is made. Pure and shared by the editor, the API and generation, so no server-only here.

export const POSTER_BLOCKS = ['header', 'prizes', 'sections', 'table', 'footer'] as const
export type PosterBlock = (typeof POSTER_BLOCKS)[number]

export const POSTER_LIMITS = {
  prizeRows: 20,
  sections: 8,
  sectionLines: 10,
  line: 120,
  tableColumns: { min: 2, max: 5 },
  tableRows: 40,
  cell: 10,
  phones: 3,
  totalChars: 4000,
} as const

// Control and invisible characters never reach the model; a full-width space (U+3000) stays,
// because posters use it to line up columns. Each value is one line.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g')
export const cleanPosterLine = (value: string): string => value.replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').trim()

const text = (max: number) => z.string().transform(cleanPosterLine).pipe(z.string().max(max)).default('')

export const headerSchema = z.object({
  brand: text(24), brandEn: text(48), cup: text(16), cupEn: text(32), city: text(16),
  title: text(16), subtitle: text(32), datetimeLabel: text(12), datetime: text(24),
})

export const prizeRowSchema = z.object({ rank: text(8), rankEn: text(16), prize: text(40) })

export const prizesSchema = z.object({
  headline: text(20), note: text(24),
  rows: z.array(prizeRowSchema).max(POSTER_LIMITS.prizeRows).default([]),
})

export const SECTION_STYLES = ['kv', 'numbered', 'plain'] as const
export const sectionSchema = z.object({
  title: text(12),
  style: z.enum(SECTION_STYLES).default('plain'),
  lines: z.array(text(POSTER_LIMITS.line)).max(POSTER_LIMITS.sectionLines),
})

// A break row spans the whole table ("休息　用餐40分钟"); a data row has one cell per column.
export const tableRowSchema = z.union([z.array(text(POSTER_LIMITS.cell)), z.object({ break: text(30) })])
export type TableRow = z.infer<typeof tableRowSchema>

export const tableSchema = z.object({
  title: text(16), titleEn: text(24),
  columns: z.array(text(POSTER_LIMITS.cell)).min(POSTER_LIMITS.tableColumns.min).max(POSTER_LIMITS.tableColumns.max),
  rows: z.array(tableRowSchema).max(POSTER_LIMITS.tableRows),
  footnote: text(60),
}).refine((table) => table.rows.every((row) => !Array.isArray(row) || row.length === table.columns.length), {
  message: 'every table row needs one cell per column', path: ['rows'],
})

export const footerSchema = z.object({
  phones: z.array(text(20)).max(POSTER_LIMITS.phones).default([]),
  phonesLabel: text(12), addressLabel: text(12), address: text(60), qrLabel: text(12),
})

export const posterContentSchema = z.object({
  header: headerSchema.default(headerSchema.parse({})),
  prizes: prizesSchema.nullable().default(null),
  sections: z.array(sectionSchema).max(POSTER_LIMITS.sections).default([]),
  table: tableSchema.nullable().default(null),
  footer: footerSchema.default(footerSchema.parse({})),
}).refine((content) => posterChars(content) <= POSTER_LIMITS.totalChars, {
  message: `a poster set holds at most ${POSTER_LIMITS.totalChars} characters`,
})

export type PosterContent = z.infer<typeof posterContentSchema>
export type PosterSection = z.infer<typeof sectionSchema>
export type PosterTable = z.infer<typeof tableSchema>
export type PosterPrizes = z.infer<typeof prizesSchema>

// Every string the user confirmed, with where it sits ("prizes.rows.2.prize"); the verbatim
// check and the character count both walk this.
export function posterStrings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return value ? [{ path, text: value }] : []
  if (Array.isArray(value)) return value.flatMap((item, index) => posterStrings(item, join(path, String(index))))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => (key === 'style' ? [] : posterStrings(item, join(path, key))))
  }
  return []
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key)

export const posterChars = (content: unknown): number =>
  posterStrings(content).reduce((sum, item) => sum + [...item.text].length, 0)

// Characters of the body text a kind's capacity counts: the sections' titles and lines.
export const sectionChars = (sections: readonly PosterSection[]): number =>
  sections.reduce((sum, section) => sum + [...section.title].length + section.lines.reduce((n, line) => n + [...line].length, 0), 0)
