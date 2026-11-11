// Keyset cursor for the review lists (AGENTS §5.1 第 4 条): "<timestamp>|<uuid>", the last row's
// sort key. Anything malformed reads as the first page.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Cursor = { at: string; id: string }

export function encodeCursor(cursor: Cursor): string {
  return `${cursor.at}|${cursor.id}`
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null
  const [at, id, ...rest] = raw.split('|')
  if (rest.length > 0 || !at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) return null
  return { at: new Date(at).toISOString(), id }
}

// PostgREST filter for "after this row" in the given direction on (column, id).
export function afterFilter(column: string, cursor: Cursor, ascending: boolean): string {
  const op = ascending ? 'gt' : 'lt'
  return `${column}.${op}.${cursor.at},and(${column}.eq.${cursor.at},id.${op}.${cursor.id})`
}
