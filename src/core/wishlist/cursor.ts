import { z } from 'zod'

// Opaque keyset cursors (AGENTS §5.1 rule 4). The browser hands them back as-is; anything
// that does not parse is treated as "first page" rather than an error.
export const PAGE_SIZE = 30

// Wall position: the last card's status phase and sort key (votes, newest, id).
const wallCursorSchema = z.object({
  s: z.enum(['shipped', 'live']),
  v: z.number().int(),
  c: z.string().min(1),
  i: z.uuid(),
})
export type WallCursor = z.infer<typeof wallCursorSchema>

// My requests position: newest first, id as the tie-breaker.
const timeCursorSchema = z.object({ c: z.string().min(1), i: z.uuid() })
export type TimeCursor = z.infer<typeof timeCursorSchema>

export function encodeCursor(cursor: WallCursor | TimeCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decode<T>(schema: z.ZodType<T>, raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const decodeWallCursor = (raw: string | null | undefined) => decode(wallCursorSchema, raw)
export const decodeTimeCursor = (raw: string | null | undefined) => decode(timeCursorSchema, raw)

// PostgREST `or` filter for "after this row" in a (votes desc, created_at desc, id desc)
// order. Values are double-quoted because timestamps carry ':' and '+'.
export function afterVotes(cursor: Pick<WallCursor, 'v' | 'c' | 'i'>): string {
  const c = `"${cursor.c}"`
  return `votes_count.lt.${cursor.v},and(votes_count.eq.${cursor.v},created_at.lt.${c}),and(votes_count.eq.${cursor.v},created_at.eq.${c},id.lt.${cursor.i})`
}

// The same for a (created_at desc, id desc) order.
export function afterTime(cursor: TimeCursor): string {
  const c = `"${cursor.c}"`
  return `created_at.lt.${c},and(created_at.eq.${c},id.lt.${cursor.i})`
}
