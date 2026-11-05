import { z } from 'zod'

// Keyset cursors for admin lists (AGENTS §5.1 rule 4): newest first by (created_at, id), one
// page of PAGE_SIZE. Opaque to the browser; anything that does not parse means "first page".
export const PAGE_SIZE = 30

const cursorSchema = z.object({ c: z.string().min(1), i: z.union([z.uuid(), z.string().regex(/^\d+$/)]) })
export type TimeCursor = z.infer<typeof cursorSchema>

export function encodeCursor(row: { created_at: string; id: string | number }): string {
  return Buffer.from(JSON.stringify({ c: row.created_at, i: String(row.id) })).toString('base64url')
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
export function afterCursor(cursor: TimeCursor): string {
  const c = `"${cursor.c}"`
  return `created_at.lt.${c},and(created_at.eq.${c},id.lt.${cursor.i})`
}

export type Page<T> = { items: T[]; nextCursor: string | null }

// Asks for one extra row to know whether another page exists.
export function toPage<T extends { created_at: string; id: string | number }, U>(
  rows: readonly T[],
  map: (row: T) => U,
): Page<U> {
  const items = rows.slice(0, PAGE_SIZE)
  const last = items.at(-1)
  return { items: items.map(map), nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null }
}
