import { z } from 'zod'

import { posterContentSchema, type PosterContent } from '@/core/poster'

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
  sections: { type: 'array', items: object({ title: str, style: { type: 'string', enum: ['kv', 'numbered', 'plain'] }, lines: strings }) },
  table: object({ title: str, titleEn: str, columns: strings, rows: { type: 'array', items: object({ cells: strings, break: str }) }, footnote: str }),
  footer: object({ phones: strings, phonesLabel: str, addressLabel: str, address: str, qrLabel: str }),
})

const answerSchema = z.object({
  header: z.record(z.string(), z.string()),
  prizes: z.object({ headline: z.string(), note: z.string(), rows: z.array(z.object({ rank: z.string(), rankEn: z.string(), prize: z.string() })) }),
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

// The model's answer as content the editor can open. Values past a limit fail here; the caller
// then hands the text back for the user to sort by hand.
export function toContent(json: unknown): PosterContent {
  const answer = answerSchema.parse(json)
  return posterContentSchema.parse({
    header: answer.header,
    prizes: answer.prizes.rows.length > 0 || answer.prizes.headline ? answer.prizes : null,
    sections: answer.sections.filter((section) => section.title || section.lines.length > 0),
    table: tableOf(answer.table),
    footer: answer.footer,
  })
}
