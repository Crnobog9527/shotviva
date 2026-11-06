import { z } from 'zod'

// Opaque keyset cursors (AGENTS §5.1 rule 4): a timestamp and the row's uuid. Anything that
// does not parse reads as "first page" rather than an error.
export const PAGE_SIZE = 30

const cursorSchema = z.object({
  c: z.string().regex(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+([+-]\d{2}(:?\d{2})?|Z)?$/),
  i: z.uuid(),
})
export type TimeCursor = z.infer<typeof cursorSchema>

export function encodeCursor(cursor: TimeCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string | null | undefined): TimeCursor | null {
  if (!raw) return null
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// PostgREST `or` filter for rows after the cursor in (created_at desc, id desc) order.
// Timestamps are double-quoted because they carry ':' and '+'.
export function afterCreated(cursor: TimeCursor): string {
  const c = `"${cursor.c}"`
  return `created_at.lt.${c},and(created_at.eq.${c},id.lt.${cursor.i})`
}
